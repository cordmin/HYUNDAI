package io.dait.app

enum class TalkStage { PREP, SUBJECT, MORNING_DETAIL, AFTER_EVENT, AFTER_DETAIL, DONE }

data class TalkReply(val clip: String, val title: String, val prompt: String = "")

/**
 * Bounded, educational car conversation engine.
 * Connects school context (schedule, supplies, curiosity) with in-cabin family dialogue.
 */
class Conversation(val morning: Boolean) {
    companion object {
        fun wantsQuiet(raw: String): Boolean {
            val value = raw.replace(Regex("\\s"), "")
            return listOf("그만", "쉬고", "쉴래", "쉬자", "피곤", "말하기싫", "하기싫", "귀찮", "안할래").any { value.contains(it) }
        }

        fun acceptsRecognition(stage: TalkStage, candidate: String, reference: String): Boolean {
            val value = candidate.replace(Regex("\\s"), "")
            val free = reference.replace(Regex("\\s"), "")
            if (wantsQuiet(value)) return wantsQuiet(free)
            if (value.isBlank() || value.contains("<UNK>")) return false
            if (value.contains("다시")) return free.contains("다시")
            return when (stage) {
                TalkStage.PREP -> listOf("챙", "챈", "체육복", "아직", "아니", "가져", "비", "우산").any { free.contains(it) } || free in listOf("응", "네", "예")
                TalkStage.SUBJECT -> listOf("체육", "과학", "독서", "책", "국어", "좋아", "다").any { value.contains(it) && free.contains(it) }
                TalkStage.AFTER_EVENT -> value.length >= 3
                TalkStage.MORNING_DETAIL, TalkStage.AFTER_DETAIL -> value.length >= 2
                else -> true
            }
        }
    }

    var stage: TalkStage = if (morning) TalkStage.PREP else TalkStage.AFTER_EVENT
        private set

    var reply: TalkReply = if (morning) {
        TalkReply("talk_prepare", "체육복 챙겼나요?", "오늘 시간표에 체육이 있어요. 가방을 확인해 볼까요?")
    } else {
        TalkReply("afternoon_welcome", "오늘은 어땠어요?", "학교에서 가장 기억나는 일 하나 들려줄래?")
    }
        private set

    val finished get() = stage == TalkStage.DONE

    val stageTag: String get() = when (stage) {
        TalkStage.PREP -> "등교 준비 · 준비물 확인"
        TalkStage.SUBJECT -> "오늘의 수업 · 시간표 확인"
        TalkStage.MORNING_DETAIL -> "호기심 탐구 · 오늘의 질문"
        TalkStage.AFTER_EVENT -> "오늘의 하루 · 활동 이야기"
        TalkStage.AFTER_DETAIL -> "공감 대화 · 이야기 나누기"
        TalkStage.DONE -> if (morning) "등교 완료 · 좋은 하루 보내요" else "하교 완료 · 가족과 함께하는 저녁"
    }

    val choices: List<String> get() = when (stage) {
        TalkStage.PREP -> listOf("챙겼어", "아직", "비 와")
        TalkStage.SUBJECT -> listOf("체육", "과학", "독서")
        TalkStage.MORNING_DETAIL -> listOf("우주가 궁금해", "실험이 기대돼", "다녀올게요")
        TalkStage.AFTER_EVENT -> listOf("친구랑 피구 했어", "그림 그렸어", "쉬고 싶어")
        TalkStage.AFTER_DETAIL -> listOf("공을 피했어", "칭찬받았어", "그만 이야기할래")
        TalkStage.DONE -> emptyList()
    }

