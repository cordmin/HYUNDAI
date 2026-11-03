"""Generate one active lesson with the existing Nika studio, then export M4A.

python tools/generate-lesson-voices.py ai
Uses the studio's key lookup, request limits, cache, lock and take archive.
Listening review remains pending. Only current, validated takes are exported.
"""
import argparse
import csv
import json
import re
import subprocess

import dait_voice_studio as studio


def lesson_catalog(lesson_id):
    with (studio.ROOT / 'lessons/목록.csv').open(encoding='utf-8-sig', newline='') as source:
        lessons = list(csv.DictReader(source))
    lesson = next((row for row in lessons if row['이름'] == lesson_id), None)
    if lesson is None or not re.fullmatch(r'[a-z][a-z0-9_]*', lesson_id):
        raise ValueError('Unknown active lesson')
    source = (studio.ROOT / 'lessons' / lesson['파일']).resolve()
    if source.parent != (studio.ROOT / 'lessons').resolve():
        raise ValueError('Invalid lesson path')
    with source.open(encoding='utf-8-sig', newline='') as file:
        rows = list(csv.DictReader(file))
    lines = [dict(id=f"{lesson_id}_{row['조각']}", text=row['대사'],
                  category=f"수업 {lesson['제목']} · {row['구분']}") for row in rows]
    if not lines or len({line['id'] for line in lines}) != len(lines):
        raise ValueError('Empty lesson or duplicate pieces')
    for line in lines:
        studio.clip_paths('Nika', line['id'])
        if not line['text'].strip() or len(line['text']) > 1200:
            raise ValueError('Invalid lesson transcript')
    base = studio.load_catalog()
    return dict(model=base['model'], style=base['style'], lines=lines, max_seconds=180)


def export_clips(data):
    target = studio.ROOT / 'android/app/src/main/assets/voices/lesson'
    target.mkdir(parents=True, exist_ok=True)
    count = 0
    for line in data['lines']:
        info = studio.current_clip(data, line, 'Nika')
        if info is None:
            continue
        wav, _ = studio.clip_paths('Nika', line['id'])
        studio.audio_info(wav, data['max_seconds'])
        output = target / (line['id'] + '.m4a')
        receipt = output.with_suffix('.json')
        if output.is_file() and receipt.is_file():
            saved = json.loads(receipt.read_text(encoding='utf-8'))
            if saved.get('source_sha256') == info['sha256'] and saved.get('sha256') == studio.hashlib.sha256(output.read_bytes()).hexdigest():
                count += 1
                continue
        pending = output.with_suffix('.part.m4a')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(wav),
                        '-c:a', 'aac', '-b:a', '96k', str(pending)], check=True)
        duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries',
                         'format=duration', '-of', 'csv=p=0', str(pending)], text=True).strip())
        if abs(duration - info['duration']) > 0.5:
            raise ValueError('Export duration mismatch')
        pending.replace(output)
        receipt.write_text(json.dumps(dict(source_sha256=info['sha256'],
                           sha256=studio.hashlib.sha256(output.read_bytes()).hexdigest(),
                           fingerprint=info['fingerprint'], review=info['review']), indent=2), encoding='utf-8')
        count += 1
    print(f"Exported {count}/{len(data['lines'])} lesson clips", flush=True)
    return count


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('lesson')
    parser.add_argument('--export-only', action='store_true')
    args = parser.parse_args()
    studio.OUTPUT = studio.VOICE_ROOT / 'generated/lesson'
    data = lesson_catalog(args.lesson)
    if not args.export_only:
        studio.generate(voices=('Nika',), catalog=data)
    exported = export_clips(data)
    raise SystemExit(0 if exported == len(data['lines']) else 1)
