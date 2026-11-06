"""team-base dbb3282에 추가된 소수 짧은 판 11개를 검수한 전달용 사본을 만든다."""
import csv
import io
from pathlib import Path
import subprocess

import lesson_tts as tts

HERE = Path(__file__).resolve().parent
CHANGES = {
    'm1': '안녕하세요, 다잇입니다. 짧은 수학 시간입니다. 오늘의 질문은 소수는 어디까지 이어질까입니다. 이, 삼, 오, 칠, 십일, 십삼처럼 이어지는 소수는 언젠가 끝날까요? 몇 개의 예를 더 찾는 것과 끝이 없다는 이유를 보이는 것은 다릅니다. 오늘은 어떤 유한한 목록을 만들어도 거기에 없는 소수가 더 있다는 생각을 따라가겠습니다. 숫자를 외우거나 계산하실 필요는 없습니다. 운전에 집중하시면서 편하게 들어 주세요.',
    'm2': '먼저 소수가 무엇인지 짚고 가겠습니다. 소수는 일보다 큰 자연수 가운데 일과 자기 자신으로만 나누어떨어지는 수입니다. 육은 이와 삼으로 나누어떨어지니 소수가 아니고, 칠은 소수입니다. 그리고 일보다 큰 자연수는 적어도 하나의 소수로 나누어떨어집니다. 육은 이로, 구는 삼으로, 칠은 자기 자신인 칠로 나누어떨어지지요. 모든 소수로 나누어떨어진다는 뜻은 아닙니다. 이 사실을 기억하며 다음 이야기를 들어 보겠습니다.',
    'm3': '소수의 개수와 소수가 차지하는 비율을 구별해 보겠습니다. 백 이하에는 소수가 스물다섯 개여서 비율이 사분의 일입니다. 천 이하에는 백육십팔 개, 만 이하에는 천이백이십구 개가 있습니다. 이 구간들에서 개수는 늘지만 전체 수 가운데 차지하는 비율은 낮아집니다. 그렇다고 소수 사이의 간격이 매번 커진다는 뜻은 아닙니다. 드물어 보이는 것과 완전히 끝나는 것도 다른 말입니다. 지금은 수치를 외우거나 직접 계산하지 않으셔도 괜찮습니다.',
    'm4': '유클리드의 원론에 담긴 생각을 현대식으로 풀어 보겠습니다. 먼저 소수가 몇 개뿐이라고 가정합니다. 그렇다면 세상의 모든 소수를 적은 유한한 목록을 만들 수 있겠지요. 이제 목록의 소수를 모두 곱한 뒤 일을 더해 새 수를 만듭니다. 이 수 자체가 소수일 수도 있고 합성수일 수도 있습니다. 증명에 필요한 것은 이 수가 언제나 소수라는 주장이 아니라, 이 목록 밖에 소수가 더 있다는 사실입니다.',
    'm6': '답은 목록의 소수로 나누어떨어지지 않는다입니다. 어떤 소수로 나누어도 더한 일이 나머지로 남습니다. 그런데 이 새 수는 일보다 크므로 적어도 하나의 소수로 나누어떨어집니다. 그 소수는 처음 목록에는 있을 수 없겠지요. 모든 소수를 빠짐없이 적었다는 가정과 어긋납니다. 그러므로 소수에는 끝이 없습니다. 새 수가 합성수여도 이 논리는 그대로 성립합니다.',
    'm9': '이렇게 일부러 반대로 가정하고 모순을 찾는 방법을 귀류법이라고 합니다. 탐정이 그 사람이 범인이라고 가정했더니 같은 시각에 서로 다른 두 곳에 있어야 해서 그 가정을 버리는 것과 비슷합니다. 다만 비유와 수학의 증명이 똑같은 것은 아닙니다. 수학에서는 왜 모순인지가 분명해야 합니다. 오늘의 모순은 모든 소수를 적었다는 목록 밖에 소수가 더 있다는 것이었습니다. 큰 소수를 계속 찾는 일과 끝없음을 증명하는 일의 차이를 여기서 볼 수 있습니다.',
    'm10': '이 증명을 다시 보면 특별한 점이 있습니다. 목록에 소수를 몇 개 적었는지, 그 소수가 얼마나 큰지는 핵심이 아닙니다. 목록의 소수를 모두 곱한 수는 그 목록의 각 소수로 나누어떨어집니다. 거기에 일을 더하면 어느 소수로 나누어도 일이 남습니다. 숫자가 바뀌어도 이 관계는 같습니다. 여러 예가 맞는 것을 확인하는 데서 멈추지 않고 어떤 유한한 목록에도 통하는 이유를 찾았기 때문에, 소수가 끝없다고 말할 수 있습니다.',
    'm11': '오늘의 질문에 답해 보겠습니다. 소수는 끝이 없습니다. 어떤 유한한 소수 목록을 만들어도, 모두 곱하고 일을 더한 수의 소인수는 그 목록에 없기 때문입니다. 새 수 자체가 늘 소수인 것은 아니라는 점도 함께 기억해 주세요. 차에서 내린 뒤 편한 때에 이 까닭을 함께 사는 사람에게 한 문장으로 들려주세요. 숙제를 마쳤다는 표시는 나중에 주차 중 편할 때 남기시면 됩니다. 더 긴 수업에서는 소수의 성질과 증명을 더 살펴볼 수 있습니다. 안전하게 도착하세요.',
}


