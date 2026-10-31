package io.dait.app

import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

object NeisClient {
    private const val BASE_URL = "https://open.neis.go.kr/hub/"
    private const val TIMEOUT_MS = 10_000
    private val allowedServices = setOf("schoolInfo", "classInfo", "elsTimetable", "mealServiceDietInfo", "SchoolSchedule")

    fun requestUrl(service: String, query: String, apiKey: String): String {
        require(service in allowedServices) { "Unknown service: $service" }
        val url = "$BASE_URL$service?$query"
        return if (apiKey.isEmpty()) url else "$url&KEY=${URLEncoder.encode(apiKey, "UTF-8")}"
    }

    fun fetch(service: String, query: String, apiKey: String): String {
        val connection = URL(requestUrl(service, query, apiKey)).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = TIMEOUT_MS
            connection.readTimeout = TIMEOUT_MS
            return connection.inputStream.bufferedReader().use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }
}
