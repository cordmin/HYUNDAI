# 다잇(DAIT) — 차 안에서 학교와 가정을 잇다

등하굣길 남은 시간에 맞춰 오늘의 학교 준비를 짧게 들려주고, 아이의 학교생활을 가족의 대화로 잇는 차량용 교육 메이트입니다.

현대자동차그룹 차량용 앱 개발 공모전(Pleos App Market) 출품을 준비하는 저장소입니다. 서비스 기획은 [`DAIT-기획안.md`](DAIT-기획안.md)에 접수양식 순서대로 정리되어 있습니다.

---

## 현재 구현 상태 (2026-10-31)

| 기능 | 상태 | 설명 |
|---|---|---|
| Pleos Connect Emulator 실행 | 구현 | Pleos Connect 2.1.0(Android 14, API 34)에 설치·실행 확인 |
| 주행 제한 처리 | 구현 | `CarUxRestrictionsManager`로 주행 제한 상태를 받음. 대화 중이면 문장 하나와 큰 버튼 둘(다시 듣기·넘기기)만 있는 주행 화면으로 바꾸고 음성은 이어 감. 대화 중이 아니면 "주차 후 이어갈게요"만 표시하고 설정 화면은 닫음. 오른쪽 아래 시연 조작(주행, 8분 전, 2분 전)은 앱에서 `toggleDrivingSim`을 호출하고 브라우저 미리보기에서는 직접 전환함. 시연 조작으로 실제 주행 제한은 풀리지 않음 |
| 앱 화면 | 시연 | WebView로 띄운 `dait-preview.html`. 첫 화면은 '지금 여정' 하나를 크게 보여 줌: 내비 목적지가 학교면 등교, 집이면 하교, 수업일 오전·오후면 그에 맞게, 주말이면 다음 수업일 준비. 큰 카드에 출발지→목적지 여정 선과 남은 시간, 한 문장, 시작 버튼. 오른쪽에 준비물·점심 칸과 오늘의 질문(또는 다른 여정으로 가는 길). 여정에 따라 색이 바뀜(등교 남색, 하교 노을빛, 주말 보라). 대화는 짧은 답 버튼으로 진행하고 '다시 듣기'·'넘기기' 버튼이 있음. 아침에 고른 과목을 기기에 남겨 하교 대화를 그 과목으로 시작하고, '쉬고 싶어'를 고르면 그날은 다시 묻지 않음. 음원이 '오늘' 기준이라 수업 없는 날은 음성을 틀지 않음 |
| 대화 규칙 엔진 | 시험 | `Conversation.kt`(등교·하교 분기, 쉬기, 도착 임박 마무리)와 단위 테스트 9개. 앱 화면과는 아직 연결되지 않음 |
| 음성 안내 | 시연 | 사전 제작 음원 51개(`assets/voices/nika`). Pleos TextToSpeech SDK는 현재 '준비 중' |
| 음성 인식 | 시험 | 오픈소스 Vosk 기반 기기 내 인식 클래스 `LocalVoiceInput.kt`. 모델 파일은 저장소에 없고 화면과 연결되지 않음. Pleos SpeechToText SDK는 현재 '준비 중' |
| 학교 정보(나이스) | 구현(일부) | 주차 중 '학교 설정'에서 학교·학년·반을 고르면 앞으로 7일의 시간표와 점심을 받아 기기에 저장하고, 통신이 끊기면 저장본을 씀. 초등·중·고 모두 검색되며 학교급에 맞는 시간표 창구(`elsTimetable`·`misTimetable`·`hisTimetable`)를 씀. 앱을 열 때만 받음. 학교를 설정하기 전에는 예시를 표시 |
| 준비물 | 시연 | 나이스에 준비물 항목이 없음. 시간표에 체육이 있으면 체육복 확인을 안내하고, 없으면 학교 안내를 확인하라고 표시 |
| 목적지·남은 시간(NaviHelper) | 구현(일부) | `NaviBridge`가 Pleos NaviHelper SDK 3.0.5에 연결해 길 안내 중 10초마다 목적지 이름과 남은 시간(초)·거리(m)를 받음. 남은 시간이 2분 이하면 새 질문 없이 준비물 확인으로 마무리. 목적지 이름이나 도로명 주소가 등록한 학교와 같으면 첫 화면이 등교 여정으로, 보호자가 학교 설정의 '지금 목적지를 집으로'로 등록한 곳이면 하교 여정으로 바뀜(자동 시작은 하지 않음). 이 버튼은 길 안내 중 학교가 아닌 목적지가 있을 때만 보이며, 설정 화면을 먼저 열어 두었다면 다음 내비 응답(최대 10초) 뒤에 나타남. 실제 값이 오면 시연 조작(8분 전·2분 전·목적지)은 잠김. 길 안내가 없을 때는 시연 조작을 씀 |

