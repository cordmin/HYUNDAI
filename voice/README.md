# 다잇 시연용 음성 제작

## 수업 음원 (담당 팀원 제작)

- 대본 목록: `voice/수업-대본.csv`. 「음원 이름」 칸의 이름, 「대사」, 어느 수업의 어떤 구분인지, 상태(대기·완성)가 있다.
- 받은 음원은 `android/app/src/main/assets/voices/lesson/`에 `음원 이름.m4a`로 넣는다.
- 넣은 뒤 `tools\Measure-Lesson-Voice.ps1`을 실행하면 실제 길이를 재어 시간 맞춤에 반영하고 대본 목록의 상태도 바꾼다.
- 대사를 고치려면 `lessons/`의 표를 고치고 `node tools/build-lessons.js`를 실행한다. 대본은 교사 검수 뒤에 녹음한다.

## 구성

- 대사 51개, 목소리 Cruz / Nika 각각 한 벌: 총 102개. 기존 48개에 대화용 3개를 추가했다.
- 2026-10-31 기준 저장소와 앱에는 Nika 51개만 들어 있다(`generated/nika/`의 WAV 51개와 생성 정보 JSON 51개, `android/app/src/main/assets/voices/nika/`). Cruz 음원은 저장소에 없다.
- `catalog.json`: 대사·말투·사용자 질문 예시·앱 장면·시연 순서의 원본.
- `generated/cruz/`, `generated/nika/`: 음원 WAV와 생성 정보 JSON. 대본이 바뀌면 이전 음원을 최신으로 취급하지 않는다.
- `generated/<voice>/takes/`: 새 테이크를 만들 때 이전 음원을 보존한다.
- `catalog.csv`: Android 내보내기 시 함께 생성하는 대본 표.

음색은 게임에서 사용한 Cruz·Nika를 재사용한다. 게임의 사투리·인물 성격·대사는 가져오지 않았다. 현대 한국어 표준어로 차분하고 짧게 안내하는 새 스타일을 사용한다.

## 작업실 열기

작업 폴더 PowerShell에서 다음을 실행한다.

```powershell
.\tools\Start-Voice-Studio.ps1
```

[음성 작업실](http://127.0.0.1:5058/)에서 상황별 필터, Cruz/Nika 비교 듣기, 대본 수정, 선택 생성, 새 테이크, 생성 중지를 사용할 수 있다. 한 작업이 진행 중이면 중복 생성을 막는다. 생성 중지는 진행 중인 API 응답까지 취소하는 것이 아니라 이후 호출을 중단한다. 강제 종료 뒤 잠금 파일이 남으면 실행 중인 생성 프로세스가 없는지 먼저 확인해야 한다.

기존 게임 툴을 실행하거나 수정하지 않는다. 기본 키 탐색 순서는 `GEMINI_API_KEY` 환경 변수 → `DAIT_GEMINI_KEY_FILE`로 지정한 파일 → 사용자가 알려준 기존 툴의 키 파일이다. 키를 다잇 폴더에 복사하거나 브라우저·APK에 넣지 않는다. 모델은 기존 툴과 같은 `gemini-3.8-flash-tts`다.

## 대량 생성 및 앱 반영

```powershell
# 완성된 동일 대사는 건너뛰고, 빠진 것만 생성한다.
python .\tools\dait_voice_studio.py --generate
# 한 대사의 두 목소리 또는 특정 목소리만 다시 만들기
python .\tools\dait_voice_studio.py --generate --ids prepare_pe --force
python .\tools\dait_voice_studio.py --generate --voices Nika --ids prepare_pe --force
# 완성·최신 여부 확인 후 Android assets로 복사
python .\tools\dait_voice_studio.py --export-android
.\tools\Build-App.ps1 -Install
```

현재 51개 대사를 두 목소리로 새로 생성하면 102개의 음성 API 요청을 사용한다. 이후 같은 대사·스타일·모델·목소리이면 재사용한다. API 인증/지원 오류는 즉시 중단하고, 일시 오류는 최대 3회 시도한다. 호출 간격은 기존 툴의 한도를 참고해 최소 6.3초로 둔다. 구체적인 과금은 사용 중인 Google 계정의 정책을 따른다.

## 시연 방법

작업실의 ‘시연 리허설’은 등교 준비, 하교 대화, 말하기 싫은 날, 정보 오류, 안전 대응, 짧은 요청의 여섯 순서를 제공한다. 진행자가 표시된 사용자 대사를 읽고 ‘응답 듣기’를 누른다. 응답이 끝나도 다음 대사를 자동으로 틀지 않는다.

> 2026-11-01 참고: 아래 두 문단은 이전 네이티브 화면 빌드 기준이다. 현재 앱은 WebView 화면(`dait-preview.html`)을 띄우고, 음성 재생과 듣기는 `VoiceSession.kt`가 맡으며, 대화 판단은 `dait-journey.js`에 있다. 현재 상태는 루트 `README.md`를 따른다.

Android 앱은 메뉴에서 상황을 선택하는 대신 **등교 준비 / 하교 대화**로 바로 시작한다. 질문을 읽은 뒤 기기 내 한국어 음성 인식으로 답을 받고, 제한된 규칙에 따라 다음 사전 제작 음원을 재생한다. 짧은 답 버튼도 같은 분기를 실행한다. PC 작업실의 리허설은 기존처럼 수동 재생한다.

학교·날씨·내비 데이터와 자유 대화 LLM은 연결되지 않았다. 실제로 마이크 인식이 동작한다는 점과 정보가 가상이라는 점을 구분한다. 기존 `control_privacy` 음원은 마이크를 사용하지 않는 PC 수동 시연용이며, 현재 Android 대화에서는 참조하지 않는다.

추가 생성 중 Gemini TTS의 `generate_requests_per_model_per_day`, 일 100회 한도(HTTP 429)가 확인됐다. 질문·준비 완료·미준비 응답의 6개 음원은 완성됐고, 추가 대사 8개 × 두 목소리 = 16개는 `pending-dialogue.json`에 남겼다. 이 미완성 목록은 앱에서 참조하지 않는다. 현재 흐름은 완성된 102개 중 문맥에 맞는 음원으로 끝까지 동작한다. 일일 한도 오류에는 불필요한 재시도를 중단한다.

## 검수

생성 파일마다 WAV 구조, PCM16/mono, 길이, 무음 여부, 피크/RMS, SHA-256을 기록한다. 이 검사는 청취 검수를 대신하지 않는다. 메타데이터의 `generated_not_listening_reviewed` 표시는 발음·억양을 사람이 최종 확인하기 전이라는 뜻이다. 출품 전 작업실에서 두 목소리를 듣고 필요한 대사만 새 테이크를 만든다.

[Google TTS 문서](https://ai.google.dev/gemini-api/docs/speech-generation)에 따라 스타일은 발화 본문이 아니라 `SpeechMetadata`로 보내며, Gemini 3.8의 기본 WAV 응답은 헤더를 중복 추가하지 않고 저장한다.
