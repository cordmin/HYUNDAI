"""API 호출 없이 검수 차단, 변경 감지와 실제 AAC 변환을 확인한다."""
import base64
import csv
import io
import math
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
import wave

import lesson_tts as tts


class ProductionCheck(unittest.TestCase):
    def test_review_and_audio_pipeline(self):
        rows = tts.scripts()
        self.assertEqual(sum(r['음원 이름'].startswith('dongbaek_') for r in rows), 36)
        self.assertEqual(sum(r['음원 이름'].startswith('prime_') for r in rows), 20)
        self.assertEqual(len(rows), 56)
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            review = folder / 'review.csv'
            tts.prepare(rows, review)
            with self.assertRaises(ValueError):
                tts.approved(rows, review)
            checks = tts.read_csv(review)
            for row in checks:
                row['대본 검수'] = '사용자 위임 AI 검수 완료'
            with review.open('w', encoding='utf-8-sig', newline='') as output:
                writer = csv.DictWriter(output, fieldnames=tts.FIELDS)
                writer.writeheader()
                writer.writerows(checks)
            tts.approved(rows, review)
            changed = [dict(rows[0], 대사='바뀐 대사')]
            changed[0]['대본 SHA256'] = tts.digest(changed[0]['대사'].encode())
            with self.assertRaises(ValueError):
                tts.approved(changed, review)
            tts.prepare(changed, review)
            self.assertEqual(tts.read_csv(review)[0]['대본 검수'], '')

            # 합성한 시험 신호를 실제 ffmpeg/ffprobe로 변환한다. TTS API에는 접속하지 않는다.
            buffer = io.BytesIO()
            with wave.open(buffer, 'wb') as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(24000)
                wav.writeframes(b''.join(struct.pack('<h', int(3000 * math.sin(2 * math.pi * 440 * i / 24000))) for i in range(24000)))
            calls = []

            def create(**kwargs):
                calls.append(kwargs)
                return SimpleNamespace(output_audio=SimpleNamespace(data=base64.b64encode(buffer.getvalue()).decode()))

            client = SimpleNamespace(interactions=SimpleNamespace(create=create))
            tts.generate(rows[:1], folder, client)
            self.assertEqual(calls[0]['generation_config']['speech_config'][0]['voice'], 'Nika')
            self.assertEqual(calls[0]['input'][0]['content'][0]['text'], rows[0]['대사'])
            self.assertTrue(tts.current(rows[0], folder))
            self.assertFalse(tts.current(changed[0], folder))
            audio = folder / (rows[0]['음원 이름'] + '.m4a')
            subprocess.run(['ffmpeg', '-v', 'error', '-i', str(audio), '-f', 'null', '-'], check=True, capture_output=True)
            tts.generate(rows[:1], folder, client)
            self.assertEqual(len(list((folder / 'takes').rglob('*.m4a'))), 1)
            lock = folder / '.generation.lock'
            lock.touch()
            with self.assertRaises(FileExistsError):
                tts.generate(rows[:1], folder, client)
            self.assertEqual(len(calls), 2)
            lock.unlink()

            def fail(**kwargs):
                raise RuntimeError('simulated API failure')

            with self.assertRaises(RuntimeError):
                tts.generate(rows[:1], folder, SimpleNamespace(interactions=SimpleNamespace(create=fail)))
            self.assertTrue(tts.current(rows[0], folder))
            self.assertFalse(lock.exists())
            audio.write_bytes(b'broken')
            self.assertFalse(tts.current(rows[0], folder))
            self.assertFalse((folder / '.generation.lock').exists())


if __name__ == '__main__':
    unittest.main()