제출 전에 남은 확인 항목은 [`DAIT-기획안.md`](DAIT-기획안.md) 부록 B에 있습니다.

## 실행 방법

Windows PowerShell 기준입니다.

```powershell
# 1. Pleos 에뮬레이터 실행 (더블 클릭 가능)
.\run_pleos.bat
# 또는
powershell -ExecutionPolicy Bypass -File .\tools\Start-Pleos.ps1

# 2. 빌드, 단위 테스트, lint 후 에뮬레이터에 설치
powershell -ExecutionPolicy Bypass -File .\tools\Build-App.ps1 -Install

# 3. 브라우저에서 화면만 미리 보기 (더블 클릭 가능)
.\run_preview.bat
```

단위 테스트만 실행하려면 `android` 폴더에서 `gradlew.bat :app:testDebugUnitTest`를 실행합니다.

## 테스트 환경 및 필요한 설정

| 항목 | 값 |
|---|---|
| 플랫폼 | Android Automotive OS, Pleos Connect Emulator 2.1.0 (Android 14 / API 34, RAM 4GB, Cold boot) |
| 가상 기기 이름 | `DAIT_Pleos_2_1` (스크립트가 이 이름을 사용) |
| 빌드 | JBR 21, Gradle 8.7, AGP 8.5.2, Kotlin 1.9.24, compileSdk 34, minSdk 28. Pleos SDK 저장소(`nexus-playground.pleos.ai`)에서 NaviHelper를 받으므로 첫 빌드에 인터넷이 필요 |
| 빌드 스크립트 전제 | `Build-App.ps1`은 JDK를 `%USERPROFILE%\.jdks\jbr-21.0.11`에서 찾고, 에뮬레이터를 `emulator-5554`로 가정함. 다른 PC에서는 이 두 값을 맞춤 |
| 패키지명 | `io.dait.app` |
| 마이크 | 음성 인식을 시험하려면 Virtual Console에서 마이크 접근을 허용 |
| 인증키 | 앱과 브라우저 미리보기는 중계 서버 `https://relay-khaki-omega.vercel.app`을 거쳐 자료를 받으므로 팀원과 이용자에게 키가 필요 없음. 키는 Vercel의 `relay` 프로젝트 환경 변수(`NEIS_API_KEY`, `TOUR_API_KEY`)에만 두고, 바꾼 뒤에는 `npx.cmd vercel deploy --prod --yes --cwd relay`로 다시 올림 |
| 음성 인식 모델(선택) | Vosk 한국어 모델을 `android/app/src/main/assets/model-ko/`에 둠 (용량 때문에 저장소에서 제외) |

설치 과정과 점검 결과는 [`개발환경-점검.md`](개발환경-점검.md)에 있습니다.

## APK 위치

- 현재 빌드 스크립트 결과: `apk/DAIT-dialogue-debug.apk` (개발용 debug 빌드, 저장소에는 올리지 않음)
- 공모전 제출 형식: `apk/팀명_앱이름_release.apk` (실행 가능한 release 빌드). 제출 전에 `.gitignore`의 `/apk/` 제외 설정을 조정하거나 GitHub Releases에 올립니다.

## 주요 파일

