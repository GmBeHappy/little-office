package com.littleoffice.android

import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/** Foreground lifetime required by Android for opted-in playback capture while sharing. */
class ShareAudioService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(
                "screen-audio",
                "Screen audio sharing",
                NotificationManager.IMPORTANCE_LOW,
            )
        )
        val open =
            PendingIntent.getActivity(
                this,
                0,
                Intent(this, MainActivity::class.java),
                PendingIntent.FLAG_IMMUTABLE,
            )
        val notification =
            Notification.Builder(this, "screen-audio")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Little Office is sharing app audio")
                .setContentText("Return to Little Office to stop sharing.")
                .setContentIntent(open)
                .setOngoing(true)
                .build()
        if (Build.VERSION.SDK_INT >= 30)
            startForeground(72, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        else startForeground(72, notification)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int) = START_NOT_STICKY
}

/** Revoking a presenter grant invalidates every in-flight projection start. */
internal class ShareAuthorization {
    var ticket = 0
        private set

    private var allowed = false

    fun update(enabled: Boolean) {
        ticket++
        allowed = enabled
    }

    fun accepts(value: Int) = allowed && value == ticket
}
