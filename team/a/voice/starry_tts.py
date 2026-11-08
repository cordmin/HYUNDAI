"""Produce the 32 delivered Starry Night clips without changing the active app.

python team/a/voice/starry_tts.py [--export-only]
Reuses the existing Nika studio, cache, lock and M4A exporter.
"""
import argparse
import csv
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'tools'))
import dait_voice_studio as studio

SOURCE = ROOT / 'team/b/lessons/starry/음원제작.csv'
TARGET = Path(__file__).parent / 'delivery/starry'
spec = importlib.util.spec_from_file_location('lesson_export', ROOT / 'tools/generate-lesson-voices.py')
lesson_export = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lesson_export)


def catalog():
    with SOURCE.open(encoding='utf-8-sig', newline='') as source:
        rows = list(csv.DictReader(source))
    assert len(rows) == len({r['음원 이름'] for r in rows}) == 32
    lines = []
    for row in rows:
        assert row['음원 이름'].startswith('starry_')
        studio.clip_paths('Nika', row['음원 이름'])
        assert 0 < len(row['대사'].strip()) <= 1200
        lines.append(dict(id=row['음원 이름'], text=row['대사'],
                          category=f"수업 {row['수업']} · {row['구분']}"))
    base = studio.load_catalog()
    return dict(model=base['model'], style=base['style'], lines=lines, max_seconds=180)


def verify(data):
    clips = []
    for line in data['lines']:
        info = studio.current_clip(data, line, 'Nika')
        assert info is not None, f"Missing/stale source: {line['id']}"
        wav, _ = studio.clip_paths('Nika', line['id'])
        studio.audio_info(wav, data['max_seconds'])
        output = TARGET / (line['id'] + '.m4a')
        receipt = json.loads(output.with_suffix('.json').read_text(encoding='utf-8'))
        digest = hashlib.sha256(output.read_bytes()).hexdigest()
        assert receipt['sha256'] == digest and receipt['source_sha256'] == info['sha256']
        probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams',
                           '-show_format', '-of', 'json', str(output)], text=True, encoding='utf-8'))
        stream = probe['streams'][0]
        seconds = float(probe['format']['duration'])
        assert stream['codec_name'] == 'aac' and stream['channels'] == 1
        assert int(stream['sample_rate']) == info['sample_rate'] == 24000
        assert abs(seconds - info['duration']) <= .5 and .2 <= seconds <= 180
        subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(output),
                        '-f', 'null', '-'], check=True, capture_output=True)
        clips.append(dict(id=line['id'], seconds=seconds, sha256=digest,
                          text_sha256=hashlib.sha256(line['text'].encode()).hexdigest()))
    report = dict(date='2026-11-08', status='PASS', model=data['model'], voice='Nika',
                  source=str(SOURCE.relative_to(ROOT)).replace('\\', '/'),
                  source_sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                  count=len(clips), app_integrated=False, listening_review_performed=False,
                  checks=['32 unique current transcript fingerprints', 'PCM16 non-silent WAV',
                          'AAC mono 24000 Hz', 'source/export hashes', 'duration', 'full FFmpeg decode'],
                  clips=clips)
    (TARGET / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    with (TARGET / '음원길이.csv').open('w', encoding='utf-8-sig', newline='') as file:
        writer = csv.writer(file)
        writer.writerow(['음원', '초'])
        writer.writerows((f"lesson/{clip['id']}", clip['seconds']) for clip in clips)
    print(f"Verified {len(clips)}/32 clips; {sum(c['seconds'] for c in clips):.3f} source seconds", flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--export-only', action='store_true')
    args = parser.parse_args()
    studio.OUTPUT = studio.VOICE_ROOT / 'generated/lesson'
    data = catalog()
    if not args.export_only:
        studio.generate(voices=('Nika',), catalog=data)
    exported = lesson_export.export_clips(data, TARGET)
    if exported != len(data['lines']):
        raise SystemExit(f'Incomplete: {exported}/32 clips; rerun resumes matching takes')
    verify(data)
