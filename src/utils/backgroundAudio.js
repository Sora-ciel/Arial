// Keeps music playing on Android once the screen goes off.
//
// The Media Session API is what puts the track on the lock screen, but it does
// not keep the app alive: an Android WebView is suspended in the background, so
// playback simply stops when the phone sleeps. Holding a foreground service of
// type mediaPlayback is what tells the OS this process is doing something the
// user can hear, and keeps it running.
//
// Only Android has this problem. On the web and in the desktop shell the
// browser keeps playing on its own, so everything here is a no-op there and the
// plugin is never even loaded.

let plugin = null;
let pluginLoadFailed = false;
let serviceRunning = false;
let permissionRequested = false;

const NOTIFICATION_ID = 4711;

// Buttons drawn on the playback notification, so it can be controlled from the
// shade or the lock screen without opening the app.
const BUTTON_PREVIOUS = 'previous';
const BUTTON_TOGGLE = 'toggle';
const BUTTON_NEXT = 'next';

let actionHandlers = {};
let listenerAttached = false;

/**
 * Registers what the notification's buttons should do. Called once, with the
 * player's own controls.
 */
export function setBackgroundAudioActions(handlers) {
  actionHandlers = handlers || {};
}

async function attachButtonListener(service) {
  if (listenerAttached) return;
  listenerAttached = true;
  try {
    await service.addListener('buttonClicked', event => {
      if (event?.buttonId === BUTTON_PREVIOUS) actionHandlers.previous?.();
      else if (event?.buttonId === BUTTON_TOGGLE) actionHandlers.toggle?.();
      else if (event?.buttonId === BUTTON_NEXT) actionHandlers.next?.();
    });
  } catch (error) {
    console.warn('Could not listen for notification buttons:', error);
    listenerAttached = false;
  }
}

function isNativeAndroid() {
  const capacitor = typeof window !== 'undefined' ? window.Capacitor : null;
  if (!capacitor?.isNativePlatform?.()) return false;
  return capacitor.getPlatform?.() === 'android';
}

async function getPlugin() {
  if (plugin || pluginLoadFailed) return plugin;
  try {
    // Imported on demand so the web and desktop builds never pull it in.
    const module = await import('@capawesome-team/capacitor-android-foreground-service');
    plugin = module.ForegroundService;
  } catch (error) {
    // A missing plugin must never break playback — it just means no background
    // audio on this build.
    console.warn('Foreground service plugin unavailable:', error);
    pluginLoadFailed = true;
  }
  return plugin;
}

// Android 13+ won't show the notification without this, and a foreground
// service with no visible notification is killed.
async function ensureNotificationPermission(service) {
  if (permissionRequested) return;
  permissionRequested = true;
  try {
    const status = await service.checkPermissions();
    if (status?.display !== 'granted') await service.requestPermissions();
  } catch (error) {
    console.warn('Could not confirm the notification permission:', error);
  }
}

/**
 * Starts (or updates) the playback service. Safe to call repeatedly — while it
 * is already running this only refreshes the notification text, which is how
 * the track name stays current.
 */
export async function startBackgroundAudio({ title, body, isPlaying = false } = {}) {
  if (!isNativeAndroid()) return;
  const service = await getPlugin();
  if (!service) return;

  await ensureNotificationPermission(service);
  await attachButtonListener(service);

  const options = {
    id: NOTIFICATION_ID,
    title: title || 'Playing',
    body: body || '',
    smallIcon: 'ic_stat_music',
    buttons: [
      { id: BUTTON_PREVIOUS, title: '⏮' },
      { id: BUTTON_TOGGLE, title: isPlaying ? '⏸' : '▶' },
      { id: BUTTON_NEXT, title: '⏭' }
    ],
    // FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK. The plugin's own enum only names
    // Location and Microphone, but it passes the value straight through to
    // startForeground, and this is the constant Android expects. It has to
    // match android:foregroundServiceType on the service in the manifest.
    serviceType: 2,
    silent: true
  };

  try {
    if (serviceRunning) await service.updateForegroundService(options);
    else {
      await service.startForegroundService(options);
      serviceRunning = true;
    }
  } catch (error) {
    console.warn('Could not start background playback:', error);
  }
}

/** Stops the service. Called when nothing is playing any more. */
export async function stopBackgroundAudio() {
  if (!isNativeAndroid() || !serviceRunning) return;
  const service = await getPlugin();
  if (!service) return;
  try {
    await service.stopForegroundService();
  } catch (error) {
    console.warn('Could not stop background playback:', error);
  } finally {
    // Cleared either way: leaving it true would block a later start.
    serviceRunning = false;
  }
}
