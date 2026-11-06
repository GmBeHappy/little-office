package com.littleoffice.android

import android.net.Uri
import android.util.LruCache
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

private val categories = listOf("Skin", "Hair", "Hat", "Clothes", "Presets")
private val styles = listOf(
    listOf("Light", "Medium light", "Medium", "Medium deep", "Deep"),
    listOf("Short crop", "Soft curls", "Classic bob", "Spiky hair", "Ponytail", "Buzz cut",
        "Side part", "Long waves", "Twin tails", "Mohawk", "Afro", "Top knot", "Braids", "Undercut", "Shaggy hair"),
    listOf("No hat", "Cap", "Beanie", "Sun hat", "Headphones", "Crown", "Bucket hat", "Beret",
        "Cowboy hat", "Wizard hat", "Party hat", "Cat ears", "Flower crown", "Headband", "Halo"),
    listOf("Forest hoodie", "Denim overalls", "Golden jacket", "Ocean shirt", "Lilac sweater",
        "Red varsity jacket", "White lab coat", "Navy suit", "Sakura kimono", "Space suit",
        "Beach shirt", "Thai silk shirt", "Camping vest", "Black turtleneck", "Rainbow tee"),
)
private val tones = listOf(0xfff5d7bf, 0xffe7b18d, 0xffc98d65, 0xff975e43, 0xff5b372b)
private val presets = listOf("sage" to "Scout", "blue" to "Maker", "coral" to "Artist",
    "gold" to "Explorer", "plum" to "Stargazer")
private val directions = listOf("down", "left", "up", "right")
private fun custom(parts: List<Int>) = "custom:" + parts.joinToString(":")

@Composable
fun AvatarEditor(office: OfficeSession, appearance: String, enabled: Boolean, select: (String) -> Unit) {
    var category by remember { mutableIntStateOf(0) }
    var facing by remember { mutableIntStateOf(0) }
    var retry by remember { mutableIntStateOf(0) }
    val parts = remember(appearance) { appearanceParts(appearance) }
    val options = styles.getOrNull(category).orEmpty()
    val current = parts.getOrNull(category) ?: 0
    fun id(index: Int, preview: Boolean = false): String {
        val next = parts.toMutableList()
        next[category] = index
        // Match the web picker: show hair unobstructed without removing the chosen hat.
        if (preview && category == 1) next[2] = 0
        return custom(next)
    }
    val neighbors = if (category in 1..3) listOf(-1, 0, 1).map { (current + it + options.size) % options.size } else emptyList()
    val choices = if (category == 4) presets else neighbors.map { id(it, preview = true) to options[it] }
    val visible = (listOf(appearance) + choices.map { it.first }).distinct()
    val cache = remember(office) { LruCache<String, Avatar>(48) }
    val portraits = remember(office) { mutableStateMapOf<String, Avatar>() }
    var loadError by remember(office) { mutableStateOf(false) }
    LaunchedEffect(office, visible, retry) {
        portraits.keys.retainAll(visible.toSet())
        loadError = false
        coroutineScope {
            visible.forEach { avatar ->
                val existing = office.avatars[avatar] ?: cache.get(avatar)
                if (existing != null) portraits[avatar] = existing
                else launch {
                    try {
                        val preview = Avatar.parse(office.api.call(office.api.path(office.workspace.id,
                            "/avatar?appearance=${Uri.encode(avatar)}&preview=1")))
                        cache.put(avatar, preview)
                        portraits[avatar] = preview
                    } catch (cancel: CancellationException) { throw cancel }
                    catch (_: Exception) { loadError = true }
                }
            }
        }
    }
    Surface(shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.secondaryContainer) {
        Column(Modifier.fillMaxWidth().padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Portrait(portraits[appearance], directions[facing], Modifier.size(110.dp))
            Row {
                TextButton(onClick = { facing = (facing + 1) % directions.size }) { OfficeText("Rotate preview") }
                TextButton(enabled = enabled, onClick = {
                    val next = styles.map { it.indices.random() }.toMutableList()
                    if (custom(next) == appearance) next[1] = (next[1] + 1) % styles[1].size
                    select(custom(next))
                }) { OfficeText("Randomize") }
            }
        }
    }
    if (loadError) Row(verticalAlignment = Alignment.CenterVertically) {
        OfficeText("Could not load avatar previews.", Modifier.weight(1f))
        TextButton(onClick = { retry++ }) { OfficeText("Retry") }
    }
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        categories.forEachIndexed { index, label -> FilterChip(category == index, { category = index }, label = { OfficeText(label) }) }
    }
    when (category) {
        0 -> Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            options.forEachIndexed { index, name ->
                Choice(name, current == index, enabled, { select(id(index)) }, Modifier.width(65.dp)) {
                    Box(Modifier.size(28.dp).background(Color(tones[index]), CircleShape))
                }
            }
        }
        4 -> Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            choices.forEach { (avatar, name) ->
                Choice(name, avatar == appearance, enabled, { select(avatar) }, Modifier.width(78.dp)) {
                    Portrait(portraits[avatar], "down", Modifier.size(48.dp))
                }
            }
        }
        else -> {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                TextButton(enabled = enabled, onClick = { select(id(neighbors.first())) }) { OfficeText("Previous") }
                Text("${current + 1} / ${options.size}", Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                TextButton(enabled = enabled, onClick = { select(id(neighbors.last())) }) { OfficeText("Next") }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                choices.forEachIndexed { i, (avatar, name) ->
                    Choice(name, neighbors[i] == current, enabled, { select(id(neighbors[i])) }, Modifier.weight(1f)) {
                        Portrait(portraits[avatar], "down", Modifier.size(48.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun Choice(name: String, picked: Boolean, enabled: Boolean, onClick: () -> Unit, modifier: Modifier, image: @Composable () -> Unit) {
    Surface(onClick = onClick, enabled = enabled, modifier = modifier.semantics { selected = picked },
        color = if (picked) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
        border = if (picked) BorderStroke(2.dp, MaterialTheme.colorScheme.primary) else null,
        shape = RoundedCornerShape(12.dp)) {
        Column(Modifier.padding(6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            image()
            OfficeText(name, style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun Portrait(avatar: Avatar?, direction: String, modifier: Modifier) {
    Canvas(modifier) {
        val factor = minOf(size.width / 55f, size.height / 65f)
        avatar?.frames?.get("$direction-stand-0")?.forEach { p ->
            drawRect(Color((p.color or 0xff000000).toInt()),
                Offset(size.width / 2 + p.x * factor, size.height * 0.84f + p.y * factor),
                Size(p.w * factor, p.h * factor), alpha = p.alpha)
        }
    }
}
