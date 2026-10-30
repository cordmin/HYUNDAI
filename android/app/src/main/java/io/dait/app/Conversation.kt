package io.dait.app

enum class TalkStage { PREP, SUBJECT, MORNING_DETAIL, AFTER_EVENT, AFTER_DETAIL, DONE }

data class TalkReply(val clip: String, val title: String)

/** Bounded, local conversation. Unrecognised replies do not silently advance. */
class Conversation(val morning: Boolean) {
    companion object {
        fun wantsQuiet(raw: String): Boolean {
            val value = raw.replace(Regex("\\s"), "")
            return listOf("그만", "쉬고", "쉴래", "쉬자", "피곤", "말하기싫", "하기싫").any { value.contains(it) }
        }

        fun acceptsRecognition(stage: TalkStage, candidate: String, reference: String): Boolean {
            val value = candidate.replace(Regex("\\s"), "")
            val free = reference.replace(Regex("\\s"), "")
            if (wantsQuiet(value)) return wantsQuiet(free)
            if (value.isBlank() || value.contains("<UNK>")) return false
            if (value.contains("다시")) return free.contains("다시")
            return when (stage) {
                TalkStage.PREP -> listOf("챙", "챈", "체육복", "아직", "아니", "가져").any { free.contains(it) } || free in listOf("응", "네", "예")
                TalkStage.SUBJECT -> (value.contains("체육") && free.contains("체육")) || (value.contains("과학") && free.contains("과학"))
                TalkStage.AFTER_EVENT -> value.length >= 3
                else -> true
            }
        }
    }
    var stage = if (morning) TalkStage.PREP else TalkStage.AFTER_EVENT
        private set
    var reply = if (morning) TalkReply("talk_prepare", "체육복 챙겼나요?")
        else TalkReply("afternoon_welcome", "오늘은 어땠어요?")
        private set
    val finished get() = stage == TalkStage.DONE
    val choices: List<String> get() = when (stage) {
        TalkStage.PREP -> listOf("챙겼어", "아직")
        TalkStage.SUBJECT -> listOf("체육", "과학")
        TalkStage.MORNING_DETAIL -> listOf("우주가 궁금해", "아직 모르겠어")
        TalkStage.AFTER_EVENT -> listOf("피구 했어", "그림 그렸어", "쉬고 싶어")
        TalkStage.AFTER_DETAIL -> listOf("친구랑 해서 좋았어", "그만 이야기할래")
        TalkStage.DONE -> emptyList()
    }

    fun answer(raw: String): TalkReply {
        if (finished) return reply
        val value = raw.replace(Regex("[^가-힣a-zA-Z0-9]"), "").lowercase()
        fun has(vararg words: String) = words.any { value.contains(it) }
        if (wantsQuiet(value)) {
            stage = TalkStage.DONE
            reply = TalkReply("rest_tired", "편하게 쉬어요")
            return reply
        }
        if (has("다시", "못들었", "못들엇")) return reply
        var nextStage = stage
        val next = when (stage) {
            TalkStage.PREP -> when {
                has("아직", "안챙", "못챙", "안가져", "없어", "아니") -> {
                    nextStage = TalkStage.SUBJECT
                    TalkReply("talk_missing", "어떤 수업이 기대돼요?")
                }
                has("챙", "가져", "응", "네", "예", "맞아") -> {
                    nextStage = TalkStage.SUBJECT
                    TalkReply("talk_ready", "어떤 수업이 기대돼요?")
                }
                else -> null
            }
            TalkStage.SUBJECT -> when {
                has("체육") && !has("과학") -> {
                    nextStage = TalkStage.DONE
                    TalkReply("arrival_goodbye", "체육, 즐겁게 하고 와요")
                }
                has("과학") && !has("체육") -> {
                    nextStage = TalkStage.MORNING_DETAIL
                    TalkReply("school_science", "무엇이 궁금해요?")
                }
                else -> null
            }
            TalkStage.MORNING_DETAIL -> if (value.length >= 2) {
                nextStage = TalkStage.DONE
                TalkReply("arrival_goodbye", "잘 다녀와요")
            } else null
            TalkStage.AFTER_EVENT -> when {
                has("속상", "슬퍼", "슬펐", "싸웠", "싫었") -> {
                    nextStage = TalkStage.DONE
                    TalkReply("rest_skip", "편하게 쉬어가요")
                }
                value.length >= 3 -> {
                    nextStage = TalkStage.AFTER_DETAIL
                    TalkReply("listen_ack", "조금 더 들려줄래요?")
                }
                else -> null
            }
            TalkStage.AFTER_DETAIL -> if (value.length >= 2) {
                nextStage = TalkStage.DONE
                TalkReply("listen_parent", "가족의 하루도 들어볼까요?")
            } else null
            TalkStage.DONE -> reply
        }
        // Keep the original question and stage when the answer cannot be mapped.
        if (next == null) return TalkReply("error_repeat", "한 번 더 말해 줄래요?")
        stage = nextStage
        reply = next
        return reply
    }
}
