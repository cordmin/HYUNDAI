# 다잇 배움 뱃지

2026-11-03 · 사용자가 제공한 이미지와 지정한 이름을 기록한다. 다잇의 학습 보상을 나타내는 징표로 사용한다.

## 이름과 원본 배열

왼쪽 위부터 오른쪽으로 읽고, 다음 줄로 내려가는 순서다.

| 순서 | 원본 위치 | 이름 | 개별 PNG |
|---|---|---|---|
| 1 | 위 왼쪽 | 첫 발견 | [first-discovery.png](first-discovery.png) |
| 2 | 위 가운데 | 국어 | [korean.png](korean.png) |
| 3 | 위 오른쪽 | 수학 | [math.png](math.png) |
| 4 | 아래 왼쪽 | 탐험 | [exploration.png](exploration.png) |
| 5 | 아래 가운데 | 골고루 탐험가 | [well-rounded-explorer.png](well-rounded-explorer.png) |
| 6 | 아래 오른쪽 | 생활 속 발견가 | [everyday-discoverer.png](everyday-discoverer.png) |

## 보관과 제작 방식

- [원본 PNG](source/learning-badges-original.png)는 사용자가 제공한 파일 그대로 복사했다. 원본 크기는 1548 × 983이다.
- 여섯 개별 PNG는 기본 제공 image_gen으로 각 뱃지만 분리하도록 처리한 이미지다. 흰 배경을 유지했다.
- AI 분리본은 픽셀 단위 원본 크롭이 아니며 세부 표현과 해상도가 원본과 다를 수 있다. 디자인 확인의 기준은 보존한 원본이다.
- 파일별 크기·SHA-256·이름·원본 위치는 [manifest.json](manifest.json)에 기록한다.
- 앱에 자동 지급하거나 표시하는 코드는 이번 자료 보관에 포함되지 않는다.

## 결정된 범위

여섯 뱃지의 이름, 원본에서의 대응 관계, 배움 보상의 징표라는 용도를 기록한다.
획득 조건·횟수·거리·재생 시간·중복 지급·등급은 아직 정하지 않았다. 그림의 숫자 3과 5만으로 획득 조건을 확정하지 않는다.
EDUIT(에듀잇)·DoIT(두잇: 아이켄두잇)이라는 기존 보상 이름 후보의 최종 선택과는 별개다.

## 이미지 처리 프롬프트

입력은 위 원본 한 장이다. 아래 공통 프롬프트의 `{subject}`에 각 항목을 넣어 기본 제공 image_gen을 여섯 번 사용했다. CLI/API 키는 사용하지 않았다.

```text
Extract ONLY the {subject} from the provided original 2x3 badge sheet. This is an asset extraction/crop task for an app, not a redesign. Output one single badge centered on plain white background with narrow white padding. Preserve the exact original badge artwork, colors, metallic border, shape, characters, symbols, text and numerals unchanged. Do not include any of the other five badges, no new elements, no label or caption. Keep the entire badge including its border visible.
```

| 파일 ID | subject |
|---|---|
| first-discovery | top-left green shield badge, open book and gold star |
| korean | top-middle red hexagonal badge with a Korean girl reading a red book bearing 가 and a yellow flower |
| math | top-right blue circular badge with plus, multiplication cross, triangle ruler |
| exploration | bottom-left yellow and green shield badge with compass, mountains and a folded map |
| well-rounded-explorer | bottom-middle multicolor hexagonal badge with book, plus, compass, and large numeral 3 |
| everyday-discoverer | bottom-right green circular badge with magnifying glass, leaf, house and large numeral 5 |
