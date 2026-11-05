"""Produce Nika music lesson clips and measured 8/15/20-minute playlists.

Run: python team/a/voice/music_tts.py [--export-only]
Reuses the DAIT studio's credentials, lock, retry and transcript cache.
"""
import argparse
import csv
import hashlib
import json
import math
from pathlib import Path
import struct
import subprocess
import sys
import wave

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'tools'))
import dait_voice_studio as studio

TARGET = Path(__file__).parent / 'delivery/music-rhythm'
SOURCES = [ROOT / 'team/a/lessons/음악-박과리듬.csv', ROOT / 'team/a/lessons/음악-박과리듬-확장.csv']
RATE = 24000


def read_rows():
    rows = []
    for source in SOURCES:
        with source.open(encoding='utf-8-sig', newline='') as file:
            rows.extend(csv.DictReader(file))
    ids = [row['조각'] for row in rows]
    assert len(ids) == len(set(ids)) == 29
    assert all(None not in row and all(value is not None for value in row.values()) for row in rows), 'CSV column count mismatch'
    assert all(row['대사'].strip() and len(row['대사']) <= 1200 and not any(c.isdigit() for c in row['대사']) for row in rows)
    return rows


def pcm(path):
    return subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 's16le', '-ac', '1', '-ar', str(RATE), '-'])


def tone_pattern(positions, bpm=80, accents=(), sustained=False, frequency=330):
    beat = 60 / bpm
    samples = [0.0] * round(4 * beat * RATE)
    for pos in positions:
        start = round(pos * beat * RATE)
        length = round((2 * beat if sustained and pos == 0 else 0.11) * RATE)
        for i in range(min(length, len(samples) - start)):
            t = i / RATE
            envelope = min(i / (RATE * 0.006), 1) * math.exp(-t * (3 if sustained else 32))
            samples[start + i] += (9500 if pos in accents else 6000) * envelope * math.sin(2 * math.pi * frequency * t)
    return struct.pack(f'<{len(samples)}h', *(round(max(-32767, min(32767, s))) for s in samples))


def examples(piece):
    silence = b'\0\0' * RATE
    if piece in ('e1', 'e2'):
        low = tone_pattern([0, 1, 2, 3], frequency=150)
        count = len(low) // 2
        low_samples = struct.unpack(f'<{count}h', low)
        sounds = [low] if piece == 'e1' else []
        for positions in ([0, 1, 2, 3], [0, .5, 1, 2, 3]):
            high_samples = struct.unpack(f'<{count}h', tone_pattern(positions))
            sounds.append(struct.pack(f'<{count}h', *(a + b for a, b in zip(low_samples, high_samples))))
        return b''.join(silence + sound * 2 + silence for sound in sounds)
    patterns = {
        'm2': [([0, 1, 2, 3], 80, (), False)],
        'm3': [([0, 1, 2, 3], 80, (), False), ([0, .5, 1, 2, 3], 80, (), False)],
        'm6': [([0, 2, 3], 80, (), False)],
        'e5': [([0, 1, 2, 3], 60, (), False), ([0, 1, 2, 3], 100, (), False)],
        'e6': [([0, 2, 3], 80, (), True), ([0, 2, 3], 80, (), False)],
        'e9': [([0, 2, 3], 80, (), False), ([0, 1, 2], 80, (), False)],
        'e10': [([0, 1, 2], 80, (), False)],
        'e11': [([0, 1, 2, 3], 80, (0,), False)],
        'e12': [([0, 1, 2, 3], 80, (1, 3), False)],
        'e13': [([0, .5, 1, 2, 3], 80, (), False), ([0, 1, 2, 3], 80, (1, 3), False)],
    }
    # Each pattern repeats twice; the silent final beat remains in the PCM.
    return b''.join(silence + tone_pattern(*args) * 2 + silence for args in patterns.get(piece, []))


