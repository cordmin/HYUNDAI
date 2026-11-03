"""Offline L6 check: reject unsafe input; export only into delivery."""
import csv
import json
from pathlib import Path
import tempfile
import wave

import short_lesson_tts as task


with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    source = root / 'source.csv'
    def write(piece, text):
        with source.open('w', encoding='utf-8-sig', newline='') as output:
            writer = csv.writer(output)
            writer.writerow(['조각', '대사', '구분'])
            writer.writerow([piece, text, '도입'])
    for piece, text in [('m1', '십오 분'), ('m1', '15분'), ('../m1', '대사')]:
        write(piece, text)
        try:
            data, _ = task.catalog(source, 'dongbaek')
        except ValueError:
            assert piece != 'm1' or text == '15분'
        else:
            assert text == '십오 분'
    write('m1', '십오 분')
    data, _ = task.catalog(source, 'dongbaek')
    task.studio.OUTPUT = root / 'takes'
    wav, meta = task.studio.clip_paths('Nika', 'dongbaek_m1')
    wav.parent.mkdir(parents=True)
    with wave.open(str(wav), 'wb') as audio:
        audio.setparams((1, 2, 24000, 0, 'NONE', 'not compressed'))
        audio.writeframes(b'\xe8\x03\x18\xfc' * 12000)
    info = task.studio.audio_info(wav)
    info.update(fingerprint=task.studio.fingerprint(data, data['lines'][0], 'Nika'),
                review='generated_not_listening_reviewed')
    meta.write_text(json.dumps(info), encoding='utf-8')
    target = root / 'delivery'
    assert task.exporter.export_clips(data, target) == 1
    assert (target / 'dongbaek_m1.m4a').is_file()
    data['lines'][0]['text'] = '바뀐 대사'
    assert task.exporter.export_clips(data, root / 'stale') == 0
print('L6 input validation, isolated AAC export and stale-take rejection passed')