    fun answer(raw: String): TalkReply {
        if (finished) return reply
        val value = raw.replace(Regex("[^가-힣a-zA-Z0-9]"), "").lowercase()
        fun has(vararg words: String) = words.any { value.contains(it) }

        if (wantsQuiet(value)) {
            stage = TalkStage.DONE
            reply = TalkReply("rest_tired", "편하게 쉬어요", "조금 쉬고 싶구나. 조용히 함께 갈게.")
            return reply
        }

        if (has("다시", "못들었", "못들엇", "뭐라고")) return reply

        var nextStage = stage
        val next = when (stage) {
            TalkStage.PREP -> when {
                has("아직", "안챙", "못챙", "안가져", "없어", "아니") -> {
                    nextStage = TalkStage.SUBJECT
                    TalkReply("talk_missing", "어떤 수업이 기대돼요?", "아직 못 챙겼군요. 주차 후 확인해요. 오늘은 어떤 수업이 가장 기대돼요?")
                }
                has("비", "우산", "비와", "비온") -> {
                    nextStage = TalkStage.SUBJECT
                    TalkReply("weather_rain", "비가 와요. 우산 챙겨요!", "비가 오는 날이네요. 우산은 안전하게 주차한 뒤 챙겨 주세요.")
                }
                has("챙", "가져", "응", "네", "예", "맞아") -> {
                    nextStage = TalkStage.SUBJECT
                    TalkReply("talk_ready", "어떤 수업이 기대돼요?", "잘 챙겼네요! 오늘은 어떤 수업이 가장 기대돼요?")
                }
                else -> null
            }

            TalkStage.SUBJECT -> when {
                has("체육") && !has("과학") -> {
                    nextStage = TalkStage.DONE
                    TalkReply("arrival_goodbye", "체육, 즐겁게 하고 와요", "체육 즐겁게 하고 와요! 오늘도 좋은 하루 보내.")
                }
                has("과학") && !has("체육") -> {
                    nextStage = TalkStage.MORNING_DETAIL
                    TalkReply("school_science", "무엇이 궁금해요?", "오늘 과학 시간에 어떤 게 궁금해? 정답을 맞히는 질문은 아니야.")
                }
                has("독서", "책", "국어") -> {
                    nextStage = TalkStage.MORNING_DETAIL
                    TalkReply("school_reading", "기억나는 이야기 있어?", "최근에 읽은 이야기에서 기억나는 장면이 있어? 한 장면만 들려줘도 좋아.")
                }
                else -> null
            }

            TalkStage.MORNING_DETAIL -> if (value.length >= 2) {
                nextStage = TalkStage.DONE
                TalkReply("arrival_goodbye", "잘 다녀와요", "오늘도 좋은 하루 보내! 돌아오는 길에 또 이야기 들려줘.")
            } else null

            TalkStage.AFTER_EVENT -> when {
                has("속상", "슬퍼", "슬펐", "싸웠", "싫었", "힘들") -> {
                    nextStage = TalkStage.DONE
                    TalkReply("rest_skip", "편하게 쉬어가요", "속상한 일이 있었구나. 지금 이야기하지 않아도 괜찮아. 편하게 쉬어가자.")
                }
                has("다르", "달라", "달랐", "안했", "취소", "바뀌") -> {
                    nextStage = TalkStage.AFTER_DETAIL
                    TalkReply("afternoon_changed", "시간표와 달랐군요", "오늘은 시간표와 다르게 수업했구나. 실제로 했던 이야기를 들려줘.")
                }
                value.length >= 3 -> {
                    nextStage = TalkStage.AFTER_DETAIL
                    TalkReply("listen_ack", "조금 더 들려줄래요?", "그런 일이 있었구나! 가장 재미있었던 순간은 언제였어?")
                }
                else -> null
            }

            TalkStage.AFTER_DETAIL -> if (value.length >= 2) {
                nextStage = TalkStage.DONE
                TalkReply("listen_parent", "가족의 하루도 들어볼까요?", "들려줘서 고마워요. 이번에는 함께 탄 가족의 하루도 들어볼까요?")
            } else null

            TalkStage.DONE -> reply
        }

        if (next == null) return TalkReply("error_repeat", "한 번 더 말해 줄래요?", "잘 듣지 못했어요. 한 번만 다시 말씀해 주세요.")
        stage = nextStage
        reply = next
        return reply
    }

    /** Triggers safe early conclusion based on navigation ETA. */
    fun triggerEtaShort(): TalkReply {
        stage = TalkStage.DONE
        reply = TalkReply("eta_short", "도착까지 얼마 남지 않았어요", "도착까지 얼마 남지 않았어요. 가방과 소지품을 챙겨요!")
        return reply
    }
}
