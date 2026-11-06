"""Export cached Nika rhythm audio to the existing DAIT piece-based player.

Run from the repository root. No TTS calls: python team/a/voice/integrate_music.py
"""
import csv
import hashlib
import json
import subprocess
import music_tts as music

ROOT = music.ROOT
ASSETS = ROOT / 'android/app/src/main/assets'
HEADER = ['조각', '판', '구분', '필수', '수준', '기다림', '화면 문장', '대사']


def table(path):
    with path.open(encoding='utf-8-sig', newline='') as file:
        reader = csv.DictReader(file)
        return reader.fieldnames, list(reader)


def save(path, header, rows):
    with path.open('w', encoding='utf-8-sig', newline='') as file:
        writer = csv.DictWriter(file, fieldnames=header)
        writer.writeheader()
        writer.writerows(rows)


def main():
    rows = {row['조각']: row for row in music.read_rows()}
    report = json.loads((music.TARGET / 'report.json').read_text(encoding='utf-8'))
    assert report['generated'] == 29
    for name, digest in report['sources'].items():
        assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == digest
    target = ASSETS / 'voices/lesson'
    target.mkdir(parents=True, exist_ok=True)
    output, lengths = [], {}

    def export(piece_id, members, version, required, kind=None, screen=None):
        first = rows[members[0]]
        kind = kind or first['구분']
        content = b''
        for key in members:
            row = rows[key]
            raw = music.TARGET / f'raw/nika/rhythm_{key}.wav'
            meta = json.loads(raw.with_suffix('.json').read_text(encoding='utf-8'))
            assert meta['text'] == row['대사']
            assert hashlib.sha256(raw.read_bytes()).hexdigest() == meta['sha256']
            content += music.pcm(raw) + music.examples(key)
            if kind != '발문':
                content += b'\0\0' * (music.RATE * int(row.get('기다림') or 0))
        duration = music.write_audio(target / f'rhythm_{piece_id}', content)
        (target / f'rhythm_{piece_id}.wav').unlink()  # Reproducible PCM stays in delivery.
        lengths[f'lesson/rhythm_{piece_id}'] = str(round(duration, 3))
        output.append(dict(zip(HEADER, [piece_id, version, kind, required,
            first.get('수준', '') if kind == '발문' else '',
            first.get('기다림', '') if kind == '발문' else '',
            screen or first['화면 문장'], ' '.join(rows[k]['대사'] for k in members)])))

    for index in range(1, 12):
        key = f'm{index}'
        export(key, [key], '8', rows[key]['필수'])
    for index, piece_id in enumerate(['i1', 'b1', 'b2', 'q1', 'b3', 'b4', 'q2', 'b5'], 1):
        key = f'm{index}'
        export(piece_id, [key], '15', rows[key]['필수'])
    # Optional questions and answers remain indivisible when the ETA changes.
    groups = [[1], [2], [3, 4], [5], [6, 7, 8], [9, 10], [11], [12], [13, 14], [15], [16, 17], [18]]
    for group in groups:
        export('e' + '_'.join(map(str, group)), [f'e{i}' for i in group],
               '30' if group[0] >= 11 else '15', '아니오', kind='전개')
    for index, piece_id in [(9, 'b6'), (10, 'q3'), (11, 'c1')]:
        key = f'm{index}'
        export(piece_id, [key], '15', rows[key]['필수'])
    export('r1', ['m11'], '15', '예', kind='복습', screen='지난 시간: 박과 리듬')
    export('s1', ['m11'], '15', '예', kind='짧은정리', screen='박과 리듬을 기억해요')
    save(ROOT / 'lessons/박과리듬.csv', HEADER, output)
    path = ROOT / 'lessons/음원길이.csv'
    header, old = table(path)
    save(path, header, [r for r in old if r['음원'] not in lengths] + [{'음원': k, '초': v} for k, v in lengths.items()])
    path = ROOT / 'lessons/목록.csv'
    header, catalog = table(path)
    entry = dict(zip(header, ['rhythm', '박과리듬.csv', '같은 네 박인데 왜 다르게 들릴까', '음악', '교양',
        '박과 리듬을 소리와 쉼으로 비교하기', '도착 후 가족과 네 박 리듬을 만들고 쉼의 자리 설명하기',
        '작업용 대본·교사 검수 전', '같은 네 박인데 왜 다르게 들릴까?']))
    existing = next((r for r in catalog if r['이름'] == 'rhythm'), None)
    assert existing is None or existing == entry
    if existing is None:
        with path.open('a', encoding='utf-8', newline='') as file:
            csv.DictWriter(file, fieldnames=header).writerow(entry)
    subprocess.run(['node', 'tools/build-lessons.js'], cwd=ROOT, check=True)
    print(f'Exported {len(output)} music pieces into the existing app player')


if __name__ == '__main__':
    main()
