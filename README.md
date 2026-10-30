# 다잇 — 등하교 대화 시연 앱

## 사용

Pleos에서 앱을 열고 **등교 준비 / 하교 대화**를 누른다. 질문이 자동 재생되고 마이크가 열린다. 답에 맞는 다음 응답이 이어진다. 음성 입력은 한 번에 최대 10초이며, 잘못 듣거나 모르는 답이면 원래 질문에서 다시 답할 수 있다. 화면의 짧은 답을 눌러도 같은 분기가 실행된다.

- 등교: 체육복 챙겼나요? → 챙겼어 / 아직 → 기대되는 수업 → 체육이면 인사, 과학이면 궁금한 것 질문 후 인사.
- 하교: 오늘은 어땠어요? → 하루 이야기 → 중립적인 후속 응답으로 한 번 더 듣기 → 가족에게 대화 넘기기.
- 그만 / 쉬고 싶어 / 말하기 싫어: 질문 종료.
- 다시 말해줘: 같은 질문 반복.
- 하단 멈추기: 마이크와 음원 모두 중지. 다시 듣기는 사용자가 직접 누른다.
- 상단 뒤로: 대화 종료. 상단 Cruz/Nika: 목소리 변경. 설정·상황 메뉴를 거치지 않는다.

앱은 제한된 대화 시연이다. 학교 정보는 가상 예시이며 실제 NEIS·내비·자유 대화 LLM과 연결되지 않았다. 음성 인식은 Vosk 한국어 모델로 **기기 내부**에서 실행한다. 녹음 파일·인식 문장을 저장하거나 서버로 보내지 않는다. 목소리 선택만 로컬에 저장한다. 회전/앱 재시작 때는 첫 화면으로 돌아가며 자동으로 대화를 재개하지 않는다.

주행 제한·차량 상태 불명·화면 이탈·오디오 포커스 손실 시 마이크와 음원을 중단한다. 주행 중 사용 승인을 뜻하지 않는다.

## 개발·빌드

Android Studio에서 `android/`를 연다. JBR 21.0.11, Gradle 8.7, AGP 8.5.2, Kotlin 1.9.24, API 34. package ID `io.dait.app`.

새로 clone한 뒤에는 아래 명령으로 공식 한국어 음성 인식 모델을 먼저 준비한다. 모델과 APK는 Git에 포함하지 않는다. 스크립트가 공식 ZIP의 SHA-256을 확인한다. Python 3.10 이상이 필요하다.

```powershell
python .\tools\Setup-Voice-Model.py
```

```powershell
.\tools\Build-App.ps1
.\tools\Build-App.ps1 -Install
```

결과물: `apk/DAIT-dialogue-debug.apk` (개발용 debug 서명).

이 PC의 AF_UNIX 연결 오류는 빌드 프로세스에만 없는 소켓 임시 경로를 지정해 TCP 대체 경로를 사용한다. 한글 경로의 테스트 클래스 로딩 문제는 생성물을 `%LOCALAPPDATA%/DAIT/build`에 출력해 피한다. 원본 소스·전역 보안 설정은 유지한다.

## 주요 파일

- `MainActivity.kt`: 간결한 화면, 재생·인식 전환, 차량 제한, 권한.
- `Conversation.kt`: 제한된 문맥과 응답 분기. 미지원 답은 다음 단계로 넘기지 않는다.
- `LocalVoiceInput.kt`: Vosk 마이크 입력, 취소·시간 제한·늦은 콜백 차단.
- `ContextRecognizer.kt`: 짧은 답의 문맥 인식과 범용 인식 결과 대조.
- `assets/conversation-grammar.json`: 질문별 한국어 인식 후보. 자유 대화용이 아니다.
- `assets/model-ko`: Vosk small Korean 0.22. 모델을 포함하므로 APK 용량이 커진다.
- `assets/voices`: Cruz/Nika 사전 제작 음원 102개. API 키는 없다.
- `voice/README.md`: 음성 제작 작업실과 추가 TTS 대기 내역.
- `design/lucide`: Lucide 원본 SVG와 라이선스. UI·앱 아이콘은 Lucide를 Android vector로 변환해 사용한다. 캐릭터는 제거했다.

## 검증

```powershell
# 단위 테스트·lint는 Build-App.ps1에 포함.
# 네이티브 인식 검사 APK 빌드 후 (반드시 DAIT Pleos 에뮬레이터만 지정):
adb -s emulator-5554 install -r <app-debug-androidTest.apk>
adb -s emulator-5554 shell am instrument -w io.dait.app.test/io.dait.app.OfflineVoiceCheck
```

음성 인식 검사는 Android 에뮬레이터의 실제 Vosk 엔진에 합성 한국어 PCM을 입력한다. 사람의 실발화 정확도나 차량 소음 환경의 성능을 보장하지 않는다. 상세 결과는 `design/대화형-시연-v3.md`에 기록한다.
