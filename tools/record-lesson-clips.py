"""Record the lesson clips listed in voice/다시-만들-음원.csv with Nika, then export them as app M4A files.

python tools/record-lesson-clips.py            # record what is missing or outdated, then export
python tools/record-lesson-clips.py --export-only

Uses the DAIT studio (key lookup, request pacing, retries, cache, take archive).
A clip is re-recorded only when its text or style changed, so the run can be repeated after an interruption.
Afterwards run tools/Measure-Lesson-Voice.ps1 to measure the new lengths.
"""
import argparse
import csv
import importlib.util
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dait_voice_studio as studio  # noqa: E402

LIST = studio.ROOT / 'voice' / '다시-만들-음원.csv'
TARGET = studio.ROOT / 'android/app/src/main/assets/voices/lesson'
# 동백꽃·소수는 처음에 team/a/voice/lesson_tts.py의 수업 낭독 말투로 녹음했다. 같은 수업 안에서 말투를 맞춘다.
LESSON_STYLE = '자연스러운 한국어 표준어로 차분하고 따뜻하게, 또렷한 수업 설명 속도로 입력 대사만 읽는다. 배경음악이나 효과음 없이 말한다.'
LESSON_STYLE_IDS = {'dongbaek', 'prime'}


def lesson_catalog(lesson_id):
    spec = importlib.util.spec_from_file_location('lesson_voices', Path(__file__).with_name('generate-lesson-voices.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    data = module.lesson_catalog(lesson_id)
    if lesson_id in LESSON_STYLE_IDS:
        data['style'] = LESSON_STYLE
    return data


def wanted():
    with LIST.open(encoding='utf-8-sig', newline='') as source:
        names = [row['음원 이름'] for row in csv.DictReader(source)]
    by_lesson = {}
    for name in names:
        lesson = next(l for l in ('dongbaek', 'prime', 'ai', 'sky', 'rhythm', 'starry') if name.startswith(l + '_'))
        by_lesson.setdefault(lesson, []).append(name)
    return by_lesson


def export(data, ids):
    TARGET.mkdir(parents=True, exist_ok=True)
    done = 0
    for line in data['lines']:
        if line['id'] not in ids:
            continue
        info = studio.current_clip(data, line, 'Nika')
        if info is None:
            print(f'녹음 없음: {line["id"]}', flush=True)
            continue
        wav, _ = studio.clip_paths('Nika', line['id'])
        studio.audio_info(wav, data['max_seconds'])
        output = TARGET / (line['id'] + '.m4a')
        pending = output.with_suffix('.part.m4a')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(wav), '-c:a', 'aac', '-b:a', '96k', str(pending)], check=True)
        pending.replace(output)
        done += 1
    return done


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--export-only', action='store_true')
    args = parser.parse_args()
    studio.OUTPUT = studio.VOICE_ROOT / 'generated/lesson'
    total = exported = 0
    for lesson_id, ids in wanted().items():
        data = lesson_catalog(lesson_id)
        if not args.export_only:
            print(f'== {lesson_id}: {len(ids)}개', flush=True)
            studio.generate(voices=('Nika',), ids=ids, catalog=data)
        total += len(ids)
        exported += export(data, set(ids))
    print(f'앱 음원으로 내보냄: {exported}/{total}', flush=True)
    raise SystemExit(0 if exported == total else 1)
