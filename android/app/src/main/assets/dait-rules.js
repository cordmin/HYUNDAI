// tools/build-rules.js가 rules/교사규칙표.csv에서 만든 파일이다. 직접 고치지 않는다.
(function (root) {
  const data = {
  "rules": [
    {
      "id": 1,
      "rank": 10,
      "name": "시험 당일 등교",
      "mode": "morning",
      "levels": [
        "중",
        "고"
      ],
      "words": [
        "시험",
        "고사",
        "지필"
      ],
      "when": "당일",
      "subject": "",
      "title": "오늘은 시험 보는 날",
      "desc": "사인펜과 시계를 확인해요",
      "prep": "컴퓨터용 사인펜",
      "type": "confirm",
      "first": "오늘은 시험 보는 날이에요. 컴퓨터용 사인펜 챙겼어요? 시계는 디지털시계 말고 바늘 시계로 챙겨요.",
      "last": "지금까지 준비한 만큼만 보여 주면 충분해요. 잘 다녀와요.",
      "firstClip": "temp/r1_1",
      "lastClip": "temp/r1_2"
    },
    {
      "id": 2,
      "rank": 10,
      "name": "시험 당일 등교(초등)",
      "mode": "morning",
      "levels": [
        "초"
      ],
      "words": [
        "시험",
        "고사",
        "단원평가"
      ],
      "when": "당일",
      "subject": "",
      "title": "오늘은 시험 보는 날",
      "desc": "필통을 확인해요",
      "prep": "필통",
      "type": "confirm",
      "first": "오늘은 시험이 있는 날이에요. 필통 챙겼어요?",
      "last": "아는 만큼 차분히 풀면 돼요. 잘 다녀와요.",
      "firstClip": "temp/r2_1",
      "lastClip": "temp/r2_2"
    },
    {
      "id": 3,
      "rank": 11,
      "name": "시험 끝나는 날 하교",
      "mode": "afternoon",
      "levels": [
        "중",
        "고"
      ],
      "words": [
        "시험",
        "고사",
        "지필"
      ],
      "when": "마지막날",
      "subject": "",
      "title": "시험 끝, 수고했어요",
      "desc": "오늘은 시험 얘기 말고 쉬어요",
      "prep": "",
      "type": "story",
      "first": "시험 끝났네요. 정말 수고했어요. 오늘은 시험 얘기 말고, 제일 하고 싶은 거 하나만 말해 줄래요?",
      "last": "좋아요. 오늘은 푹 쉬어요.",
      "firstClip": "temp/r3_1",
      "lastClip": "temp/r3_2"
    },
    {
      "id": 4,
      "rank": 12,
      "name": "시험 기간 하교",
      "mode": "afternoon",
      "levels": [
        "중",
        "고"
      ],
      "words": [
        "시험",
        "고사",
        "지필"
      ],
      "when": "당일",
      "subject": "",
      "title": "오늘도 수고했어요",
      "desc": "시험 이야기는 안 해도 괜찮아요",
      "prep": "",
      "type": "notice",
      "first": "오늘도 수고했어요. 시험 이야기는 안 해도 괜찮아요.",
      "last": "집에 가서 잠깐 쉬고 시작해요.",
      "firstClip": "temp/r4_1",
      "lastClip": "temp/r4_2"
    },
    {
      "id": 5,
      "rank": 13,
      "name": "시험 전날 하교",
      "mode": "afternoon",
      "levels": [
        "중",
        "고"
      ],
      "words": [
        "시험",
        "고사",
        "지필"
      ],
      "when": "전날",
      "subject": "",
      "title": "곧 시험이에요",
      "desc": "오늘은 일찍 자는 게 좋아요",
      "prep": "컴퓨터용 사인펜",
      "type": "confirm",
      "first": "곧 시험이네요. 컴퓨터용 사인펜이랑 바늘 시계 챙겨 뒀어요?",
      "last": "오늘 밤에는 일찍 자는 게 제일 좋은 공부예요.",
      "firstClip": "temp/r5_1",
      "lastClip": "temp/r5_2"
    },
    {
      "id": 6,
      "rank": 14,
      "name": "시험 전날 등교",
      "mode": "morning",
      "levels": [
        "중",
        "고"
      ],
      "words": [
        "시험",
        "고사",
        "지필"
      ],
      "when": "전날",
      "subject": "",
      "title": "곧 시험이에요",
      "desc": "아는 것을 한 번 더 봐요",
      "prep": "",
      "type": "notice",
      "first": "곧 시험이네요. 오늘은 새로운 것보다 아는 것을 한 번 더 봐요.",
      "last": "",
      "firstClip": "temp/r6_1",
      "lastClip": ""
    },
    {
      "id": 7,
      "rank": 15,
      "name": "시험 앞둔 기간 등교",
      "mode": "morning",
      "levels": [
        "중",
        "고"
      ],
      "words": [
        "시험",
        "고사",
        "지필"
      ],
      "when": "앞둔 기간",
      "subject": "",
      "title": "시험이 가까워졌어요",
      "desc": "마음 쓰이는 과목을 나눠요",
      "prep": "",
      "type": "story",
      "first": "시험이 가까워졌네요. 요즘 제일 마음 쓰이는 과목이 있어요? 말 안 해도 괜찮아요.",
      "last": "말해 줘서 고마워요. 오늘 하나씩만 해 봐요.",
      "firstClip": "temp/r7_1",
      "lastClip": "temp/r7_2"
    },
    {
      "id": 8,
      "rank": 15,
      "name": "시험 앞둔 기간 하교",
      "mode": "afternoon",
      "levels": [
        "중",
        "고"
      ],
      "words": [
        "시험",
        "고사",
        "지필"
      ],
      "when": "앞둔 기간",
      "subject": "",
      "title": "오늘도 수고했어요",
      "desc": "쉬는 시간도 준비예요",
      "prep": "",
      "type": "story",
      "first": "오늘도 수고했어요. 시험 준비하다 쉴 때 뭐 하고 싶어요?",
      "last": "좋아요. 쉬는 것도 준비예요.",
      "firstClip": "temp/r8_1",
      "lastClip": "temp/r8_2"
    },
    {
      "id": 9,
      "rank": 20,
      "name": "현장체험학습 전날 하교",
      "mode": "afternoon",
      "levels": [
        "초",
        "중",
        "고"
      ],
      "words": [
        "체험학습",
        "현장학습",
        "수학여행",
        "수련",
        "소풍"
      ],
      "when": "전날",
      "subject": "",
      "title": "곧 체험학습이에요",
      "desc": "가정통신문 준비물을 확인해요",
      "prep": "가정통신문 확인",
      "type": "notice",
      "first": "곧 현장체험학습이에요. 가정통신문의 준비물을 오늘 저녁에 함께 확인해요.",
      "last": "",
      "firstClip": "temp/r9_1",
      "lastClip": ""
    },
    {
      "id": 10,
      "rank": 20,
      "name": "현장체험학습 당일 등교",
      "mode": "morning",
      "levels": [
        "초",
        "중",
        "고"
      ],
      "words": [
        "체험학습",
        "현장학습",
        "수학여행",
        "수련",
        "소풍"
      ],
      "when": "당일",
      "subject": "",
      "title": "오늘은 밖에서 배우는 날",
      "desc": "가장 기대되는 것을 나눠요",
      "prep": "가정통신문 확인",
      "type": "story",
      "first": "오늘은 밖에서 배우는 날이에요. 제일 기대되는 게 뭐예요?",
      "last": "재미있게 다녀와요. 돌아오는 길에 들려줘요.",
      "firstClip": "temp/r10_1",
      "lastClip": "temp/r10_2"
    },
    {
      "id": 11,
      "rank": 20,
      "name": "현장체험학습 당일 하교",
      "mode": "afternoon",
      "levels": [
        "초",
        "중",
        "고"
      ],
      "words": [
        "체험학습",
        "현장학습",
        "수학여행",
        "수련",
        "소풍"
      ],
      "when": "당일",
      "subject": "",
      "title": "오늘 어땠어요?",
      "desc": "기억나는 장면 하나면 돼요",
      "prep": "",
      "type": "story",
      "first": "오늘 체험학습 어땠어요? 제일 기억나는 장면 하나만 들려줘요.",
      "last": "들려줘서 고마워요. 오늘은 편하게 쉬어요.",
      "firstClip": "temp/r11_1",
      "lastClip": "temp/r11_2"
    },
    {
      "id": 12,
      "rank": 25,
      "name": "체육대회 전날 하교",
      "mode": "afternoon",
      "levels": [
        "초",
        "중",
        "고"
      ],
      "words": [
        "체육대회",
        "운동회",
        "체육한마당",
        "스포츠"
      ],
      "when": "전날",
      "subject": "",
      "title": "곧 체육대회예요",
      "desc": "체육복을 미리 챙겨요",
      "prep": "체육복",
      "type": "notice",
      "first": "곧 체육대회네요. 체육복은 오늘 저녁에 미리 챙겨 둬요.",
      "last": "",
      "firstClip": "temp/r12_1",
      "lastClip": ""
    },
    {
      "id": 13,
      "rank": 25,
      "name": "체육대회 당일 등교",
      "mode": "morning",
      "levels": [
        "초",
        "중",
        "고"
      ],
      "words": [
        "체육대회",
        "운동회",
        "체육한마당",
        "스포츠"
      ],
      "when": "당일",
      "subject": "",
      "title": "오늘은 체육대회",
      "desc": "체육복과 물을 확인해요",
      "prep": "체육복",
      "type": "confirm",
      "first": "오늘은 체육대회 날이에요. 체육복이랑 물 챙겼어요?",
      "last": "신나게 하고 와요. 다치지 않게 조심해요.",
      "firstClip": "temp/r13_1",
      "lastClip": "temp/r13_2"
    },
    {
      "id": 14,
      "rank": 25,
      "name": "체육대회 당일 하교",
      "mode": "afternoon",
      "levels": [
        "초",
        "중",
        "고"
      ],
      "words": [
        "체육대회",
        "운동회",
        "체육한마당",
        "스포츠"
      ],
      "when": "당일",
      "subject": "",
      "title": "오늘 어땠어요?",
      "desc": "가장 신났던 순간을 나눠요",
      "prep": "",
      "type": "story",
      "first": "오늘 체육대회 어땠어요? 제일 신났던 순간 하나만 들려줘요.",
      "last": "들려줘서 고마워요. 오늘 많이 움직였으니 푹 쉬어요.",
      "firstClip": "temp/r14_1",
      "lastClip": "temp/r14_2"
    },
    {
      "id": 15,
      "rank": 30,
      "name": "축제 당일 등교",
      "mode": "morning",
      "levels": [
        "초",
        "중",
        "고"
      ],
      "words": [
        "축제",
        "학예",
        "발표회",
        "합창"
      ],
      "when": "당일",
      "subject": "",
      "title": "오늘은 축제 날",
      "desc": "기대되는 무대를 나눠요",
      "prep": "",
      "type": "story",
      "first": "오늘은 학교 축제 날이에요. 제일 기대되는 게 뭐예요?",
      "last": "즐겁게 보내고 와요.",
      "firstClip": "temp/r15_1",
      "lastClip": "temp/r15_2"
    },
    {
      "id": 16,
      "rank": 30,
      "name": "축제 당일 하교",
      "mode": "afternoon",
      "levels": [
        "초",
        "중",
        "고"
      ],
      "words": [
        "축제",
        "학예",
        "발표회",
        "합창"
      ],
      "when": "당일",
      "subject": "",
      "title": "오늘 어땠어요?",
      "desc": "기억나는 장면 하나면 돼요",
      "prep": "",
      "type": "story",
      "first": "오늘 축제 어땠어요? 제일 기억나는 장면 하나만 들려줘요.",
      "last": "들려줘서 고마워요.",
      "firstClip": "temp/r16_1",
      "lastClip": "temp/r16_2"
    },
    {
      "id": 17,
      "rank": 35,
      "name": "방학식 등교",
      "mode": "morning",
      "levels": [
        "초",
        "중",
        "고"
      ],
      "words": [
        "방학식",
        "방학선언",
        "종업식"
      ],
      "when": "당일",
      "subject": "",
      "title": "오늘은 방학식",
      "desc": "짐을 챙겨 올 수 있어요",
      "prep": "빈 가방",
      "type": "notice",
      "first": "오늘은 방학식이에요. 사물함 짐을 가져올 수 있으니 가방을 넉넉하게 챙겨요.",
      "last": "",
      "firstClip": "temp/r17_1",
      "lastClip": ""
    },
    {
      "id": 18,
      "rank": 35,
      "name": "방학식 하교",
      "mode": "afternoon",
      "levels": [
        "초",
        "중",
        "고"
      ],
      "words": [
        "방학식",
        "방학선언",
        "종업식"
      ],
      "when": "당일",
      "subject": "",
      "title": "한 학기 수고했어요",
      "desc": "방학에 하고 싶은 것을 나눠요",
      "prep": "",
      "type": "story",
      "first": "한 학기 정말 수고했어요. 방학에 제일 하고 싶은 게 뭐예요?",
      "last": "좋아요. 꼭 해 봐요.",
      "firstClip": "temp/r18_1",
      "lastClip": "temp/r18_2"
    },
    {
      "id": 19,
      "rank": 35,
      "name": "개학 등교",
      "mode": "morning",
      "levels": [
        "초",
        "중",
        "고"
      ],
      "words": [
        "개학"
      ],
      "when": "당일",
      "subject": "",
      "title": "오랜만에 학교 가는 날",
      "desc": "반가운 얼굴을 떠올려요",
      "prep": "",
      "type": "story",
      "first": "오랜만에 학교 가는 날이네요. 제일 보고 싶은 친구가 있어요?",
      "last": "즐거운 하루 보내요.",
      "firstClip": "temp/r19_1",
      "lastClip": "temp/r19_2"
    },
    {
      "id": 20,
      "rank": 40,
      "name": "입학식 등교",
      "mode": "morning",
      "levels": [
        "초"
      ],
      "words": [
        "입학식"
      ],
      "when": "당일",
      "subject": "",
      "title": "오늘은 입학식",
      "desc": "설레는 마음을 나눠요",
      "prep": "",
      "type": "story",
      "first": "오늘은 입학식이에요. 지금 마음이 어때요?",
      "last": "씩씩하게 다녀와요.",
      "firstClip": "temp/r20_1",
      "lastClip": "temp/r20_2"
    },
    {
      "id": 21,
      "rank": 40,
      "name": "졸업식 등교",
      "mode": "morning",
      "levels": [
        "초",
        "중",
        "고"
      ],
      "words": [
        "졸업식"
      ],
      "when": "당일",
      "subject": "",
      "title": "오늘은 졸업식",
      "desc": "축하해요",
      "prep": "",
      "type": "notice",
      "first": "오늘은 졸업식이에요. 정말 축하해요.",
      "last": "오늘 하루 충분히 즐겨요.",
      "firstClip": "temp/r21_1",
      "lastClip": "temp/r21_2"
    },
    {
      "id": 22,
      "rank": 45,
      "name": "공개수업 등교",
      "mode": "morning",
      "levels": [
        "초",
        "중",
        "고"
      ],
      "words": [
        "공개수업",
        "참관수업"
      ],
      "when": "당일",
      "subject": "",
      "title": "오늘은 공개수업",
      "desc": "평소처럼 하면 돼요",
      "prep": "",
      "type": "notice",
      "first": "오늘은 공개수업이 있어요. 평소처럼 하면 돼요.",
      "last": "",
      "firstClip": "temp/r22_1",
      "lastClip": ""
    },
    {
      "id": 23,
      "rank": 45,
      "name": "건강검진 등교",
      "mode": "morning",
      "levels": [
        "초",
        "중",
        "고"
      ],
      "words": [
        "건강검진",
        "신체검사"
      ],
      "when": "당일",
      "subject": "",
      "title": "오늘은 건강검진",
      "desc": "학교 안내를 확인해요",
      "prep": "학교 안내 확인",
      "type": "notice",
      "first": "오늘은 건강검진이 있어요. 필요한 준비는 학교 안내를 확인해요.",
      "last": "",
      "firstClip": "temp/r23_1",
      "lastClip": ""
    },
    {
      "id": 24,
      "rank": 45,
      "name": "진로체험 등교",
      "mode": "morning",
      "levels": [
        "중",
        "고"
      ],
      "words": [
        "진로"
      ],
      "when": "당일",
      "subject": "",
      "title": "오늘은 진로 활동",
      "desc": "궁금한 것을 나눠요",
      "prep": "",
      "type": "story",
      "first": "오늘은 진로 활동이 있어요. 뭐가 궁금해요?",
      "last": "돌아오는 길에 들려줘요.",
      "firstClip": "temp/r24_1",
      "lastClip": "temp/r24_2"
    },
    {
      "id": 31,
      "rank": 90,
      "name": "오늘의 질문 과학",
      "mode": "morning",
      "levels": [
        "초",
        "중",
        "고"
      ],
      "words": [],
      "when": "",
      "subject": "과학",
      "title": "오늘 과학 시간엔 뭐가 궁금해?",
      "desc": "",
      "prep": "",
      "type": "question",
      "first": "",
      "last": ""
    },
    {
      "id": 32,
      "rank": 90,
      "name": "오늘의 질문 체육",
      "mode": "morning",
      "levels": [
        "초",
        "중",
        "고"
      ],
      "words": [],
      "when": "",
      "subject": "체육",
      "title": "체육 시간에 해 보고 싶은 게 있어?",
      "desc": "",
      "prep": "",
      "type": "question",
      "first": "",
      "last": ""
    },
    {
      "id": 33,
      "rank": 91,
      "name": "오늘의 질문 미술",
      "mode": "morning",
      "levels": [
        "초",
        "중",
        "고"
      ],
      "words": [],
      "when": "",
      "subject": "미술",
      "title": "오늘은 뭘 그리고 싶어?",
      "desc": "",
      "prep": "",
      "type": "question",
      "first": "",
      "last": ""
    },
    {
      "id": 34,
      "rank": 91,
      "name": "오늘의 질문 음악",
      "mode": "morning",
      "levels": [
        "초",
        "중",
        "고"
      ],
      "words": [],
      "when": "",
      "subject": "음악",
      "title": "오늘 부르고 싶은 노래 있어?",
      "desc": "",
      "prep": "",
      "type": "question",
      "first": "",
      "last": ""
    },
    {
      "id": 35,
      "rank": 92,
      "name": "오늘의 질문 국어",
      "mode": "morning",
      "levels": [
        "초",
        "중",
        "고"
      ],
      "words": [],
      "when": "",
      "subject": "국어",
      "title": "기억나는 이야기 하나 있어?",
      "desc": "",
      "prep": "",
      "type": "question",
      "first": "",
      "last": ""
    },
    {
      "id": 36,
      "rank": 92,
      "name": "오늘의 질문 영어",
      "mode": "morning",
      "levels": [
        "초",
        "중",
        "고"
      ],
      "words": [],
      "when": "",
      "subject": "영어",
      "title": "요즘 입에 맴도는 영어 단어 있어?",
      "desc": "",
      "prep": "",
      "type": "question",
      "first": "",
      "last": ""
    },
    {
      "id": 37,
      "rank": 93,
      "name": "오늘의 질문 수학",
      "mode": "morning",
      "levels": [
        "초",
        "중",
        "고"
      ],
      "words": [],
      "when": "",
      "subject": "수학",
      "title": "오늘 수학에서 해 보고 싶은 문제 있어?",
      "desc": "",
      "prep": "",
      "type": "question",
      "first": "",
      "last": ""
    },
    {
      "id": 38,
      "rank": 93,
      "name": "오늘의 질문 사회",
      "mode": "morning",
      "levels": [
        "초",
        "중",
        "고"
      ],
      "words": [],
      "when": "",
      "subject": "사회",
      "title": "요즘 궁금한 세상 이야기 있어?",
      "desc": "",
      "prep": "",
      "type": "question",
      "first": "",
      "last": ""
    },
    {
      "id": 39,
      "rank": 94,
      "name": "오늘의 질문 도덕",
      "mode": "morning",
      "levels": [
        "초",
        "중",
        "고"
      ],
      "words": [],
      "when": "",
      "subject": "도덕",
      "title": "요즘 친구들과 자주 나누는 이야기가 뭐야?",
      "desc": "",
      "prep": "",
      "type": "question",
      "first": "",
      "last": ""
    },
    {
      "id": 40,
      "rank": 94,
      "name": "오늘의 질문 역사",
      "mode": "morning",
      "levels": [
        "초",
        "중",
        "고"
      ],
      "words": [],
      "when": "",
      "subject": "역사",
      "title": "만나 보고 싶은 옛날 사람 있어?",
      "desc": "",
      "prep": "",
      "type": "question",
      "first": "",
      "last": ""
    }
  ],
  "extras": {
    "rule_missing": "temp/rule_missing",
    "p_today": "temp/p_today",
    "p_have": "temp/p_have",
    "p_to_school": "temp/p_to_school",
    "p_to_home": "temp/p_to_home",
    "p_left": "temp/p_left",
    "p_day_1": "temp/p_day_1",
    "p_day_2": "temp/p_day_2",
    "p_day_3": "temp/p_day_3",
    "p_day_4": "temp/p_day_4",
    "p_day_5": "temp/p_day_5",
    "p_event": "temp/p_event",
    "p_pe_ready": "temp/p_pe_ready",
    "p_check": "temp/p_check",
    "p_nodata": "temp/p_nodata",
    "p_door_bag": "temp/p_door_bag",
    "s_1": "temp/s_1",
    "s_2": "temp/s_2",
    "s_3": "temp/s_3",
    "s_4": "temp/s_4",
    "s_5": "temp/s_5",
    "s_6": "temp/s_6",
    "s_7": "temp/s_7",
    "s_8": "temp/s_8",
    "s_9": "temp/s_9",
    "s_10": "temp/s_10",
    "s_11": "temp/s_11",
    "s_12": "temp/s_12",
    "s_13": "temp/s_13",
    "s_14": "temp/s_14",
    "s_15": "temp/s_15",
    "s_16": "temp/s_16",
    "s_17": "temp/s_17",
    "s_18": "temp/s_18",
    "s_19": "temp/s_19",
    "s_20": "temp/s_20",
    "s_21": "temp/s_21",
    "s_22": "temp/s_22",
    "s_23": "temp/s_23",
    "s_24": "temp/s_24",
    "s_25": "temp/s_25",
    "s_26": "temp/s_26",
    "s_27": "temp/s_27",
    "s_28": "temp/s_28",
    "s_29": "temp/s_29",
    "s_30": "temp/s_30",
    "s_31": "temp/s_31",
    "s_32": "temp/s_32",
    "s_33": "temp/s_33",
    "s_34": "temp/s_34",
    "s_35": "temp/s_35",
    "s_36": "temp/s_36",
    "s_37": "temp/s_37",
    "s_38": "temp/s_38",
    "s_39": "temp/s_39",
    "s_40": "temp/s_40",
    "s_41": "temp/s_41",
    "s_42": "temp/s_42",
    "s_43": "temp/s_43",
    "s_44": "temp/s_44",
    "s_45": "temp/s_45",
    "n_1": "temp/n_1",
    "n_2": "temp/n_2",
    "n_3": "temp/n_3",
    "n_4": "temp/n_4",
    "n_5": "temp/n_5",
    "n_6": "temp/n_6",
    "n_7": "temp/n_7",
    "n_8": "temp/n_8",
    "n_9": "temp/n_9",
    "n_10": "temp/n_10",
    "n_11": "temp/n_11",
    "n_12": "temp/n_12",
    "n_13": "temp/n_13",
    "n_14": "temp/n_14",
    "n_15": "temp/n_15",
    "n_16": "temp/n_16",
    "n_17": "temp/n_17",
    "n_18": "temp/n_18",
    "n_19": "temp/n_19",
    "n_20": "temp/n_20",
    "n_21": "temp/n_21",
    "n_22": "temp/n_22",
    "n_23": "temp/n_23",
    "n_24": "temp/n_24",
    "n_25": "temp/n_25",
    "n_26": "temp/n_26",
    "n_27": "temp/n_27",
    "n_28": "temp/n_28",
    "n_29": "temp/n_29",
    "n_30": "temp/n_30",
    "n_35": "temp/n_35",
    "n_40": "temp/n_40",
    "n_45": "temp/n_45",
    "n_50": "temp/n_50",
    "n_55": "temp/n_55",
    "n_60": "temp/n_60"
  },
  "subjects": [
    {
      "word": "국어",
      "clip": "temp/s_1"
    },
    {
      "word": "수학",
      "clip": "temp/s_2"
    },
    {
      "word": "영어",
      "clip": "temp/s_3"
    },
    {
      "word": "사회",
      "clip": "temp/s_4"
    },
    {
      "word": "과학",
      "clip": "temp/s_5"
    },
    {
      "word": "체육",
      "clip": "temp/s_6"
    },
    {
      "word": "음악",
      "clip": "temp/s_7"
    },
    {
      "word": "미술",
      "clip": "temp/s_8"
    },
    {
      "word": "도덕",
      "clip": "temp/s_9"
    },
    {
      "word": "역사",
      "clip": "temp/s_10"
    },
    {
      "word": "기술가정",
      "clip": "temp/s_11"
    },
    {
      "word": "정보",
      "clip": "temp/s_12"
    },
    {
      "word": "한문",
      "clip": "temp/s_13"
    },
    {
      "word": "진로",
      "clip": "temp/s_14"
    },
    {
      "word": "실과",
      "clip": "temp/s_15"
    },
    {
      "word": "창의적체험활동",
      "clip": "temp/s_16"
    },
    {
      "word": "창체",
      "clip": "temp/s_17"
    },
    {
      "word": "자율",
      "clip": "temp/s_18"
    },
    {
      "word": "동아리",
      "clip": "temp/s_19"
    },
    {
      "word": "봉사",
      "clip": "temp/s_20"
    },
    {
      "word": "바른생활",
      "clip": "temp/s_21"
    },
    {
      "word": "슬기로운생활",
      "clip": "temp/s_22"
    },
    {
      "word": "즐거운생활",
      "clip": "temp/s_23"
    },
    {
      "word": "안전한생활",
      "clip": "temp/s_24"
    },
    {
      "word": "스포츠",
      "clip": "temp/s_25"
    },
    {
      "word": "독서",
      "clip": "temp/s_26"
    },
    {
      "word": "한국사",
      "clip": "temp/s_27"
    },
    {
      "word": "통합사회",
      "clip": "temp/s_28"
    },
    {
      "word": "통합과학",
      "clip": "temp/s_29"
    },
    {
      "word": "공통국어",
      "clip": "temp/s_30"
    },
    {
      "word": "공통수학",
      "clip": "temp/s_31"
    },
    {
      "word": "공통영어",
      "clip": "temp/s_32"
    },
    {
      "word": "문학",
      "clip": "temp/s_33"
    },
    {
      "word": "미적분",
      "clip": "temp/s_34"
    },
    {
      "word": "확률과통계",
      "clip": "temp/s_35"
    },
    {
      "word": "세계사",
      "clip": "temp/s_36"
    },
    {
      "word": "지리",
      "clip": "temp/s_37"
    },
    {
      "word": "물리",
      "clip": "temp/s_38"
    },
    {
      "word": "화학",
      "clip": "temp/s_39"
    },
    {
      "word": "생명과학",
      "clip": "temp/s_40"
    },
    {
      "word": "지구과학",
      "clip": "temp/s_41"
    },
    {
      "word": "일본어",
      "clip": "temp/s_42"
    },
    {
      "word": "중국어",
      "clip": "temp/s_43"
    },
    {
      "word": "화법",
      "clip": "temp/s_44"
    },
    {
      "word": "언어",
      "clip": "temp/s_45"
    }
  ]
};
  root.DAIT_RULES = data;
  if (typeof module !== 'undefined') module.exports = data;
})(typeof window !== 'undefined' ? window : globalThis);
