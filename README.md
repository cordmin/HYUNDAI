# 다잇(DAIT) — 차 안에서 학교와 가정을 잇다

등하굣길 남은 시간에 맞춰 오늘의 학교 준비를 짧게 들려주고, 아이의 학교생활을 가족의 대화로 잇는 차량용 교육 메이트입니다.

현대자동차그룹 차량용 앱 개발 공모전(Pleos App Market) 출품을 준비하는 저장소입니다. 서비스 기획은 [`DAIT-기획안.md`](DAIT-기획안.md)에 접수양식 순서대로 정리되어 있습니다.

---

## 현재 구현 상태 (2026-10-30)

| 기능 | 상태 | 설명 |
|---|---|---|
| Pleos Connect Emulator 실행 | 구현 | Pleos Connect 2.1.0(Android 14, API 34)에 설치·실행 확인 |
| 주행 제한 처리 | 구현(일부) | `CarUxRestrictionsManager`로 주행 제한 상태를 받아 화면 전체를 "주차 후 이어갈게요" 안내로 덮음. 재생 중인 음원은 멈추지 않음. `MainActivity`의 시연용 주행 전환 함수(`toggleDrivingSim`)는 화면에서 아직 호출하지 않음 |
| 앱 화면 | 시연 | WebView로 띄운 `dait-preview.html`. 첫 화면 진입점은 등교 대화·학교 서류 간편 제출·진로·진학 안내. 하교 대화 진입점 없음 |
| 대화 규칙 엔진 | 시험 | `Conversation.kt`(등교·하교 분기, 쉬기, 도착 임박 마무리)와 단위 테스트 9개. 앱 화면과는 아직 연결되지 않음 |
| 음성 안내 | 시연 | 사전 제작 음원 51개(`assets/voices/nika`). Pleos TextToSpeech SDK는 현재 '준비 중' |
| 음성 인식 | 시험 | 오픈소스 Vosk 기반 기기 내 인식 클래스 `LocalVoiceInput.kt`. 모델 파일은 저장소에 없고 화면과 연결되지 않음. '말하기' 버튼은 알림창만 띄움. Pleos SpeechToText SDK는 현재 '준비 중' |
| 학교 정보(나이스) | 계획 | 화면의 준비물·급식은 예시 |
| 목적지·남은 시간(NaviHelper) | 계획 | 아직 화면에 없음 |
| 학교 서류 제출 화면 | 정리 필요 | 기획에서 제외한 기능. 제출 전 화면에서 빼거나 '보고서 재료 만들기(제출 없음)'로 변경 |

기획서와 맞추기 위해 화면에서 정리할 항목은 [`DAIT-기획안.md`](DAIT-기획안.md) 부록 B에 있습니다.

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
| 빌드 | JBR 21, Gradle 8.7, AGP 8.5.2, Kotlin 1.9.24, compileSdk 34, minSdk 28 |
| 빌드 스크립트 전제 | `Build-App.ps1`은 JDK를 `%USERPROFILE%\.jdks\jbr-21.0.11`에서 찾고, 에뮬레이터를 `emulator-5554`로 가정함. 다른 PC에서는 이 두 값을 맞춤 |
| 패키지명 | `io.dait.app` |
| 마이크 | 음성 인식을 시험하려면 Virtual Console에서 마이크 접근을 허용 |
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
| `android/app/src/main/java/io/dait/app/Conversation.kt` | 등교·하교 대화 규칙 엔진 |
| `android/app/src/main/java/io/dait/app/LocalVoiceInput.kt` | 기기 내 음성 인식 시험 코드 |
| `android/app/src/main/assets/dait-preview.html` | 현재 앱 화면(웹) |
| `android/app/src/main/assets/conversation-grammar.json` | 단계별 음성 인식 후보 단어 |
| `voice/` | 시연 음원 대본과 제작 도구 안내 |
| `design/` | 화면 시안과 검증 기록 |
| `GEMINI.md` | 화면 문구·차량 UX 작성 규칙 |

## 검증

- 단위 테스트 9개: `ConversationTest` 6개(등교 분기, 날씨·독서 분기, 불명확한 답, 하교 대화와 멈춤, 시간표 변경, 도착 임박 마무리), `JourneySessionTest` 3개. 앱 화면이 아직 호출하지 않는 규칙 엔진을 검사합니다.
- 이전 네이티브 화면 빌드의 설치·주차 상태·음원 재생 기록: `design/앱-실행-검증.md`, `voice/검증.md`.
- 현재 WebView 화면 빌드는 에뮬레이터 실행 화면(`design/device-screen.png`)만 확인했습니다. 주행 전환 동작은 아직 검증하지 않았습니다.
