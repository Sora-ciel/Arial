// Keeps music playing on Android once the screen goes off, and puts what's
// playing in the notification shade.
//
// Two separate things are at work here, and they're easy to conflate. A
// foreground service is what stops Android suspending the WebView, so playback
// survives the screen going off. A media session is what makes the
// notification a *media* notification — the wide one with artwork and
// transport controls that other music players post — instead of a plain line
// of text.
//
// This talks to a small native plugin that owns both. An earlier version used
// a generic foreground-service plugin: playback kept running, but it could
// only post an ordinary notification, and none appeared at all when the
// notification permission hadn't been granted.
//
// Only Android needs any of it. On the web and in the desktop shell the
// browser keeps playing on its own, so everything here is a no-op there.

let plugin = null;
let pluginLoadFailed = false;
let listenerAttached = false;
let shown = false;
let actionHandlers = {};

function isNativeAndroid() {
  const capacitor = typeof window !== 'undefined' ? window.Capacitor : null;
  if (!capacitor?.isNativePlatform?.()) return false;
  return capacitor.getPlatform?.() === 'android';
}

function getPlugin() {
  if (plugin || pluginLoadFailed) return plugin;
  const registry = window.Capacitor?.Plugins;
  if (registry?.MediaNotification) plugin = registry.MediaNotification;
  else pluginLoadFailed = true;
  return plugin;
}

/** Registers what the notification's controls should do. */
export function setBackgroundAudioActions(handlers) {
  actionHandlers = handlers || {};
}

function attachActionListener(service) {
  if (listenerAttached) return;
  listenerAttached = true;
  try {
    service.addListener('action', event => {
      const action = event?.action;
      if (action === 'previous') actionHandlers.previous?.();
      else if (action === 'toggle') actionHandlers.toggle?.();
      else if (action === 'next') actionHandlers.next?.();
      else if (action === 'stop') actionHandlers.stop?.();
    });
  } catch (error) {
    console.warn('Could not listen for notification controls:', error);
    listenerAttached = false;
  }
}

/**
 * Shows or refreshes the notification. Safe to call repeatedly — the same
 * notification is updated in place, which is how the track name and the
 * play/pause button stay current.
 *
 * `artwork` is a data URL: the notification can't read a blob: URL, since
 * those only mean anything inside the page that made them.
 */
export async function startBackgroundAudio({ title, artist, artwork, isPlaying = false } = {}) {
  if (!isNativeAndroid()) return;
  const service = getPlugin();
  if (!service) return;

  attachActionListener(service);

  try {
    await service.show({
      title: title || 'Playing',
      artist: artist || '',
      artwork: artwork || '',
      playing: isPlaying
    });
    shown = true;
  } catch (error) {
    console.warn('Could not show the playback notification:', error);
  }
}

/** Takes the notification down. Called when playback stops altogether. */
export async function stopBackgroundAudio() {
  if (!isNativeAndroid() || !shown) return;
  const service = getPlugin();
  if (!service) return;
  try {
    await service.hide();
  } catch (error) {
    console.warn('Could not hide the playback notification:', error);
  } finally {
    // Cleared either way, so a later start isn't blocked.
    shown = false;
  }
}
