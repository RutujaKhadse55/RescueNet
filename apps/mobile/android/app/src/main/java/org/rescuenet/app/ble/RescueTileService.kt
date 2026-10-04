package org.rescuenet.app.ble

import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import androidx.annotation.RequiresApi

@RequiresApi(Build.VERSION_CODES.N)
class RescueTileService : TileService() {

    override fun onStartListening() {
        super.onStartListening()
        updateTileState()
    }

    override fun onClick() {
        super.onClick()
        val tile = qsTile ?: return

        if (tile.state == Tile.STATE_ACTIVE) {
            // Stop service
            val intent = Intent(this, RescueMeshService::class.java).apply {
                action = RescueMeshService.ACTION_STOP
            }
            startService(intent)
            tile.state = Tile.STATE_INACTIVE
        } else {
            // Start service
            val intent = Intent(this, RescueMeshService::class.java).apply {
                action = RescueMeshService.ACTION_START
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent)
            } else {
                startService(intent)
            }
            tile.state = Tile.STATE_ACTIVE
        }
        tile.updateTile()
    }

    private fun updateTileState() {
        val tile = qsTile ?: return
        tile.state = if (RescueMeshService.isRunning) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        tile.label = "RescueNet Mesh"
        tile.updateTile()
    }
}
