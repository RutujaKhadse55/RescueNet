package org.rescuenet.app.ble

import android.annotation.SuppressLint
import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import java.util.concurrent.ConcurrentLinkedQueue

@SuppressLint("MissingPermission")
class RescueMeshService : Service() {

    companion object {
        const val ACTION_START = "org.rescuenet.app.ble.ACTION_START"
        const val ACTION_STOP = "org.rescuenet.app.ble.ACTION_STOP"
        const val ACTION_TRIGGER_SOS = "org.rescuenet.app.ble.ACTION_TRIGGER_SOS"
        const val ACTION_PAUSE = "org.rescuenet.app.ble.ACTION_PAUSE"

        var isRunning: Boolean = false
            private set

        // Event buffer when JS engine is spinning up
        val eventBuffer = ConcurrentLinkedQueue<Map<String, Any>>()
    }

    private val tag = "RescueMeshService"
    private var wakeLock: PowerManager.WakeLock? = null
    private var nearbyCount = 0
    private var queuedCount = 0

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START
        Log.i(tag, "RescueMeshService onStartCommand with action: $action")

        when (action) {
            ACTION_STOP, ACTION_PAUSE -> {
                stopForegroundService()
                return START_NOT_STICKY
            }
            ACTION_TRIGGER_SOS -> {
                Log.w(tag, "SOS Trigger received via foreground service notification!")
                // Buffer SOS event for Headless JS / React Native
                eventBuffer.add(mapOf("type" to "SOS_TRIGGER_NOTIFICATION", "timestamp" to System.currentTimeMillis()))
            }
            ACTION_START -> {
                startForegroundWithNotification()
            }
        }

        isRunning = true
        return START_STICKY // Android will restart service if killed
    }

    private fun startForegroundWithNotification() {
        val notification = buildNotification()

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                var foregroundServiceType = 0
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    val hasBluetooth = checkSelfPermission(android.Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED ||
                                       checkSelfPermission(android.Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED
                    val hasLocation = checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                                      checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

                    if (hasBluetooth) {
                        foregroundServiceType = foregroundServiceType or ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
                    }
                    if (hasLocation) {
                        foregroundServiceType = foregroundServiceType or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
                    }
                    if (foregroundServiceType == 0) {
                        // Fallback type when permissions are pending runtime grant
                        foregroundServiceType = ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
                    }
                } else {
                    foregroundServiceType = ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
                }
                startForeground(RescueBleConstants.NOTIFICATION_ID, notification, foregroundServiceType)
            } else {
                startForeground(RescueBleConstants.NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            Log.e(tag, "Unable to start foreground service: ${e.message}")
        }
    }

    private fun buildNotification(): Notification {
        val openIntent = packageManager.getLaunchIntentForPackage(packageName)?.let {
            PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
        }

        val sosIntent = Intent(this, RescueMeshService::class.java).apply {
            action = ACTION_TRIGGER_SOS
        }
        val sosPendingIntent = PendingIntent.getService(this, 1, sosIntent, PendingIntent.FLAG_IMMUTABLE)

        val pauseIntent = Intent(this, RescueMeshService::class.java).apply {
            action = ACTION_PAUSE
        }
        val pausePendingIntent = PendingIntent.getService(this, 2, pauseIntent, PendingIntent.FLAG_IMMUTABLE)

        return NotificationCompat.Builder(this, RescueBleConstants.NOTIFICATION_CHANNEL_ID)
            .setContentTitle("RescueNet Mesh Active")
            .setContentText("Emergency radio relay active: $nearbyCount nearby, $queuedCount packets queued")
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setContentIntent(openIntent)
            .addAction(android.R.drawable.ic_dialog_alert, "🚨 SOS", sosPendingIntent)
            .addAction(android.R.drawable.ic_media_pause, "Pause", pausePendingIntent)
            .build()
    }

    fun updateMetrics(nearby: Int, queued: Int) {
        this.nearbyCount = nearby
        this.queuedCount = queued
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(RescueBleConstants.NOTIFICATION_ID, buildNotification())
    }

    /**
     * Acquires partial wake lock only during active GATT exchange windows
     */
    fun acquireExchangeWakeLock(durationMs: Long = 10_000L) {
        if (wakeLock == null) {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "rescuenet:mesh_exchange_wakelock")
        }
        wakeLock?.acquire(durationMs)
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        Log.w(tag, "RescueMeshService onTaskRemoved. Re-arming service due to START_STICKY...")
        val restartIntent = Intent(applicationContext, RescueMeshService::class.java).apply {
            action = ACTION_START
        }
        val pendingIntent = PendingIntent.getService(
            applicationContext, 999, restartIntent, PendingIntent.FLAG_IMMUTABLE
        )
        val alarmManager = getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.set(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + 1000, pendingIntent)
        super.onTaskRemoved(rootIntent)
    }

    private fun stopForegroundService() {
        isRunning = false
        stopForeground(true)
        stopSelf()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                RescueBleConstants.NOTIFICATION_CHANNEL_ID,
                "RescueNet Emergency Mesh",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Keeps disaster radio relay active when cellular towers are down"
                setSound(null, null)
                enableVibration(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        isRunning = false
        wakeLock?.let { if (it.isHeld) it.release() }
        super.onDestroy()
    }
}
