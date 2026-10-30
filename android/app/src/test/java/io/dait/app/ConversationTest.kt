package io.dait.app

import org.junit.Assert.*
import org.junit.Test

class ConversationTest {
    @Test fun morningBranchesByAnswerAndFinishes() {
        val yes = Conversation(true)
        assertEquals("talk_ready", yes.answer("응, 챙겼어").clip)
        assertEquals("arrival_goodbye", yes.answer("체육이 기대돼").clip)
        assertTrue(yes.finished)
        val no = Conversation(true)
        assertEquals("talk_missing", no.answer("아직 안 챙겼어").clip)
        assertEquals("school_science", no.answer("과학").clip)
        assertEquals("arrival_goodbye", no.answer("우주가 궁금해").clip)
    }

    @Test fun unclearAndRepeatDoNotAdvance() {
        val talk = Conversation(true)
        assertEquals("error_repeat", talk.answer("점심 메뉴").clip)
        assertEquals(TalkStage.PREP, talk.stage)
        assertEquals("talk_prepare", talk.answer("다시 말해줘").clip)
        talk.answer("챙겼어")
        assertEquals("error_repeat", talk.answer("체육 아니고 과학").clip)
        assertEquals(TalkStage.SUBJECT, talk.stage)
        assertFalse(Conversation.acceptsRecognition(TalkStage.PREP, "그만 체육복 없어", "학교 근처에 빵집 있어"))
        assertTrue(Conversation.acceptsRecognition(TalkStage.PREP, "아직 안 챙겼어", "한 직판 챈 겠어"))
        assertTrue(Conversation.acceptsRecognition(TalkStage.AFTER_EVENT, "말하기 싫어", "오늘은 말하기 싫어"))
    }

    @Test fun afternoonRespondsToTopicAndRespectsStop() {
        val talk = Conversation(false)
        assertEquals("listen_ack", talk.answer("친구랑 피구 했어").clip)
        assertEquals("listen_parent", talk.answer("공을 피했어").clip)
        assertTrue(talk.finished)
        val rest = Conversation(false)
        assertEquals("rest_tired", rest.answer("오늘은 말하기 싫어").clip)
        assertTrue(rest.finished)
        assertEquals("rest_tired", rest.answer("피구").clip)
        assertEquals("listen_ack", Conversation(false).answer("그림 그렸어").clip)
        assertEquals("rest_skip", Conversation(false).answer("친구랑 싸웠어").clip)
    }
}
