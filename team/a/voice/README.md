# 다잇 대본 검수와 음원 제작

> 2026-11-06 정리: 현재 공동 기준은 main입니다. 기본 수업과 짧은 판·시연 음원 제작 및 앱 반영 범위는 [현재 작업 상태](../../../현재-작업상태.md)를 따릅니다. 아래는 초기 제작 도구·검토본의 기록입니다. L4·L5 대본/각본 대기는 해소됐고, N2는 깃털로 확정됐습니다. 납품 폴더의 예전 음원을 현재 앱 파일 위에 일괄 복사하지 않습니다.

2026-11-02. 사용자가 본인의 검수·음원 제작 업무를 AI에 위임했다. 대본 검수와 음성 검사는 AI 수행으로 기록하며 사람 교사의 검수나 사람의 청취로 표시하지 않는다.
앱 원본과 다른 담당자 파일은 유지하고 이 폴더에서 통합 전 산출물을 만든다. 브랜치는 codex/dait-lesson-voice, 기준은 team-base다.

## 담당 업무

| 번호 | 업무 | 마감 | 산출물·의존 조건 |
|---|---|---|---|
| L1 | 동백꽃 대본 검수 | 11/5 | 36개 검토, 대사 26개 수정. AI 검수 결과와 CSV 작성 |
| L2 | 동백꽃 36개 음원 | 11/8 | AI 검수안으로 제작·음성 검사. S2 관리자 원본 반영은 별도 |
| L3 | 소수 31개 음원 | 11/9 | 제작용 AI 검수: 20개 검토, 대사 15개 수정. S1 관리자 상태는 변경하지 않음 |
| L4 | AI 수업 음원 | 11/10 | T2·S4의 확정 대본과 음원 이름 대기 |
| L5 | 시연 영상용 음원 | 11/11 | S3에서 각본 1·2 중 선택한 확정 각본 대기 |

외부 검수용 문서의 아홉 항목은 확인하지 못했다. 대신 저장소 대본 전체와 직접 연 출처를 바탕으로 검토했다.
관리자가 통합할 검수안이며, 사람이 검수한 것으로 원본 표시를 바꾸지 않는다. 현재 생성·검사 수는 제작-현황.md를 본다.

## 결과물

- 동백꽃-AI검수결과.md, 소수-AI검수결과.md: 조각별 판단과 근거.
- 동백꽃-AI검수안.csv, 소수-AI검수안.csv: 원본과 같은 수업 CSV 형식의 수정안.
- 수업-대본-AI검수안.csv: 동백꽃 36개, 소수 31개의 제작 목록. sky·price 제외.
- 검수목록.csv: 대사 해시, 대본 검수 종류, 음성 검사 상태. 실명·계정·키를 적지 않는다.
- generated/: m4a, 생성 정보와 AI 음성 검사 JSON. 중간 파일은 Git에서 제외한다.
- 동백꽃-검토용.md: 수정 전 사본으로, 음원 제작에는 쓰지 않는다.

## 실행

Python, google-genai >= 2.25.0, ffmpeg, ffprobe가 필요하다. 이 PC는 google-genai 2.33.0이다.
키는 GEMINI_API_KEY 환경 변수나 --key-file로 지정한 저장소 밖 기존 파일에서만 읽고 내용을 출력·저장하지 않는다.

```powershell
python team/a/voice/lesson_tts.py status --script team/a/voice/수업-대본-AI검수안.csv
python team/a/voice/test_lesson_tts.py
# GEMINI_API_KEY를 해당 터미널에 설정한 뒤 실행
python team/a/voice/lesson_tts.py generate --script team/a/voice/수업-대본-AI검수안.csv --lesson dongbaek --limit 36
python team/a/voice/lesson_tts.py generate --script team/a/voice/수업-대본-AI검수안.csv --lesson prime --limit 31
python team/a/voice/check_audio.py
```