| 경로 | 내용 |
|---|---|
| `DAIT-기획안.md` | 공모전 기획서(접수양식 1~8번 순서) |
| `android/app/src/main/java/io/dait/app/MainActivity.kt` | 앱 진입점, 주행 제한 연동, 웹 화면 표시 |
| `android/app/src/main/java/io/dait/app/NeisClient.kt` | 나이스 공개 데이터 호출 |
| `android/app/src/main/java/io/dait/app/NaviBridge.kt` | Pleos NaviHelper 연결, 남은 시간 전달 |
| `android/app/src/main/java/io/dait/app/Conversation.kt` | 등교·하교 대화 규칙 엔진 |
| `android/app/src/main/java/io/dait/app/LocalVoiceInput.kt` | 기기 내 음성 인식 시험 코드 |
| `relay/` | 인증키를 보관하고 허용한 나이스·관광공사 요청만 넘기는 중계 서버(Vercel). 시험은 이 폴더에서 `npm test` |
| `android/app/src/main/assets/dait-preview.html` | 현재 앱 화면(웹) |
| `android/app/src/main/assets/conversation-grammar.json` | 단계별 음성 인식 후보 단어 |
| `voice/` | 시연 음원 대본과 제작 도구 안내 |
| `design/` | 화면 시안과 검증 기록 |
| `GEMINI.md` | 화면 문구·차량 UX 작성 규칙 |

## 검증

- 단위 테스트 11개: `ConversationTest` 6개(등교 분기, 날씨·독서 분기, 불명확한 답, 하교 대화와 멈춤, 시간표 변경, 도착 임박 마무리), `JourneySessionTest` 3개는 앱 화면이 아직 호출하지 않는 규칙 엔진을 검사하고, `NeisClientTest` 2개는 나이스 호출 주소를 검사합니다.
- 이전 네이티브 화면 빌드의 설치·주차 상태·음원 재생 기록: `design/앱-실행-검증.md`, `voice/검증.md`.
- 현재 WebView 화면은 Pleos 에뮬레이터 2.1.0(가상 기기 `Automotive_1408p_landscape`, 앱 창 665×420)에 설치해 등교·하교 경로와 '주차/주행 전환' 버튼을 터치로 확인했습니다. 시험한 PC에 SDK 34가 없어 임시 복사본을 compileSdk 35로 빌드했습니다.
- 첫 화면 재설계는 브라우저 미리보기에서 등교·하교·주말 세 여정과 창 크기 2가지(1280×720, 665×420)에서 잘림 없음을 확인했습니다. 떠다니는 장식 없이 정적인 여정 선만 둬 Pleos 주행 안전 설계 가이드를 따릅니다.
- 목적지 판단은 브라우저 미리보기에서 학교 이름 일치, 도로명 주소 일치, 집 등록, 무관한 목적지, 길 안내 취소를 확인했습니다. 실제 내비로는 에뮬레이터에서 서울시청을 집으로 등록해 확인했습니다.
- 내비 연결은 Pleos 에뮬레이터에서 확인했습니다. 시험용 호출로 길 안내(판교→서울시청)를 시작하자 앱이 1740초·26000m를 받았고 내비 앱 화면의 29분·26km와 일치했습니다. 길 안내가 없을 때는 빈 값이 와서 화면이 무시합니다. 실제 차에서는 확인 안 함.
- 주행 화면 전환, 아침 과목을 하교에 잇기, 2분 전 마무리, 넘기기는 브라우저 미리보기에서 23개 경로를 확인했습니다.
- 학교급 확장은 브라우저 미리보기에서 초등(경기)·중학교(전남)·고등학교(전남) 각 한 곳으로 확인했습니다.
- 나이스 연결은 같은 에뮬레이터에서 인증키를 넣고 빌드해 확인했습니다. 한 주 시간표 27건이 모두 왔고 6교시가 있는 날도 6과목이 표시됩니다. 키 없이 빌드하면 하루 5건까지만 옵니다. 학교 검색부터 시간표·점심 표시까지 터치로 진행했고, 인터넷을 끊고 앱을 다시 켜도 저장본이 표시됩니다.
- 소리 없이 실행해 음원을 귀로 듣는 확인은 하지 않았습니다. 차량이 보내는 실제 주행 신호는 해당 명령이 막혀 있어 시험하지 못했고, 같은 처리 코드를 시험용 호출로 확인했습니다. `DAIT_Pleos_2_1`에서는 아직 실행하지 않았습니다.
- 에뮬레이터 부팅 직후 부하가 높으면 앱이 응답 없음으로 꺼질 수 있습니다. 부하가 내려간 뒤에는 수정 전 화면과 현재 화면 모두 정상이었습니다.
- `design/device-screen.png`는 화면을 정리하기 전 캡처입니다.
