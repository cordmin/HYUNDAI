"""L6: generate short-lesson audio from a delivered CSV, without app edits."""
import argparse
import csv
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'tools'))
import dait_voice_studio as studio

spec = importlib.util.spec_from_file_location('lesson_export', ROOT / 'tools/generate-lesson-voices.py')
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)


def catalog(source, lesson):
    if lesson not in ('dongbaek', 'ai'):
        raise ValueError('Expected dongbaek or ai')
    raw = source.read_bytes()
    rows = list(csv.DictReader(raw.decode('utf-8-sig').splitlines()))
    if not rows or not {'조각', '대사', '구분'} <= rows[0].keys():
        raise ValueError('Expected lesson CSV headers')
    lines = []
    for row in rows:
        piece = row['조각']
        if not re.fullmatch(r'm[1-9][0-9]*', piece):
            raise ValueError('Only short-lesson m pieces are accepted')
        text = row['대사'].strip()
        if not text or len(text) > 1200 or re.search(r'[0-9]', text):
            raise ValueError(f'{piece}: empty/long transcript or digits in speech')
        lines.append(dict(id=f'{lesson}_{piece}', text=text,
                          category=f'수업 {lesson} · {row["구분"]}'))
    if len({line['id'] for line in lines}) != len(lines):
        raise ValueError('Duplicate pieces')
    base = studio.load_catalog()
    return dict(model=base['model'], style=base['style'], lines=lines, max_seconds=180), hashlib.sha256(raw).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('lesson', choices=['dongbaek', 'ai'])
    parser.add_argument('source', type=Path)
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    data, source_hash = catalog(args.source, args.lesson)
    target = Path(__file__).resolve().parent / 'delivery' / f'{args.lesson}-short'
    studio.OUTPUT = target / 'wav'
    if not args.check_only:
        studio.generate(voices=('Nika',), catalog=data)
    count = exporter.export_clips(data, target / 'm4a')
    report = dict(source_sha256=source_hash, expected=len(data['lines']), exported=count,
                  review='generated_not_listening_reviewed', clips=[])
    for line in data['lines']:
        info = studio.current_clip(data, line, 'Nika')
        if info is not None:
            wav, _ = studio.clip_paths('Nika', line['id'])
            checked = studio.audio_info(wav, 180)
            report['clips'].append(dict(id=line['id'], **checked))
    target.mkdir(parents=True, exist_ok=True)
    (target / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'{count}/{len(data["lines"])} exported; listening review pending')
    return 0 if count == len(data['lines']) else 1


if __name__ == '__main__':
    raise SystemExit(main())