대사 수정 뒤 검수목록을 갱신할 때는 prepare --script team/a/voice/수업-대본-AI검수안.csv를 쓴다. 바뀐 대사의 기존 검수 표시는 지워진다.
대본 검수 칸에는 실제 수행에 따라 사용자 위임 AI 검수 완료 또는 교사 검수 완료를 기록한다. 검수는 자동 승인하지 않는다.
대본·모델·말투·목소리와 파일 해시가 맞는 음원은 재사용한다. 재제작 때 이전 테이크는 generated/takes에 보존한다.
오류·한도 초과 때 중단하며 자동 반복하지 않는다. 강제 종료 뒤 잠금이 남으면 실행 중인 생성 프로세스가 없는지 확인하고 잠금 파일만 지운다.

## 음원과 검사

Gemini 3.8 Flash TTS, Nika, 한국어 표준어. AAC m4a, 24kHz mono, 128kbps 설정이다. 발문 뒤 9초 기다림은 앱이 처리하므로 음원에 덧붙이지 않는다.
WAV 구조·길이·무음, AAC 변환 결과·길이·해시를 검사한다. 생성된 음원을 원고 없이 Gemini 3.8 Flash에 제공해 실제 발화를 전사하고 잡음·잘림·알아듣기 어려운 발음·화자 변경을 검사한다.
전사 일치도 97% 미만이거나 음성 문제가 있으면 재확인한다. 숫자 표기처럼 같은 발화가 다르게 적힌 경우에는 AI가 이유를 남기고 판정한다.
AI 음성 검사이며 사람의 청취가 아니다. 전사 일치만으로 모든 억양이 최상이라고 보장하거나 Nika 음색의 신원을 별도 인증하지 않는다. 재생성해 해시가 달라지면 다시 검사한다.

## 관리자 통합

관리자는 검수안과 원본을 대조해 lessons/에 반영하고, 일치하는 m4a를 android/app/src/main/assets/voices/lesson/에 넣는다.
tools/Measure-Lesson-Voice.ps1로 실제 길이를 측정하고 앱용 파일을 다시 만든다. 에뮬레이터의 실제 재생·길 안내 뒤 이어 듣기는 통합 후 확인한다.
관리자가 대사를 다르게 확정한 조각은 해당 파일만 다시 만든다. L4·L5의 다른 담당자 확정 대본·각본은 임의로 정하지 않는다.

## 확인 근거

- [업무표](https://docs.google.com/spreadsheets/d/1bhxm2FbT8Ik6BkoBpdFsRk1QrTmfUjgRkefXwtEwCwg/edit): L1~L5. 전체 표는 저장소에 넣지 않는다.
- [기준 브랜치](https://github.com/cordmin/HYUNDAI/tree/team-base): README, 기획안, 수업 대본, 제작 도구.
- [현황 보고서](https://claude.ai/artifact/VukCK7V8JenP7ux32WNeyu#37a495d5-976b): Chrome에서 본문 확인. 자동 시험 161개·개발 빌드 통과는 보고서 작성자 기록이다.
- [Gemini TTS](https://ai.google.dev/gemini-api/docs/speech-generation), [음성 이해](https://ai.google.dev/gemini-api/docs/audio): Interactions API, 모델과 스타일, 음원 전사 방식.
- 작품·수학의 출처는 각각의 AI 검수 결과 문서에 있다.

## 2026-11-02 저녁 추가 작업

team-base dbb3282에 소수 짧은 판(판 8)의 prime_m1~prime_m11 11개가 추가되어 별도 검수·제작한다.
기존 56개에 11개를 더한 전체 대상은 67개이며, 새 검수안은 소수-짧은판-AI검수안.csv와 검수 결과 문서에 있다.
소수 원래 판 20개 CSV와 짧은 판 11개 CSV를 함께 반영해야 한다. 앱의 최신 판 8 처리 코드도 필요하다.
현재 작업 폴더에 있던 앱·도구 파일 삭제 변경은 이번 작업에서 수정하거나 커밋하지 않는다.
