package io.dait.app

import java.net.HttpURLConnection
import java.net.URL

// 인증키는 중계 서버(relay/)에만 둔다. 앱은 나이스 대신 중계 서버에 묻는다.
object NeisClient {
    private const val BASE_URL = "https://relay-khaki-omega.vercel.app/neis/"
    private const val TIMEOUT_MS = 10_000
    private val allowedServices = setOf("schoolInfo", "classInfo", "elsTimetable", "misTimetable", "hisTimetable", "mealServiceDietInfo", "SchoolSchedule")

    fun requestUrl(service: String, query: String): String {
        require(service in allowedServices) { "Unknown service: $service" }
        return "$BASE_URL$service?$query"
    }

    fun fetch(service: String, query: String): String {
        val connection = URL(requestUrl(service, query)).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = TIMEOUT_MS
            connection.readTimeout = TIMEOUT_MS
            return connection.inputStream.bufferedReader().use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }
}
