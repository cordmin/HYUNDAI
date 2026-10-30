"""DAIT-only voice production. Never imports or mutates the Bombom studio."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import struct
import sys
import threading
import time
import wave

ROOT = Path(__file__).resolve().parents[1]
VOICE_ROOT = ROOT / "voice"
CATALOG = VOICE_ROOT / "catalog.json"
OUTPUT = VOICE_ROOT / "generated"
ORIGINAL_KEY = ROOT.parent / "bombom" / "tools" / "current_api_key.txt"
VOICES = ("Cruz", "Nika")
PORT = 5058
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
LOCK = threading.Lock()
STATE = {"running": False, "total": 0, "done": 0, "errors": 0, "current": "", "log": "대기 중"}
STOP = threading.Event()
JOB_LOCK = VOICE_ROOT / ".generation.lock"


def load_catalog():
    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    ids = [line["id"] for line in data["lines"]]
    if len(ids) != len(set(ids)) or any(not re.fullmatch(r"[a-z][a-z0-9_]{0,63}", i) for i in ids):
        raise ValueError("Invalid or duplicate clip IDs")
    for line in data["lines"]:
        if not line["text"].strip() or len(line["text"]) > 400:
            raise ValueError("Expected a short, nonempty transcript")
    for playlist in data["playlists"]:
        if any(i not in ids for i in playlist["line_ids"]):
            raise ValueError("Unknown playlist clip")
    return data


def key_value():
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        path = Path(os.environ.get("DAIT_GEMINI_KEY_FILE", str(ORIGINAL_KEY)))
        if path.is_file():
            key = path.read_text(encoding="utf-8-sig").strip()
    if not key:
        raise RuntimeError("API key is not configured")
    return key


def fingerprint(data, line, voice):
    content = {"model": data["model"], "style": data["style"], "line": line, "voice": voice}
    return hashlib.sha256(json.dumps(content, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def audio_info(path):
    with wave.open(str(path), "rb") as wav:
        if wav.getcomptype() != "NONE" or wav.getsampwidth() != 2 or wav.getnchannels() != 1:
            raise ValueError("Expected mono PCM16 WAV")
        frames = wav.getnframes()
        rate = wav.getframerate()
        pcm = wav.readframes(frames)
    if len(pcm) != frames * 2 or not 0.2 <= frames / rate <= 45:
        raise ValueError("Invalid audio length")
    samples = struct.unpack(f"<{len(pcm) // 2}h", pcm)
    peak = max(abs(v) for v in samples)
    rms = math.sqrt(sum(v * v for v in samples) / len(samples))
    if peak < 100 or rms < 10:
        raise ValueError("Silent output")
    return {"duration": round(frames / rate, 3), "sample_rate": rate, "peak": peak,
            "rms": round(rms, 2), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def clip_paths(voice, line_id):
    if voice not in VOICES or not re.fullmatch(r"[a-z][a-z0-9_]{0,63}", line_id):
        raise ValueError("Invalid clip")
    base = OUTPUT / voice.lower() / line_id
    return base.with_suffix(".wav"), base.with_suffix(".json")


def current_clip(data, line, voice):
    wav, meta = clip_paths(voice, line["id"])
    try:
        value = json.loads(meta.read_text(encoding="utf-8"))
        if value["fingerprint"] == fingerprint(data, line, voice) and value["sha256"] == hashlib.sha256(wav.read_bytes()).hexdigest():
            return value
    except (OSError, ValueError, KeyError):
        pass
    return None


def synthesize(data, line, voice, client):
    from google.genai import types
    # Same GenerateContent/SpeechMetadata approach as the user's existing studio.
    response = client.models.generate_content(
        model=data["model"],
        contents=[types.Part(text=line["text"], speech_metadata=types.SpeechMetadata(
            style=data["style"] + " 상황: " + line["category"] + "."))],
        config=types.GenerateContentConfig(response_modalities=["AUDIO"], speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice)))),
    )
    parts = response.candidates[0].content.parts if response.candidates else []
    audio_parts = [p.inline_data for p in parts or [] if p.inline_data and p.inline_data.data]
    if not audio_parts:
        raise ValueError("No audio returned")
    payload = b"".join(p.data for p in audio_parts)
    wav, metadata = clip_paths(voice, line["id"])
    wav.parent.mkdir(parents=True, exist_ok=True)
    temporary = wav.with_suffix(".part.wav")
    if payload.startswith(b"RIFF"):
        temporary.write_bytes(payload)
    else:
        mime = audio_parts[0].mime_type or ""
        if not (mime.startswith("audio/L16") or mime.lower().startswith("audio/l16")):
            raise ValueError("Unsupported audio format")
        rate = int(re.search(r"rate=(\d+)", mime).group(1)) if "rate=" in mime else 24000
        with wave.open(str(temporary), "wb") as out:
            out.setnchannels(1); out.setsampwidth(2); out.setframerate(rate); out.writeframes(payload)
    info = audio_info(temporary)
    # Keep every older take rather than silently replacing it.
    if wav.exists():
        archive = wav.parent / "takes" / line["id"]
        archive.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime("%Y%m%d-%H%M%S") + f"-{time.time_ns() % 1000000:06d}"
        shutil.copy2(wav, archive / f"{stamp}.wav")
        if metadata.exists():
            shutil.copy2(metadata, archive / f"{stamp}.json")
    temporary.replace(wav)
    value = dict(info, id=line["id"], voice=voice, model=data["model"], text=line["text"],
                 fingerprint=fingerprint(data, line, voice), generated_at=time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                 review="generated_not_listening_reviewed")
    pending = metadata.with_suffix(".part.json")
    pending.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    pending.replace(metadata)
    return value


def safe_error(error):
    # SDK error strings can include request data. Persist only a class and HTTP code.
    code = getattr(error, "code", None)
    return f"{type(error).__name__}" + (f" (HTTP {code})" if code else "")


def generate(voices=VOICES, ids=None, force=False, interval=6.3):
    from google import genai
    data = load_catalog()
    lines = [line for line in data["lines"] if ids is None or line["id"] in ids]
    if not lines or any(v not in VOICES for v in voices) or (ids and set(ids) - {x["id"] for x in lines}):
        raise ValueError("Unknown voice or line")
    if not LOCK.acquire(blocking=False):
        raise RuntimeError("Generation already running")
    lock_fd = None
    try:
        lock_fd = os.open(JOB_LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(lock_fd, str(os.getpid()).encode("ascii"))
        STOP.clear()
        STATE.update(running=True, total=len(lines) * len(voices), done=0, errors=0, current="", log="생성 시작")
        client = genai.Client(api_key=key_value(), http_options={"timeout": 90000})
        last_call = 0.0
        for line in lines:
            for voice in voices:
                if STOP.is_set():
                    return
                label = f"{voice}/{line['id']}"
                STATE.update(current=label, log=f"생성 중: {label}")
                if not force and current_clip(data, line, voice):
                    STATE["done"] += 1
                    continue
                for attempt in range(3):
                    if STOP.wait(max(0, interval - (time.monotonic() - last_call))):
                        return
                    try:
                        last_call = time.monotonic()
                        info = synthesize(data, line, voice, client)
                        STATE["done"] += 1
                        STATE["log"] = f"완료: {label} ({info['duration']}초)"
                        print(STATE["log"], flush=True)
                        break
                    except Exception as error:
                        code = getattr(error, "code", None)
                        message = safe_error(error)
                        STATE["log"] = f"실패: {label}: {message}"
                        print(STATE["log"], flush=True)
                        if code == 429 and "generate_requests_per_model_per_day" in str(getattr(error, "message", "")):
                            STATE["errors"] += 1
                            STATE["log"] = "일일 TTS 요청 한도에 도달해 추가 호출을 중단했습니다."
                            print(STATE["log"], flush=True)
                            STOP.set()
                            return
                        if code in (400, 401, 403, 404):
                            STATE["errors"] += 1
                            STOP.set()
                            return
                        if attempt == 2:
                            STATE["errors"] += 1
                            break
                        if STOP.wait(25 if code == 429 else 5):
                            return
        STATE["log"] = f"작업 완료: {STATE['done']}개, 실패 {STATE['errors']}개"
    except Exception as error:
        STATE["errors"] += 1
        STATE["log"] = safe_error(error)
        print(STATE["log"], flush=True)
    finally:
        STATE["running"] = False
        if lock_fd is not None:
            os.close(lock_fd)
            JOB_LOCK.unlink(missing_ok=True)
        LOCK.release()


def status():
    data = load_catalog()
    for line in data["lines"]:
        line["clips"] = {voice: current_clip(data, line, voice) for voice in VOICES}
    batch = STATE.copy()
    batch["external_running"] = JOB_LOCK.exists() and not STATE["running"]
    return {"catalog": data, "batch": batch}


def export_android():
    data = load_catalog()
    assets = ROOT / "android/app/src/main/assets/voices"
    for line in data["lines"]:
        for voice in VOICES:
            if not current_clip(data, line, voice):
                raise ValueError(f"Missing/stale clip: {voice}/{line['id']}")
    for line in data["lines"]:
        for voice in VOICES:
            wav, _ = clip_paths(voice, line["id"])
            target = assets / voice.lower() / wav.name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(wav, target)
    assets.mkdir(parents=True, exist_ok=True)
    (assets / "catalog.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    csv_path = VOICE_ROOT / "catalog.csv"
    with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["id", "category", "title", "text", "cue", "scene"])
        writer.writeheader(); writer.writerows(data["lines"])
    print(f"Exported {len(data['lines']) * len(VOICES)} Android clips", flush=True)


def serve():
    from flask import Flask, jsonify, request, send_file, abort
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 65536

    @app.before_request
    def local_only():
        if request.host not in (f"127.0.0.1:{PORT}", f"localhost:{PORT}"):
            abort(403)
        if request.method == "POST":
            if request.headers.get("Origin") not in (f"http://127.0.0.1:{PORT}", f"http://localhost:{PORT}") or not request.is_json:
                abort(403)

    @app.get("/")
    def index(): return send_file(VOICE_ROOT / "studio.html")

    @app.get("/api/state")
    def state(): return jsonify(status())

    @app.get("/audio/<voice>/<line_id>")
    def audio(voice, line_id):
        if line_id not in {line["id"] for line in load_catalog()["lines"]} or voice not in VOICES:
            abort(404)
        path, _ = clip_paths(voice, line_id)
        if not path.is_file(): abort(404)
        return send_file(path, mimetype="audio/wav", conditional=True)

    @app.post("/api/generate")
    def start():
        body = request.get_json()
        voices = body.get("voices", list(VOICES))
        ids = body.get("ids")
        valid_ids = {x["id"] for x in load_catalog()["lines"]}
        if not isinstance(voices, list) or not voices or set(voices) - set(VOICES): abort(400)
        if ids is not None and (not isinstance(ids, list) or not ids or any(not isinstance(i, str) for i in ids) or set(ids) - valid_ids): abort(400)
        if STATE["running"] or JOB_LOCK.exists(): return jsonify(error="이미 생성 중입니다"), 409
        threading.Thread(target=generate, args=(voices, ids, body.get("force") is True), daemon=True).start()
        return jsonify(started=True)

    @app.post("/api/stop")
    def stop(): STOP.set(); return jsonify(stopping=True)

    @app.post("/api/edit")
    def edit():
        if STATE["running"] or JOB_LOCK.exists(): return jsonify(error="생성을 멈춘 뒤 수정해 주세요"), 409
        body = request.get_json()
        data = load_catalog()
        line = next((x for x in data["lines"] if x["id"] == body.get("id")), None)
        if line is None: abort(404)
        for field, limit in (("text", 400), ("title", 80), ("cue", 200)):
            value = body.get(field)
            if not isinstance(value, str) or not value.strip() or len(value) > limit: abort(400)
            line[field] = value.strip()
        pending = CATALOG.with_suffix(".part.json")
        pending.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        pending.replace(CATALOG)
        return jsonify(saved=True)

    @app.errorhandler(Exception)
    def error_response(error):
        from werkzeug.exceptions import HTTPException
        if isinstance(error, HTTPException): return jsonify(error=error.name), error.code
        return jsonify(error=safe_error(error)), 500

    app.run(host="127.0.0.1", port=PORT, debug=False, use_reloader=False)


def self_test():
    data = load_catalog()
    assert len(data["lines"]) >= 48
    assert fingerprint(data, data["lines"][0], "Cruz") != fingerprint(data, data["lines"][0], "Nika")
    changed = dict(data["lines"][0], text="새 대사")
    assert fingerprint(data, changed, "Cruz") != fingerprint(data, data["lines"][0], "Cruz")
    for bad in ("../escape", "x/y", ".."):
        try: clip_paths("Cruz", bad)
        except ValueError: pass
        else: raise AssertionError("Unsafe path accepted")
    print("Catalog, stale-cache and path validation checks passed")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--generate", action="store_true")
    parser.add_argument("--voices", nargs="+", choices=VOICES, default=list(VOICES))
    parser.add_argument("--ids", nargs="+")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--export-android", action="store_true")
    parser.add_argument("--serve", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test: self_test()
    if args.generate:
        generate(args.voices, args.ids, args.force)
        if STATE["errors"] or STATE["done"] != STATE["total"]: raise SystemExit(1)
    if args.export_android: export_android()
    if args.serve: serve()
