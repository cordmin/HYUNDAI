package io.dait.app

import java.net.HttpURLConnection
import java.net.URL

internal object HttpText {
    private const val TIMEOUT_MS = 10_000

    fun get(url: String): String {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = TIMEOUT_MS
            connection.readTimeout = TIMEOUT_MS
            return connection.inputStream.bufferedReader().use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }
}
