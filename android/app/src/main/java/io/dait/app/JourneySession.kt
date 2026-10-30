package io.dait.app

enum class Scene(val label: String, val destination: String, val minutes: Int, val title: String, val speech: String) {
    MORNING("등굣길", "학교", 12, "체육복,\n챙겨볼까요?", "오늘 학교 안내 예시에는 체육복이 있어요. 준비물을 함께 확인해 볼까요?"),
    AFTERNOON("하굣길", "집", 12, "오늘,\n재밌던 일은?", "오늘 학교에서 가장 재밌었던 일은 뭐였어? 편하게 이야기해 줘."),
    ARRIVAL("도착 안내", "학교", 2, "가방,\n잊지 마세요.", "도착하면 가방을 차에 두고 내리지 않도록 확인해요.")
}

class JourneySession(initialScene: Scene = Scene.MORNING) {
    var scene = initialScene
        private set
    var restricted = true
        private set
    var playing = false
        private set
    var skipped = false
        private set

    fun setRestriction(blocked: Boolean) {
        restricted = blocked
        if (blocked) playing = false
    }

    fun selectScene(next: Scene): Boolean {
        if (restricted) return false
        scene = next
        playing = false
        skipped = false
        return true
    }

    fun play(): Boolean {
        if (restricted) return false
        skipped = false
        playing = true
        return true
    }

    fun stop() { playing = false }
    fun skip() { playing = false; skipped = true }
}