def write_audio(stem, content):
    wav = stem.with_suffix('.wav')
    with wave.open(str(wav), 'wb') as out:
        out.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        out.writeframes(content)
    output = stem.with_suffix('.m4a')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(wav), '-c:a', 'aac', '-b:a', '96k', str(output)], check=True)
    duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(output)], text=True).strip())
    assert abs(duration - len(content) / (2 * RATE)) < .15
    return duration


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--export-only', action='store_true')
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    rows = read_rows()
    if args.check_only:
        assert len(tone_pattern([0, 1, 2, 3])) == 3 * RATE * 2
        assert len(tone_pattern([0, 1, 2, 3], 60)) == 4 * RATE * 2
        assert len(tone_pattern([0, 1, 2], 80)) == 3 * RATE * 2
        assert len(examples('m3')) == 16 * RATE * 2
        print('29 CSV rows, exact column counts and pattern timing checks passed')
        return 0
    base = studio.load_catalog()
    data = dict(model=base['model'], style=base['style'], max_seconds=180,
                lines=[dict(id='rhythm_' + row['조각'], text=row['대사'], category='음악 수업 · ' + row['구분']) for row in rows])
    studio.OUTPUT = TARGET / 'raw'
    TARGET.mkdir(parents=True, exist_ok=True)
    if not args.export_only:
        studio.generate(voices=('Nika',), catalog=data)
        truncated = [line['id'] for line in data['lines']
                     if (saved := studio.current_clip(data, line, 'Nika')) is not None
                     and saved['duration'] < len(line['text']) / 14]
        if truncated:
            print('Retrying implausibly short clips: ' + ', '.join(truncated), flush=True)
            studio.generate(voices=('Nika',), ids=truncated, force=True, catalog=data)
    clips = {}
    for row, line in zip(rows, data['lines']):
        metadata = studio.current_clip(data, line, 'Nika')
        if metadata is None:
            continue
        source, _ = studio.clip_paths('Nika', line['id'])
        checked = studio.audio_info(source, 180)
        if checked['duration'] < len(line['text']) / 14:
            print('Rejected implausibly short clip: ' + line['id'], flush=True)
            continue
        content = pcm(source) + examples(row['조각'])
        content += b'\0\0' * round(RATE * int(row.get('기다림') or 0))
        clips[row['조각']] = dict(row=row, content=content, raw=checked)
    report = dict(review='generated_not_listening_reviewed', expected=29, generated=len(clips),
                  sources={str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in SOURCES},
                  clips=[dict(id=k, raw=v['raw'], edited_seconds=len(v['content']) / (2 * RATE)) for k, v in clips.items()], variants=[])
    # Core sequence: short lesson through m8, extensions, optional creation, conclusion.
    for minutes in (8, 15, 20):
        order = [f'm{i}' for i in range(1, 9)]
        order += [r['조각'] for r in rows if r.get('최소분') and int(r['최소분']) <= minutes]
        order += ['m9', 'm10', 'm11']
        if not all(k in clips for k in order):
            continue
        full_order = list(order)
        budget = minutes * 60 - .2  # AAC container rounding is checked below.
        def seconds():
            return sum(len(clips[k]['content']) / (2 * RATE) + .5 for k in order)
        # Keep the required short-lesson spine; drop later optional expansions first.
        groups = [['e18'], ['e16', 'e17'], ['e15'], ['e11', 'e12', 'e13', 'e14'],
                  ['e9', 'e10'], ['e6', 'e7', 'e8'], ['e5'], ['e1', 'e2', 'e3', 'e4'],
                  ['m10'], ['m9'], ['m7']]
        if minutes > 8:
            # Longer explanations already cover these optional short-lesson points.
            groups = [['m9'], ['m7']] + groups[:-2]
        removable = [group for group in groups if all(k in order for k in group)]
        omitted = []
        removed_groups = []
        while seconds() > budget and removable:
            group = removable.pop(0)
            removed_groups.append(group)
            for key in group:
                order.remove(key)
                omitted.append(key)
        for group in reversed(removed_groups):
            extra = sum(len(clips[k]['content']) / (2 * RATE) + .5 for k in group)
            if seconds() + extra <= budget:
                selected = set(order + group)
                order = [k for k in full_order if k in selected]
                omitted = [k for k in omitted if k not in group]
        assert seconds() <= budget, f'{minutes}min required spine exceeds budget'
        assert order[0] == 'm1' and order[-1] == 'm11'
        assert all((q in order) == (a in order) for q, a in [('e3', 'e4'), ('e7', 'e8'), ('e13', 'e14'), ('e16', 'e17')])
        content = b''.join(clips[k]['content'] + b'\0\0' * (RATE // 2) for k in order)
        measured = write_audio(TARGET / f'rhythm-{minutes}min', content)
        assert measured <= minutes * 60
        with (TARGET / f'rhythm-{minutes}min.csv').open('w', encoding='utf-8-sig', newline='') as file:
            writer = csv.writer(file)
            writer.writerow(['순서', '조각', '화면 문장', '대사', '대기 초', '편집 후 초'])
            for index, key in enumerate(order, 1):
                row = clips[key]['row']
                writer.writerow([index, key, row['화면 문장'], row['대사'], row.get('기다림') or 0,
                                 round(len(clips[key]['content']) / (2 * RATE) + .5, 3)])
        report['variants'].append(dict(budget_minutes=minutes, actual_seconds=measured, pieces=order, omitted=omitted,
                                       sha256=hashlib.sha256((TARGET / f'rhythm-{minutes}min.m4a').read_bytes()).hexdigest()))
    (TARGET / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(dict(generated=len(clips), variants=report['variants']), ensure_ascii=False, indent=2), flush=True)
    return 0 if len(clips) == 29 and len(report['variants']) == 3 else 1


if __name__ == '__main__':
    raise SystemExit(main())
