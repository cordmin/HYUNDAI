package io.dait.app

// 한국관광공사 국문 관광정보 서비스를 중계 서버(relay/)를 거쳐 부른다.
object TourClient {
    private const val BASE_URL = "https://relay-khaki-omega.vercel.app/tour/"
    private val allowedServices = setOf("searchKeyword2")

    fun requestUrl(service: String, query: String): String {
        require(service in allowedServices) { "Unknown service: $service" }
        return "$BASE_URL$service?$query"
    }

    fun fetch(service: String, query: String): String =
        HttpText.get(requestUrl(service, query))
}