def main():
    revision = subprocess.check_output(['git', 'rev-parse', 'origin/team-base']).decode().strip()
    raw = subprocess.check_output(['git', 'show', f'{revision}:lessons/소수.csv']).decode('utf-8-sig')
    reader = csv.DictReader(io.StringIO(raw))
    fields, all_rows = reader.fieldnames, list(reader)
    new = [r for r in all_rows if r['조각'].startswith('m')]
    assert [r['조각'] for r in new] == [f'm{i}' for i in range(1, 12)]
    for row in new:
        if row['조각'] in CHANGES:
            row['대사'] = CHANGES[row['조각']]
        if row['조각'] == 'm10':
            row['화면 문장'] = '어떤 목록에도 통하는 이유'
        assert len(row['대사']) < 400 and row['판'] == '8'
    target = HERE / '소수-짧은판-AI검수안.csv'
    with target.open('w', encoding='utf-8-sig', newline='') as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(new)
    # 기존 56개의 대사와 파일 이름은 유지하고 새 조각만 추가한다.
    script = HERE / '수업-대본-AI검수안.csv'
    rows = [r for r in tts.read_csv(script) if not r['음원 이름'].startswith('prime_m')]
    assert len(rows) == 56
    for row in new:
        rows.append({'음원 이름': 'prime_' + row['조각'], '대사': row['대사'], '수업': '소수는 어디까지 있을까', '구분': row['구분'], '상태': '사용자 위임 AI 검수 완료·추가 제작'})
    with script.open('w', encoding='utf-8-sig', newline='') as file:
        writer = csv.DictWriter(file, fieldnames=['음원 이름', '대사', '수업', '구분', '상태'])
        writer.writeheader()
        writer.writerows(rows)
    tts.prepare(tts.scripts(source=script), HERE / '검수목록.csv')
    checks = tts.read_csv(HERE / '검수목록.csv')
    for row in checks:
        if row['음원 이름'].startswith('prime_m'):
            row['대본 검수'] = '사용자 위임 AI 검수 완료'
    with (HERE / '검수목록.csv').open('w', encoding='utf-8-sig', newline='') as file:
        writer = csv.DictWriter(file, fieldnames=tts.FIELDS)
        writer.writeheader()
        writer.writerows(checks)
    report = ['# 소수 짧은 판 추가 검수', '', f'2026-11-02 · 기준 team-base {revision}. 사용자 위임 AI 검수이며 사람 교사 검수가 아니다.', '',
              '새 조각 prime_m1~prime_m11 11개를 확인했다. 기존 동백꽃 36개·소수 20개 납품본에는 없는 파일이다. 여덟 조각의 표현을 보완했고 조각 이름·판 8·구분·필수·발문 수준·기다림은 유지했다.', '',
              '- 어떤 소수로든이라는 표현을 적어도 하나의 소수로 바꾸어 존재와 전칭을 구분했다.',
              '- 소수의 개수와 비율, 소수 간격의 매번 증가를 구분했다. 개수 25·168·1229와 30031=59×509는 기존 소수 검수의 계산을 재사용했다.',
              '- 유한 목록의 소수를 모두 곱하고 일을 더한 수 자체는 합성수일 수도 있다는 점을 필수 조각과 정리에서도 설명했다.',
              '- 암호 설명은 현재 안전성이나 알고리즘을 새로 검증하지 않고 증명 핵심 복습으로 바꾸었다. 기존 긴 판 AI 검수안의 변경 방향과 맞췄다.',
              '- 큰 소수를 하나도 찾지 않았다는 과장된 표현과 운전 중 숙제 수행 요청을 고쳤다.', '',
              '## 근거', '', '[유클리드 원론 IX.20](https://mathcs.clarku.edu/~djoyce/elements/bookIX/propIX20.html)의 유한 목록 밖 소수 논증과 기존 소수-AI검수결과.md의 계산·정의 확인을 재사용했다.', '',
              '## 인계', '', '소수-짧은판-AI검수안.csv 11행을 기존 소수-AI검수안.csv의 20행 뒤에 이어 반영한다. 앱의 최신 판 8 처리 코드와 함께 사용한다. 다른 담당자의 확정 대본이 다르면 해당 음원을 다시 제작한다.',
              '기존 납품본은 별도 검수안에 대응하며 원격 앱 원본과 대사가 다른 부분이 있다. 앱에 음원만 복사하지 말고 대본과 함께 대조해 통합한다.', '']
    (HERE / '소수-짧은판-AI검수결과.md').write_text('\n'.join(report), encoding='utf-8')
    print('추가 검수 11개, 전체 제작 목록 67개 준비')


if __name__ == '__main__':
    main()
