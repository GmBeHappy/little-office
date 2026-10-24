package com.littleoffice.android

import android.content.Context
import androidx.compose.runtime.*

class OfficePreferences(context: Context) {
    private val storage = context.getSharedPreferences("office-display", Context.MODE_PRIVATE)
    var nameSize by mutableFloatStateOf(storage.getFloat("nameSize", 10f).coerceIn(8f, 16f))
    var nameOpacity by mutableFloatStateOf(storage.getFloat("nameOpacity", 85f).coerceIn(0f, 100f))
    var effects by
        mutableStateOf(
            storage.getBoolean("effects", android.animation.ValueAnimator.areAnimatorsEnabled())
        )

    fun save() {
        storage
            .edit()
            .putFloat("nameSize", nameSize)
            .putFloat("nameOpacity", nameOpacity)
            .putBoolean("effects", effects)
            .apply()
    }
}

val statusIcons = listOf("", "💻", "🎧", "📅", "⛔", "☕", "🍽️", "🚶", "🌙", "🚿", "⏳")
val statusPresets =
    listOf(
        Triple("busy", "💻", "Making something good…"),
        Triple("busy", "📅", "In a meeting"),
        Triple("dnd", "🎧", "Deep work"),
        Triple("dnd", "⛔", "Please do not interrupt"),
        Triple("away", "⏳", "Back in 10 minutes"),
        Triple("away", "🍽️", "Out for lunch"),
        Triple("away", "☕", "Quick break"),
        Triple("away", "🚿", "Showering"),
    )

fun appearanceParts(value: String): List<Int> {
    if (value.matches(Regex("custom:[0-4]:(?:[0-9]|1[0-4]):(?:[0-9]|1[0-4]):(?:[0-9]|1[0-4])")))
        return value.split(':').drop(1).map(String::toInt)
    return when (value) {
        "blue" -> listOf(3, 0, 2, 3)
        "coral" -> listOf(2, 2, 0, 1)
        "gold" -> listOf(2, 0, 1, 2)
        "plum" -> listOf(0, 4, 0, 4)
        else -> listOf(1, 3, 0, 0)
    }
}
