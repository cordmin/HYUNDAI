"""수업 음원마다 저음~고음 5칸의 소리 크기를 미리 재서 화면용 표로 만든다.

재생 화면의 막대 5개는 왼쪽부터 저음, 오른쪽으로 갈수록 고음이다. 차에서는 소리를 기기 자체 재생기가
틀어서 화면이 소리를 직접 들을 수 없으므로, 재생 시간에 맞춰 이 표를 읽어 막대를 움직인다.

수업 음원(voices/lesson/*.m4a)을 새로 만들거나 바꾸면 이 도구를 다시 돌린다:
    python tools/build-sound-levels.py
결과: android/app/src/main/assets/dait-sound-levels.js
"""
import json
import subprocess
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
VOICES = ROOT / 'android/app/src/main/assets/voices/lesson'
OUT = ROOT / 'android/app/src/main/assets/dait-sound-levels.js'
RATE = 16000          # 목소리에는 8kHz까지면 충분하다
FPS = 15              # 1초에 15번 (막대 움직임은 화면에서 부드럽게 이어 준다)
WINDOW = 1024
BANDS = [(80, 250), (250, 600), (600, 1500), (1500, 3500), (3500, 8000)]  # 저음 → 고음


def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(RATE), '-f', 's16le', '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768


def levels(samples):
    hop = RATE // FPS
    frames = max(1, int(np.ceil(len(samples) / hop)))
    padded = np.pad(samples, (WINDOW // 2, WINDOW + frames * hop))
    window = np.hanning(WINDOW)
    freqs = np.fft.rfftfreq(WINDOW, 1 / RATE)
    masks = [(freqs >= lo) & (freqs < hi) for lo, hi in BANDS]
    energy = np.zeros((frames, len(BANDS)))
    for i in range(frames):
        spectrum = np.abs(np.fft.rfft(padded[i * hop:i * hop + WINDOW] * window))
        energy[i] = [spectrum[m].mean() for m in masks]
    # 칸마다 그 음원 안에서 큰 소리(상위 5%)를 꽉 찬 막대로 맞춘다. 고음 칸도 잘 보이게 한다.
    level = np.log1p(energy * 50)
    top = np.percentile(level, 95, axis=0)
    level = np.clip(level / np.where(top > 0, top, 1), 0, 1)
    level[level < .12] = 0  # 숨소리·잡음은 조용한 것으로 본다
    return ''.join(''.join(str(int(round(v * 9))) for v in frame) for frame in level)


def main():
    table = {f'lesson/{path.stem}': levels(decode(path)) for path in sorted(VOICES.glob('*.m4a'))}
    OUT.write_text(
        '// tools/build-sound-levels.py가 만든 파일. 직접 고치지 않는다.\n'
        f'// 음원 이름 → {FPS}분의 1초마다 저음~고음 5칸의 소리 크기(0~9) 숫자 다섯 개.\n'
        f'var DAIT_SOUND_LEVELS = {{ fps: {FPS}, bands: {len(BANDS)}, clips: {json.dumps(table, separators=(",", ":"))} }};\n',
        encoding='utf-8')
    print(f'{len(table)}개 음원 → {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024}KB)')


if __name__ == '__main__':
    main()
