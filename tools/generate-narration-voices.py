"""Produce L5 Nika narration WAVs without changing app assets or the video.

python tools/generate-narration-voices.py
python tools/generate-narration-voices.py --check-only
"""
import argparse
import csv
import sys

import dait_voice_studio as studio


def narration_catalog():
    with (studio.VOICE_ROOT / '시연-내레이션.csv').open(encoding='utf-8-sig', newline='') as source:
        rows = list(csv.DictReader(source))
    lines = [dict(id=row['음원 이름'], text=row['대사'], category='수업 중심 시연 내레이션') for row in rows]
    if not lines or len({line['id'] for line in lines}) != len(lines):
        raise ValueError('Missing or duplicate narration clips')
    for line in lines:
        studio.clip_paths('Nika', line['id'])
        if not line['text'].strip() or len(line['text']) > 400:
            raise ValueError('Invalid narration transcript')
    data = studio.load_catalog()
    return dict(model=data['model'], style=data['style'], lines=lines, max_seconds=45), rows


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    studio.OUTPUT = studio.VOICE_ROOT / 'generated/narration'
    data, rows = narration_catalog()
    if not args.check_only:
        studio.generate(voices=('Nika',), catalog=data)
    report = []
    missing = []
    for line, row in zip(data['lines'], rows):
        info = studio.current_clip(data, line, 'Nika')
        if info is None:
            missing.append(line['id'])
            continue
        wav, _ = studio.clip_paths('Nika', line['id'])
        checked = studio.audio_info(wav)
        assert checked['sha256'] == info['sha256']
        report.append([line['id'], row['장면'], checked['duration'], wav.name,
                       '생성·기술 검사 완료 / 사람 청취 후속', row['비고']])
    studio.OUTPUT.mkdir(parents=True, exist_ok=True)
    with (studio.OUTPUT / '편집목록.csv').open('w', encoding='utf-8-sig', newline='') as output:
        writer = csv.writer(output)
        writer.writerow(['음원 이름', '장면', '실제 초', 'WAV 파일(nika/)', '검사 상태', '비고'])
        writer.writerows(report)
    print(f"Narration: {len(report)}/{len(rows)}, total {sum(row[2] for row in report):.2f}s", flush=True)
    if missing:
        print('Missing/stale: ' + ', '.join(missing), flush=True)
        sys.exit(1)
