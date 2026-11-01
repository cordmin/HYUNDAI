package io.dait.app

// 인증키는 중계 서버(relay/)에만 둔다. 앱은 나이스 대신 중계 서버에 묻는다.
object NeisClient {
    private const val BASE_URL = "https://relay-khaki-omega.vercel.app/neis/"
    private val allowedServices = setOf("schoolInfo", "classInfo", "elsTimetable", "misTimetable", "hisTimetable", "mealServiceDietInfo", "SchoolSchedule")

    fun requestUrl(service: String, query: String): String {
        require(service in allowedServices) { "Unknown service: $service" }
        return "$BASE_URL$service?$query"
    }

    fun fetch(service: String, query: String): String =
        HttpText.get(requestUrl(service, query))
}
