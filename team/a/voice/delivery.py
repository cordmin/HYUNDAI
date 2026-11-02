"""현재 대본·음원·AI 음성 검사 해시를 맞춰 현황과 관리자 전달 폴더를 만든다."""
import argparse
import csv
import json
import shutil

import lesson_tts as tts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', action='store_true')
    args = parser.parse_args()
    rows = tts.scripts(source=tts.HERE / '수업-대본-AI검수안.csv')
    checks = tts.read_csv(tts.HERE / '검수목록.csv')
    by_id = {r['음원 이름']: r for r in checks}
    output = tts.HERE / 'generated'
    counts = {prefix: {'total': 0, 'generated': 0, 'checked': 0, 'seconds': 0} for prefix in ['dongbaek', 'prime']}
    ready = []
    for row in rows:
        clip = row['음원 이름']
        count = counts[clip.split('_')[0]]
        count['total'] += 1
        by_id[clip]['청취 검수'] = ''
        if not tts.current(row, output):
            continue
        count['generated'] += 1
        meta = json.loads((output / (clip + '.json')).read_text(encoding='utf-8'))
        count['seconds'] += meta['seconds']
        review_file = output / (clip + '.audio-review.json')
        if not review_file.exists():
            continue
        review = json.loads(review_file.read_text(encoding='utf-8'))
        if review.get('passed') is True and review.get('sha256') == meta['sha256']:
            count['checked'] += 1
            by_id[clip]['청취 검수'] = 'AI 음성 검수 통과·사람 청취 아님'
            ready.append((clip, meta))
    with (tts.HERE / '검수목록.csv').open('w', encoding='utf-8-sig', newline='') as file:
        writer = csv.DictWriter(file, fieldnames=tts.FIELDS)
        writer.writeheader()
        writer.writerows(checks)
    text = ['# 음원 제작 현황', '', '2026-11-02 · 사용자 위임 AI 수행. 실제 생성 파일과 대본·검사 해시를 대조해 집계했다.', '',
            '| 수업 | 대상 | 생성 | AI 음성 검사 통과 | 전체 음원 합계 길이 |', '|---|---:|---:|---:|---:|']
    for prefix, name in [('dongbaek', '동백꽃'), ('prime', '소수')]:
        count = counts[prefix]
        text.append(f"| {name} | {count['total']} | {count['generated']} | {count['checked']} | {count['seconds']/60:.1f}분 |")
    text += ['', '합계 길이는 복습·짧은 정리·선택 조각을 모두 더한 값으로 실제 수업 한 판의 길이와 다르다. 발문 기다림도 포함하지 않는다.', '',
             '대본 검수는 AI 위임 검수이며 사람 교사 검수로 표시하지 않는다. 음성 검사도 AI 전사·잡음·잘림 점검이며 사람의 청취가 아니다.',
             'L4 AI 수업은 T2·S4 확정 대본이, L5 영상 음원은 S3 확정 각본이 없어 제작 대상과 파일명을 아직 확정할 수 없다.',
             '관리자 앱 통합과 에뮬레이터 실제 재생·내비 양보는 이번 결과물에 포함된 완료 항목이 아니다.', '']
    (tts.HERE / '제작-현황.md').write_text('\n'.join(text), encoding='utf-8')
    print(json.dumps(counts, ensure_ascii=False))
    if not args.package:
        return
    if len(ready) != len(rows):
        raise ValueError(f'검사 통과 {len(ready)}/{len(rows)}: 전체 전달 폴더 생성 전 미완료 파일을 확인하세요')
    tts.approved(rows, tts.HERE / '검수목록.csv')
    package = tts.HERE / 'delivery'
    package.mkdir(exist_ok=True)
    for clip, _ in ready:
        for suffix in ['.m4a', '.json', '.audio-review.json']:
            shutil.copy2(output / (clip + suffix), package / (clip + suffix))
        extra = output / (clip + '.brand-check.txt')
        if extra.exists():
            shutil.copy2(extra, package / extra.name)
    with (package / '음원길이.csv').open('w', encoding='utf-8-sig', newline='') as file:
        writer = csv.writer(file)
        writer.writerow(['음원', '초'])
        writer.writerows((f'lesson/{clip}', meta['seconds']) for clip, meta in ready)
    for name in ['동백꽃-AI검수안.csv', '소수-AI검수안.csv', '검수목록.csv', '수업-대본-AI검수안.csv', '동백꽃-AI검수결과.md', '소수-AI검수결과.md', '제작-현황.md']:
        shutil.copy2(tts.HERE / name, package / name)
    (package / '인계.md').write_text('''# 관리자 인계

사용자 위임에 따라 AI가 검수·제작한 동백꽃 36개와 소수 20개다. 사람 교사 검수·사람 청취로 표시하지 않는다.
대사와 파일 해시, AI 음성 검사 결과가 서로 일치하는 최신 파일만 담았다.
원본 대본과 이 폴더의 검수안을 비교해 반영 여부를 정한다. 원본과 다른 대사는 수정안을 반영하거나 해당 음원을 다시 제작해야 한다.
m4a만 android/app/src/main/assets/voices/lesson/에 복사하고 tools/Measure-Lesson-Voice.ps1을 실행한다.
이 폴더의 음원길이.csv는 확인 자료다. 앱의 길이 파일을 덮어쓰지 말고 측정 스크립트가 기존 전체 음원을 포함해 다시 만들게 한다.
실제 앱의 재생·발문 답 기록·길 안내 양보를 에뮬레이터에서 확인한다.
''', encoding='utf-8')
    print(f'전달 폴더: {package} ({len(ready)}개 음원)')


if __name__ == '__main__':
    main()
