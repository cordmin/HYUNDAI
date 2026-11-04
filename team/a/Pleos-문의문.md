# T3 · Pleos 문의 발송 준비본

2026-11-04. 발송 전 검토용. 아직 발송하지 않았다. 수신처는 공식 도움말에 안내된 **appdevchallenge@hyundai-partners.com**이다. 참가자 실명·연락처는 발송 계정에서 작성하며 이 공개 문서에는 넣지 않는다.

## 복사할 제목

[차량용 앱 개발 공모전 기술 문의] 다잇 — 음성 수업 앱의 주행 중 사용 및 SDK 제공 범위

## 복사할 본문

안녕하세요. Pleos Connect 차량용 앱 공모전 출품을 준비 중인 다잇 개발팀입니다.

다잇은 이동 시간에 맞춰 미리 준비한 수업 음원을 재생하고, 등하교 시 학교 준비 안내와 짧은 질문을 제공하는 앱입니다. 주행 중 수업 음성을 재생하고, 아이를 포함한 동승자의 짧은 답을 기기 안에서 인식합니다. 답하지 않아도 수업은 그대로 진행되며, 운전자에게 답을 요구하지 않습니다. 현재 Pleos Connect Emulator 2.1.0(Android 14)에서 개발 중이고, 화면은 앱 안의 WebView로 구현했습니다(외부 웹 탐색 기능은 없습니다). NaviHelper로 목적지·남은 시간·거리를 받고 Vehicle State로 동승자 쪽 문 상태를 확인합니다. 현재 수업을 차량에서 즉석 생성하는 기능은 없습니다.

아래 사항의 허용 범위와 필요한 신청·심사 절차를 확인하고 싶습니다.

1. 카테고리와 주행 중 사용: 주 기능이 음성 교육 콘텐츠인 앱을 Music/Audio로 등록할 수 있나요? Kids 또는 다른 카테고리가 적합하다면 주행 중 음원 청취의 허용 범위도 안내 부탁드립니다. 운전자의 음성 답변과 동승자의 음성 답변에 적용되는 기준이 다른지도 궁금합니다. Music/Audio 개발 가이드의 MediaBrowserService, MediaSession, 스티어링 휠 키 요건이 공모전 제출에도 적용되는지, App Market 출시 단계의 요건인지도 알려 주세요. 수업 음원은 어느 하위 카테고리에 해당하나요?
2. DO 선언과 화면: 현재 Android 표준 distractionOptimized 메타데이터와 CarUxRestrictionsManager를 적용하고, 주행 중 설정·검색을 닫고 짧은 문장과 재생 제어만 표시합니다. 이 방식 외에 Pleos의 별도 DO 신청·검증이 필요한가요? WebView로 만든 화면이 주행 중 제한되는 브라우저 기능의 미디어 앱에 해당하나요? 에뮬레이터 동작을 실제 차량·App Market 승인으로 볼 수 없음을 전제로 문의드립니다.
3. 내비 화면 뒤의 음성 처리: 내비게이션이 전면에 있을 때 Foreground Service에서 교육 음원 재생과 선택적 기기 내 음성 인식을 유지할 수 있나요? 내비 안내와 통화가 오디오 포커스를 가져가면 수업을 멈추도록 했습니다. 서비스 종류·권한·음성 인식 사용 시점에 필요한 추가 조건이 있나요?
4. 음성·위치 SDK: 프로젝트 생성 안내에 준비 중으로 표시된 TextToSpeech·SpeechToText·FusedLocation을 이번 공모전 중 사용할 수 있는지, 제공 일정이나 대체 권장 방식이 있는지 궁금합니다. 제공된다면 한국어 기기 내 모드와 Emulator 2.1.0 지원 범위도 알려 주세요. 현재는 사전 제작 음원과 Vosk 기기 내 인식을 사용합니다.
5. 위치 권한 대체 사용: FusedLocation 제공 전 Android 기본 위치 API와 ACCESS_COARSE_LOCATION·ACCESS_FINE_LOCATION을 사용할 수 있나요? 보호자가 켠 경우에만 위치를 받아 집·학교 도착 여부를 판단하며, 내비 뒤에서 Foreground Service로 유지할 경우 사전 협의나 승인 절차가 필요한지도 문의드립니다. 위치정보 서비스 등록·신고 확인이 공모전 단계에도 필요한지 함께 알려 주세요.
6. Gleo 연계 가능 범위: 릴리즈 노트에서 LLM SDK 제공 종료(2026-10-19)와 Gleo Interface 안내를 확인했습니다. Gleo Interface와 별개로, 앱이 Gleo 또는 Pleos 언어 모델에 텍스트 생성을 요청할 공식 방법이 남아 있나요? 없다면 현재 미지원으로 이해해도 될까요? 공모전 중 App Schema 심사·연동을 진행할 수 있는지도 궁금합니다.
7. 차량 퍼미션: Vehicle SDK 퍼미션은 사전 협의·승인 범위에서만 선언할 수 있다고 안내되어 있습니다. 내릴 때 안내를 위해 pleos.car.permission.CAR_DOORS를 사용하려면 어떤 절차가 필요한가요? NaviHelper의 NAVI_ROUTE, NAVI_ROUTE_SEARCH에도 승인이 필요한가요? 공모전 제출에도 필요한지 함께 알려 주세요.

관련 공식 문서나 신청 경로를 항목별로 안내해 주시면 개발과 제출 범위를 정하는 데 도움이 되겠습니다. 감사합니다.

보낸 사람:

## 검토 근거와 발송 전 확인

- [프로젝트 생성·SDK 사용 신청](https://document.pleos.ai/docs/pleos-only/create-my-project): Vehicle State·NaviHelper는 사용 가능, 음성·위치 SDK는 준비 중으로 표시되어 있다(2026-11-03 확인).
- [앱 카테고리](https://document.pleos.ai/docs/pleos-only/vehicle-app-planning-guide/app-category), [주행 규제 정책](https://document.pleos.ai/docs/pleos-only/vehicle-app-planning-guide/driving-restiction-policy): 카테고리와 주행 상태에 따른 차이가 있어 앱의 실제 허용 여부를 질문한다.
- [공식 도움말·문의](https://appdevchallenge.auto-hmg.io/guide/help)에서 위 문의 수신처를 확인했다. SDK 기술 문의는 해당 창구에서 적절한 담당자에게 전달해 달라고 요청한다.
- 7번 문항과 1·6번의 수정은 A01 조사(`team/a/pleos-조사.md`)를 반영한 것이다.
- 「보낸 사람」은 비워 두었다. 보내는 사람이 직접 적는다.
- 발송자가 회신받을 계정과 팀 정보를 확인한다. 앱 서명 키·API 키·시크릿을 첨부하지 않는다.
- 회신을 받으면 이 문서 아래 날짜·문항별 답·공식 근거를 기록한다. 회신 전에는 정책 승인·SDK 지원 확정이라고 기획서에 쓰지 않는다.
