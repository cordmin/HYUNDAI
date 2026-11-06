"""검수한 수업만 Nika m4a로 제작한다. 사람 검수와 위임된 AI 검수를 구분한다."""
import argparse
import base64
import csv
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
import wave

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
MODEL = "gemini-3.8-flash-tts"
STYLE = "자연스러운 한국어 표준어로 차분하고 따뜻하게, 또렷한 수업 설명 속도로 입력 대사만 읽는다. 배경음악이나 효과음 없이 말한다."
FIELDS = ["음원 이름", "대사", "수업", "구분", "대본 SHA256", "대본 검수", "청취 검수"]


def digest(value):
    return hashlib.sha256(value).hexdigest()


def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as source:
        return list(csv.DictReader(source))


def scripts(root=ROOT, source=None):
    rows = read_csv(source or root / "voice/수업-대본.csv")
    selected = [r for prefix in ("dongbaek_", "prime_") for r in rows if r["음원 이름"].startswith(prefix)]
    ids = [r["음원 이름"] for r in selected]
    if not selected or len(ids) != len(set(ids)):
        raise ValueError("대본이 없거나 음원 이름이 중복되었습니다")
    for row in selected:
        if not re.fullmatch(r"(?:dongbaek|prime)_[a-z0-9_]+", row["음원 이름"]) or not row["대사"].strip():
            raise ValueError("음원 이름 또는 대사를 확인하세요")
        row["대본 SHA256"] = digest(row["대사"].encode())
    return selected


def prepare(rows, review):
    old = {r["음원 이름"]: r for r in read_csv(review)} if review.exists() else {}
    with review.open("w", encoding="utf-8-sig", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=FIELDS, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            previous = old.get(row["음원 이름"], {})
            same = previous.get("대본 SHA256") == row["대본 SHA256"]
            writer.writerow(dict(row, **{k: previous.get(k, "") if same else "" for k in ("대본 검수", "청취 검수")}))


def approved(rows, review):
    checks = {r["음원 이름"]: r for r in read_csv(review)}
    for row in rows:
        check = checks.get(row["음원 이름"], {})
        if check.get("대본 검수") not in ("교사 검수 완료", "사용자 위임 AI 검수 완료") or check.get("대본 SHA256") != row["대본 SHA256"] or check.get("대사") != row["대사"]:
            raise ValueError(f"{row['음원 이름']}: 현재 대사의 검수 기록이 필요합니다")


def fingerprint(row):
    return digest(json.dumps([MODEL, "Nika", STYLE, row["대사"], "aac-128k-mono-24000"], ensure_ascii=False).encode())


def current(row, output):
    audio = output / (row["음원 이름"] + ".m4a")
    try:
        meta = json.loads(audio.with_suffix(".json").read_text(encoding="utf-8"))
        return meta["fingerprint"] == fingerprint(row) and meta["sha256"] == digest(audio.read_bytes())
    except (OSError, ValueError, KeyError):
        return False


def encode(wav, m4a):
    # WAV 구조와 신호를 확인한 뒤 AAC로 변환한다. 청취 검수는 별도로 한다.
    with wave.open(str(wav), "rb") as source:
        duration = source.getnframes() / source.getframerate()
        if source.getsampwidth() != 2 or source.getnchannels() != 1 or not 0.2 < duration < 180:
            raise ValueError("예상한 PCM16 mono 수업 음원이 아닙니다")
        pcm = source.readframes(source.getnframes())
        if len(pcm) != source.getnframes() * 2:
            raise ValueError("WAV가 잘렸습니다")
        import array
        samples = array.array("h", pcm)
        if sys.byteorder != "little":
            samples.byteswap()
        rms = (sum(x * x for x in samples) / len(samples)) ** 0.5
        if rms < 10:
            raise ValueError("무음 음원입니다")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-c:a", "aac", "-b:a", "128k", "-ac", "1", "-ar", "24000", "-movflags", "+faststart", str(m4a)], check=True, capture_output=True)
    info = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(m4a)]))
    stream = info["streams"][0]
    seconds = float(info["format"]["duration"])
    if stream["codec_name"] != "aac" or stream["channels"] != 1 or abs(seconds - duration) > 0.25:
        raise ValueError("변환된 m4a 형식 또는 길이가 잘못되었습니다")
    return round(seconds, 3)


