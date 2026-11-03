"""Offline L7 input and delivery-format checks; no API calls."""
import json
import math
from pathlib import Path
import tempfile
import struct
from unittest.mock import patch
import wave

import rules_tts as task

data, _ = task.catalog()
assert len(data['lines']) == 141
assert next(line['text'] for line in data['lines'] if line['id'] == 'n_15') == '십오 분'
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    task.studio.OUTPUT = root / 'raw'
    wav, meta = task.studio.clip_paths('Nika', 'n_15')
    wav.parent.mkdir(parents=True)
    with wave.open(str(wav), 'wb') as audio:
        audio.setparams((1, 2, 48000, 0, 'NONE', 'not compressed'))
        audio.writeframes(struct.pack('<48000h', *[int(2000 * math.sin(2 * math.pi * 440 * i / 48000)) for i in range(48000)]))
    line = next(line for line in data['lines'] if line['id'] == 'n_15')
    one = dict(data, lines=[line])
    info = dict(task.studio.audio_info(wav), fingerprint=task.studio.fingerprint(one, line, 'Nika'),
                review='generated_not_listening_reviewed')
    meta.write_text(json.dumps(info), encoding='utf-8')
    with patch.object(task, 'TARGET', root / 'delivery'):
        report = task.export(one, 'test-source')
        assert report['exported'] == 1
        assert report['clips'][0]['sample_rate'] == 24000
        assert report['clips'][0]['source_sha256'] == info['sha256']
        # An identical 24k take needs no write, including when a player holds it open.
        wav.write_bytes((root / 'delivery/nika/n_15.wav').read_bytes())
        info = dict(task.studio.audio_info(wav), fingerprint=task.studio.fingerprint(one, line, 'Nika'),
                    review='generated_not_listening_reviewed')
        meta.write_text(json.dumps(info), encoding='utf-8')
        with patch.object(task.shutil, 'copyfile', side_effect=AssertionError('Unnecessary overwrite')):
            assert task.export(one, 'same-source')['exported'] == 1
        one['lines'] = [dict(line, text='바뀐 대사')]
        assert task.export(one, 'changed-source')['missing'] == ['n_15']
print('L7 pinned number transcript, PCM24k export and stale-take rejection passed')
