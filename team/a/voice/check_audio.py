"""생성 음원을 원고 없이 AI로 전사한 뒤 대사와 비교한다. 사람의 청취와 구분한다."""
import argparse
import base64
from difflib import SequenceMatcher
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

import lesson_tts as tts


def normalize(text):
    return re.sub(r'[^가-힣a-z0-9]', '', text.lower())


def main():
    parser = argparse.ArgumentParser(description='AI 음성 전사·대본 일치 확인')
    parser.add_argument('--key-file', type=Path)
    args = parser.parse_args()
    key = os.getenv('GEMINI_API_KEY') or args.key_file.read_text(encoding='utf-8-sig').strip()
    output = tts.HERE / 'generated'
    rows = tts.scripts(source=tts.HERE / '수업-대본-AI검수안.csv')
    from google import genai
    with genai.Client(api_key=key, http_options={'timeout': 90000}) as client:
        for row in rows:
            clip = row['음원 이름']
            if not tts.current(row, output):
                continue
            audio = output / (clip + '.m4a')
            digest = hashlib.sha256(audio.read_bytes()).hexdigest()
            report = output / (clip + '.audio-review.json')
            if report.exists():
                old = json.loads(report.read_text(encoding='utf-8'))
                if old.get('sha256') == digest and old.get('model') == 'gemini-3.8-flash':
                    continue
            wav = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(audio), '-f', 'wav', '-'])
            response = client.interactions.create(
                model='gemini-3.8-flash',
                input=[{'type': 'text', 'text': '한국어 음원 검사를 합니다. 원고는 제공하지 않습니다. 실제로 들리는 발화를 빠짐없이 전사하세요. 숫자도 아라비아숫자로 바꾸지 말고 실제 발음대로 한글로 적으세요. 들리는 잡음, 음성 잘림, 알아들을 수 없는 발음, 갑작스러운 화자 변경이 있으면 issues에 한국어로 적으세요. 그런 문제가 없으면 빈 배열입니다. JSON 객체만 출력하세요: {"transcript":"실제로 들리는 발화", "issues":[]}. 설명을 읽거나 원고를 추측하지 마세요.'},
                       {'type': 'audio', 'data': base64.b64encode(wav).decode(), 'mime_type': 'audio/wav'}])
            text = response.output_text.strip()
            if text.startswith('```'):
                text = re.sub(r'^```(?:json)?\s*|\s*```$', '', text)
            value = json.loads(text)
            if not isinstance(value.get('transcript'), str) or not isinstance(value.get('issues'), list):
                raise ValueError('음성 검사 응답 형식 오류')
            ratio = SequenceMatcher(None, normalize(row['대사']), normalize(value['transcript']), autojunk=False).ratio()
            value.update(clip=clip, sha256=digest, model='gemini-3.8-flash', similarity=round(ratio, 5),
                         passed=ratio >= .97 and not value['issues'], review_type='AI audio review; not human listening')
            report.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
            print(f"{clip}: {'통과' if value['passed'] else '재확인'} (일치도 {ratio:.1%}) {value['issues']}", flush=True)
            time.sleep(6.3)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    try:
        main()
    except Exception as error:
        print(f"음성 검사 중단: {type(error).__name__} (HTTP {getattr(error, 'code', None)})", file=sys.stderr)
        sys.exit(1)
