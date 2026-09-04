package com.sora.austavia;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.IBinder;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.util.Base64;

import androidx.core.app.NotificationCompat;

/**
 * Foreground service holding a media session and the notification that goes
 * with it.
 *
 * Two things are needed for music to keep playing with the screen off, and they
 * are easy to confuse. The foreground service is what stops Android suspending
 * the WebView. The media session is what makes the notification a *media*
 * notification — the wide one with artwork and transport controls, the same
 * kind other music players post — rather than a plain line of text.
 *
 * The previous approach ran a generic foreground service, which kept playback
 * alive but could only post an ordinary notification, and none appeared at all
 * when the notification permission had not been granted.
 */
public class MediaNotificationService extends Service {

    public static final String CHANNEL_ID = "austavia_playback";
    public static final int NOTIFICATION_ID = 4711;

    public static final String ACTION_UPDATE = "com.sora.austavia.UPDATE";
    public static final String ACTION_PREVIOUS = "com.sora.austavia.PREVIOUS";
    public static final String ACTION_TOGGLE = "com.sora.austavia.TOGGLE";
    public static final String ACTION_NEXT = "com.sora.austavia.NEXT";
    public static final String ACTION_STOP = "com.sora.austavia.STOP";

    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_ARTIST = "artist";
    public static final String EXTRA_ARTWORK = "artwork";
    public static final String EXTRA_PLAYING = "playing";

    /** Set by the plugin so button presses can be forwarded to the web layer. */
    public static ActionListener actionListener;

    public interface ActionListener {
        void onAction(String action);
    }

    private MediaSessionCompat session;
    private String title = "";
    private String artist = "";
    private Bitmap artwork;
    private boolean playing;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();

        session = new MediaSessionCompat(this, "AustaviaPlayback");
        session.setCallback(new MediaSessionCompat.Callback() {
            @Override
            public void onPlay() { dispatch(ACTION_TOGGLE); }

            @Override
            public void onPause() { dispatch(ACTION_TOGGLE); }

            @Override
            public void onSkipToPrevious() { dispatch(ACTION_PREVIOUS); }

            @Override
            public void onSkipToNext() { dispatch(ACTION_NEXT); }

            @Override
            public void onStop() { dispatch(ACTION_STOP); }
        });
        session.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();

        if (ACTION_PREVIOUS.equals(action) || ACTION_TOGGLE.equals(action)
                || ACTION_NEXT.equals(action)) {
            dispatch(action);
            // The web layer will send an update back with the new state; the
            // notification is left as it is until then.
            return START_STICKY;
        }

        if (ACTION_STOP.equals(action)) {
            dispatch(ACTION_STOP);
            stopPlayback();
            return START_NOT_STICKY;
        }

        if (intent != null) {
            title = valueOr(intent.getStringExtra(EXTRA_TITLE), title);
            artist = valueOr(intent.getStringExtra(EXTRA_ARTIST), artist);
            playing = intent.getBooleanExtra(EXTRA_PLAYING, playing);

            String artworkData = intent.getStringExtra(EXTRA_ARTWORK);
            if (artworkData != null) {
                artwork = decodeArtwork(artworkData);
            }
        }

        updateSession();
        Notification notification = buildNotification();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        return START_STICKY;
    }

    private void stopPlayback() {
        if (session != null) session.setActive(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(Service.STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        stopSelf();
    }

    private void dispatch(String action) {
        ActionListener listener = actionListener;
        if (listener != null) listener.onAction(action);
    }

    private static String valueOr(String value, String fallback) {
        return value == null ? fallback : value;
    }

    /** Artwork arrives as a data URL, which is how the web layer holds it. */
    private Bitmap decodeArtwork(String dataUrl) {
        try {
            int comma = dataUrl.indexOf(',');
            String base64 = comma >= 0 ? dataUrl.substring(comma + 1) : dataUrl;
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (Exception error) {
            // Artwork is decoration; a bad image must not stop the notification.
            return null;
        }
    }

    private void updateSession() {
        if (session == null) return;

        MediaMetadataCompat.Builder metadata = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist);
        if (artwork != null) {
            metadata.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, artwork);
        }
        session.setMetadata(metadata.build());

        long actions = PlaybackStateCompat.ACTION_PLAY
            | PlaybackStateCompat.ACTION_PAUSE
            | PlaybackStateCompat.ACTION_PLAY_PAUSE
            | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
            | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
            | PlaybackStateCompat.ACTION_STOP;

        session.setPlaybackState(new PlaybackStateCompat.Builder()
            .setActions(actions)
            .setState(
                playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN,
                1f
            )
            .build());
    }

    private PendingIntent servicePendingIntent(String action, int requestCode) {
        Intent intent = new Intent(this, MediaNotificationService.class).setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getService(this, requestCode, intent, flags);
    }

    private Notification buildNotification() {
        PendingIntent openApp = PendingIntent.getActivity(
            this,
            0,
            new Intent(this, MainActivity.class),
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                : PendingIntent.FLAG_UPDATE_CURRENT
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_music)
            .setContentTitle(title.isEmpty() ? "Playing" : title)
            .setContentText(artist)
            .setLargeIcon(artwork)
            .setContentIntent(openApp)
            .setDeleteIntent(servicePendingIntent(ACTION_STOP, 4))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .addAction(
                android.R.drawable.ic_media_previous,
                "Previous",
                servicePendingIntent(ACTION_PREVIOUS, 1)
            )
            .addAction(
                playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                playing ? "Pause" : "Play",
                servicePendingIntent(ACTION_TOGGLE, 2)
            )
            .addAction(
                android.R.drawable.ic_media_next,
                "Next",
                servicePendingIntent(ACTION_NEXT, 3)
            );

        androidx.media.app.NotificationCompat.MediaStyle style =
            new androidx.media.app.NotificationCompat.MediaStyle()
                .setMediaSession(session.getSessionToken())
                // Which actions stay visible when the notification is collapsed.
                .setShowActionsInCompactView(0, 1, 2);
        builder.setStyle(style);

        return builder.build();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Playback",
            // Low: it should sit in the shade without making a sound.
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Shows the track that is playing");
        channel.setShowBadge(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }

    @Override
    public void onDestroy() {
        if (session != null) {
            session.setActive(false);
            session.release();
            session = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