def generate(rows, output, client):
    output.mkdir(parents=True, exist_ok=True)
    # ponytail: 배치 하나만 실행한다. 여러 PC의 동시 제작은 담당 범위를 나눈 뒤 수행한다.
    lock = output / ".generation.lock"
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    try:
        for index, row in enumerate(rows):
            if index:
                time.sleep(6.3)
            clip = row["음원 이름"]
            with tempfile.TemporaryDirectory(dir=output) as temporary:
                stage = Path(temporary)
                result = client.interactions.create(
                    model=MODEL,
                    input=[{"type": "user_input", "content": [{"type": "text", "text": row["대사"], "annotations": [{"type": "speech_metadata", "style": STYLE}]}]}],
                    response_format={"type": "audio", "mime_type": "audio/wav"},
                    generation_config={"speech_config": [{"voice": "Nika"}]},
                )
                (stage / "source.wav").write_bytes(base64.b64decode(result.output_audio.data, validate=True))
                audio = stage / (clip + ".m4a")
                seconds = encode(stage / "source.wav", audio)
                meta = dict(id=clip, model=MODEL, voice="Nika", text=row["대사"], fingerprint=fingerprint(row), sha256=digest(audio.read_bytes()), seconds=seconds, review="generated_not_listening_reviewed")
                (stage / (clip + ".json")).write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
                target = output / audio.name
                if target.exists():
                    archive = output / "takes" / clip / str(time.time_ns())
                    archive.mkdir(parents=True)
                    shutil.copy2(target, archive / target.name)
                    if target.with_suffix(".json").exists():
                        shutil.copy2(target.with_suffix(".json"), archive / (clip + ".json"))
                audio.replace(target)
                (stage / (clip + ".json")).replace(target.with_suffix(".json"))
                print(f"생성: {clip}.m4a ({seconds}초), 청취 검수 전", flush=True)
    finally:
        os.close(fd)
        lock.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["status", "prepare", "generate"], nargs="?", default="status")
    parser.add_argument("--lesson", choices=["dongbaek", "prime"], default="dongbaek")
    parser.add_argument("--script", type=Path, help="통합 전 검수안을 제작할 때 지정하는 대본 목록")
    parser.add_argument("--key-file", type=Path, help="저장소 밖에 이미 설정된 키 파일. 내용은 출력하지 않는다")
    parser.add_argument("--limit", type=int, default=1, help="한 번의 최대 생성 수. 기본 1개")
    args = parser.parse_args()
    if args.limit < 1:
        parser.error("limit은 1 이상이어야 합니다")
    rows = scripts(source=args.script)
    review = HERE / "검수목록.csv"
    output = HERE / "generated"
    if args.action == "prepare":
        prepare(rows, review)
        print(f"검수 목록 {len(rows)}개 준비. 자동 승인하지 않습니다.")
    for prefix in ("dongbaek", "prime"):
        group = [r for r in rows if r["음원 이름"].startswith(prefix + "_")]
        print(f"{prefix}: 제작 {sum(current(r, output) for r in group)}/{len(group)} (청취 검수 별도)")
    if args.action != "generate":
        return
    group = [r for r in rows if r["음원 이름"].startswith(args.lesson + "_")]
    approved(group, review)
    pending = [r for r in group if not current(r, output)][:args.limit]
    if not pending:
        return
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise ValueError("ffmpeg와 ffprobe를 설치하세요")
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key and args.key_file:
        key = args.key_file.read_text(encoding="utf-8-sig").strip()
    if not key:
        raise ValueError("GEMINI_API_KEY 환경 변수가 필요합니다. 키를 저장소에 쓰지 마세요")
    checks = read_csv(review)
    ids = {r["음원 이름"] for r in pending}
    for check in checks:
        if check["음원 이름"] in ids:
            check["청취 검수"] = ""
    with review.open("w", encoding="utf-8-sig", newline="") as output_file:
        writer = csv.DictWriter(output_file, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(checks)
    from google import genai
    with genai.Client(api_key=key, http_options={"timeout": 90000}) as client:
        generate(pending, output, client)


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    try:
        main()
    except Exception as error:
        # API 오류 본문에는 요청 내용이 섞일 수 있어 출력하지 않는다. 자동 재시도도 하지 않는다.
        code = getattr(error, "code", None)
        label = str(error) if isinstance(error, (ValueError, FileNotFoundError, FileExistsError)) else type(error).__name__
        print(f"중단: {label}" + (f" (HTTP {code})" if code else ""), file=sys.stderr)
        sys.exit(1)
