package com.sora.arial;

import android.Manifest;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Bridge between the web player and the media notification.
 *
 * Kept deliberately small: the service owns the session and the notification,
 * and this only passes the current track across and hands button presses back.
 */
@CapacitorPlugin(
    name = "MediaNotification",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class MediaNotificationPlugin extends Plugin {

    @Override
    public void load() {
        // Button presses arrive on the service and are forwarded to the web
        // layer, which is what actually controls playback.
        MediaNotificationService.actionListener = action -> {
            JSObject payload = new JSObject();
            payload.put("action", shortName(action));
            notifyListeners("action", payload);
        };
    }

    private static String shortName(String action) {
        if (MediaNotificationService.ACTION_PREVIOUS.equals(action)) return "previous";
        if (MediaNotificationService.ACTION_TOGGLE.equals(action)) return "toggle";
        if (MediaNotificationService.ACTION_NEXT.equals(action)) return "next";
        if (MediaNotificationService.ACTION_STOP.equals(action)) return "stop";
        return action;
    }

    /**
     * Shows or refreshes the notification. Called whenever the track or the
     * play state changes.
     */
    @PluginMethod
    public void show(PluginCall call) {
        // Android 13 hides the notification without this. Playback would still
        // work, which is exactly the confusing case: audio in the background
        // and nothing in the shade to control it.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && getPermissionState("notifications") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "afterPermission");
            return;
        }
        start(call);
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        // Started either way: the service keeps playback alive even when the
        // notification itself has been refused.
        start(call);
    }

    private void start(PluginCall call) {
        Intent intent = new Intent(getContext(), MediaNotificationService.class)
            .setAction(MediaNotificationService.ACTION_UPDATE)
            .putExtra(MediaNotificationService.EXTRA_TITLE, call.getString("title", ""))
            .putExtra(MediaNotificationService.EXTRA_ARTIST, call.getString("artist", ""))
            .putExtra(MediaNotificationService.EXTRA_PLAYING, call.getBoolean("playing", false));

        String artwork = call.getString("artwork");
        if (artwork != null && !artwork.isEmpty()) {
            intent.putExtra(MediaNotificationService.EXTRA_ARTWORK, artwork);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        call.resolve();
    }

    /** Takes the notification down and lets the service stop. */
    @PluginMethod
    public void hide(PluginCall call) {
        getContext().startService(
            new Intent(getContext(), MediaNotificationService.class)
                .setAction(MediaNotificationService.ACTION_STOP)
        );
        call.resolve();
    }
}
