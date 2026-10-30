package io.dait.app

import android.content.Context
import org.json.JSONObject

data class DemoLine(val id: String, val category: String, val title: String, val text: String, val cue: String, val scene: Scene)

object DemoLibrary {
    val voices = listOf("Nika")
    const val DEFAULT_VOICE = "Nika"

    fun load(context: Context): List<DemoLine> = runCatching {
        val catalog = context.assets.open("voices/catalog.json").bufferedReader().use { JSONObject(it.readText()) }
        val lines = catalog.getJSONArray("lines")
        (0 until lines.length()).map { index ->
            val line = lines.getJSONObject(index)
            DemoLine(line.getString("id"), line.getString("category"), line.getString("title"),
                line.getString("text"), line.getString("cue"), when (line.getString("scene")) {
                    "afternoon" -> Scene.AFTERNOON
                    "arrival" -> Scene.ARRIVAL
                    else -> Scene.MORNING
                })
        }
    }.getOrDefault(emptyList())
}
