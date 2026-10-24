package com.littleoffice.android

import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.*
import androidx.compose.ui.unit.dp

@Composable
fun officeTypography(): Typography {
    val family =
        FontFamily(
            Font(R.font.office_sans_400),
            Font(R.font.office_sans_600, FontWeight.SemiBold),
            Font(R.font.office_sans_700, FontWeight.Bold),
        )
    val base = Typography()
    return Typography(
        displaySmall = base.displaySmall.copy(fontFamily = family),
        headlineLarge = base.headlineLarge.copy(fontFamily = family),
        headlineMedium = base.headlineMedium.copy(fontFamily = family),
        titleLarge = base.titleLarge.copy(fontFamily = family),
        titleMedium = base.titleMedium.copy(fontFamily = family),
        bodyLarge = base.bodyLarge.copy(fontFamily = family),
        bodyMedium = base.bodyMedium.copy(fontFamily = family),
        bodySmall = base.bodySmall.copy(fontFamily = family),
        labelLarge = base.labelLarge.copy(fontFamily = family),
        labelMedium = base.labelMedium.copy(fontFamily = family),
        labelSmall = base.labelSmall.copy(fontFamily = family),
    )
}

@Composable
fun OfficeBrand(modifier: Modifier = Modifier) {
    Row(
        modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Image(painterResource(R.drawable.office_icon), null, Modifier.size(34.dp))
        Text(
            "little office ✦",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
fun OfficeScene(modifier: Modifier = Modifier, mapId: String = "zen-small") {
    val resource =
        when {
            mapId.startsWith("beach") -> R.drawable.office_beach
            mapId.startsWith("camping") -> R.drawable.office_camping
            mapId.startsWith("space") -> R.drawable.office_space
            else -> R.drawable.office_zen
        }
    Surface(
        modifier,
        shape = RoundedCornerShape(22.dp),
        border = BorderStroke(5.dp, Color(0xffe2e8d6)),
    ) {
        Image(
            painterResource(resource),
            officeTranslation("A little pixel office surrounded by greenery"),
            Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop,
        )
    }
}

@Composable
fun ConnectionScreen(model: OfficeModel) {
    val context = LocalContext.current
    var options by remember { mutableStateOf(false) }
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val wide = maxWidth >= 700.dp
        Column(
            Modifier.fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(if (wide) 40.dp else 24.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            if (wide)
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    OfficeBrand(Modifier.weight(1f))
                    LanguagePicker()
                }
            else OfficeBrand()
            val story: @Composable (Modifier) -> Unit = { modifier ->
                Column(modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    OfficeText(
                        "YOUR PEOPLE. YOUR PLACE.",
                        color = MaterialTheme.colorScheme.primary,
                        style = MaterialTheme.typography.labelMedium,
                    )
                    OfficeText(
                        "A little closer.",
                        style = MaterialTheme.typography.displaySmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    OfficeText(
                        "Even from afar.",
                        color = Color(0xff7c8d65),
                        style = MaterialTheme.typography.headlineMedium,
                    )
                    OfficeScene(Modifier.fillMaxWidth().height(if (wide) 280.dp else 155.dp))
                    OfficeText(
                        "A cozy corner of the internet to do good work, together.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
            val connect: @Composable (Modifier) -> Unit = { modifier ->
                Surface(
                    modifier,
                    color = Color(0xfffdfdf7),
                    shape = RoundedCornerShape(26.dp),
                    border = BorderStroke(1.dp, Color(0xffdfe5d5)),
                ) {
                    Column(
                        Modifier.padding(24.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        OfficeText(
                            "Welcome to your office.",
                            style = MaterialTheme.typography.headlineMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        OfficeText("Sign in to find your team and pick up where you left off.")
                        Button(
                            onClick = {
                                model.signIn()?.let { uri ->
                                    try {
                                        CustomTabsIntent.Builder().build().launchUrl(context, uri)
                                    } catch (e: Exception) {
                                        model.error = "No browser available for secure sign-in."
                                    }
                                }
                            },
                            enabled = !model.busy,
                            modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
                            shape = RoundedCornerShape(14.dp),
                        ) {
                            OfficeText("Continue to Little Office  →")
                        }
                        OfficeText(
                            "Sign in securely in your browser, then come right back here.",
                            style = MaterialTheme.typography.bodySmall,
                        )
                        HorizontalDivider(color = Color(0xffe2e8d6))
                        OfficeText(
                            model.server.removePrefix("https://").removePrefix("http://"),
                            color = MaterialTheme.colorScheme.primary,
                            style = MaterialTheme.typography.labelMedium,
                        )
                        TextButton(
                            onClick = { options = !options },
                            contentPadding = PaddingValues(0.dp),
                        ) {
                            OfficeText(
                                if (options) "Hide connection options" else "Connection options"
                            )
                        }
                        if (options) {
                            OutlinedTextField(
                                model.server,
                                { model.server = it },
                                label = { OfficeText("Server address") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            TextButton(
                                onClick = { model.server = "https://app.littleoffice.app" }
                            ) {
                                OfficeText("Use Little Office")
                            }
                        }
                    }
                }
            }
            if (wide)
                Row(
                    horizontalArrangement = Arrangement.spacedBy(40.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    story(Modifier.weight(1f))
                    connect(Modifier.weight(1f))
                }
            else {
                connect(Modifier.fillMaxWidth())
                LanguagePicker()
                OfficeScene(Modifier.fillMaxWidth().height(130.dp))
            }
        }
    }
}

@Composable
fun WorkspaceCard(workspace: Workspace, enter: () -> Unit, settings: () -> Unit) {
    Surface(
        Modifier.fillMaxWidth(),
        color = Color(0xfffdfdf7),
        shape = RoundedCornerShape(24.dp),
        border = BorderStroke(1.dp, Color(0xffdfe5d5)),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                OfficeScene(Modifier.size(92.dp), workspace.mapId)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    OfficeText(
                        workspace.name,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (workspace.slug.isNotEmpty())
                        OfficeText(
                            "${workspace.slug}.littleoffice.app",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    OfficeText(
                        workspace.role.replaceFirstChar(Char::uppercase),
                        color = MaterialTheme.colorScheme.primary,
                        style = MaterialTheme.typography.labelMedium,
                    )
                }
            }
            Button(
                onClick = enter,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                shape = RoundedCornerShape(12.dp),
            ) {
                OfficeText("Enter office  →")
            }
            TextButton(
                onClick = settings,
                modifier = Modifier.align(Alignment.CenterHorizontally),
            ) {
                OfficeText("Members & settings")
            }
        }
    }
}
