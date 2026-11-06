"""L7: produce pinned rule-script Nika WAVs in the delivery folder."""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import wave

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'tools'))
import dait_voice_studio as studio

HERE = Path(__file__).resolve().parent
SOURCE = HERE / 'rules-script.csv'
TARGET = HERE / 'delivery/rules'


def catalog():
    raw = SOURCE.read_bytes()
    rows = list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))
    if len(rows) != 141:
        raise ValueError('Expected 141 rule lines')
    lines = []
    for row in rows:
        clip, text = row['음원 이름'], row['대사']
        if not re.fullmatch(r'[a-z][a-z0-9_]{0,63}', clip) or not text.strip() or len(text) > 400:
            raise ValueError('Invalid clip or transcript')
        if re.search(r'[0-9]', text):
            raise ValueError(f'{clip}: digits must be spoken Korean')
        lines.append(dict(id=clip, text=text, category=row['쓰이는 곳']))
    if len({line['id'] for line in lines}) != len(lines):
        raise ValueError('Duplicate clip IDs')
    base = studio.load_catalog()
    return dict(model=base['model'], style=base['style'], lines=lines, max_seconds=45), hashlib.sha256(raw).hexdigest()


def export(data, source_hash):
    destination = TARGET / 'nika'
    destination.mkdir(parents=True, exist_ok=True)
    report = dict(source_sha256=source_hash, expected=141, exported=0, missing=[], clips=[],
                  review='generated_not_listening_reviewed')
    for line in data['lines']:
        info = studio.current_clip(data, line, 'Nika')
        if info is None:
            report['missing'].append(line['id'])
            continue
        wav, meta = studio.clip_paths('Nika', line['id'])
        studio.audio_info(wav)
        output = destination / wav.name
        if info['sample_rate'] == 24000:
            if not output.is_file() or hashlib.sha256(output.read_bytes()).hexdigest() != info['sha256']:
                shutil.copyfile(wav, output)
        else:
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(wav), '-ar', '24000',
                            '-ac', '1', '-c:a', 'pcm_s16le', str(output)], check=True)
        checked = studio.audio_info(output)
        with wave.open(str(output), 'rb') as audio:
            if audio.getframerate() != 24000 or audio.getsampwidth() != 2 or audio.getnchannels() != 1:
                raise ValueError('Wrong delivery format')
        if abs(checked['duration'] - info['duration']) > 0.05:
            raise ValueError('Delivery duration mismatch')
        receipt = dict(id=line['id'], text=line['text'], source_sha256=info['sha256'],
                       fingerprint=info['fingerprint'], review=info['review'], **checked)
        output.with_suffix('.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
        report['clips'].append(receipt)
    report['exported'] = len(report['clips'])
    (TARGET / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"Rules delivered: {report['exported']}/141; missing {len(report['missing'])}", flush=True)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    studio.OUTPUT = TARGET / 'raw'
    data, source_hash = catalog()
    if not args.check_only:
        studio.generate(voices=('Nika',), catalog=data)
    report = export(data, source_hash)
    raise SystemExit(0 if report['exported'] == 141 else 1)
