/**
 * Keys used when writing data to `localStorage`. Keeping them together makes it
 * easier to update the naming scheme later without missing a location.
 */
const CONTROL_COLOR_STORAGE_KEY = 'controlColors';
const LAST_SAVE_STORAGE_KEY = 'lastLoadedSave';

/**
 * The UI is split into three areas that can be themed separately. We define a
 * friendly default palette for each region so the app always has consistent
 * styling even if the user has never customised their colors.
 */
export const CONTROL_COLOR_DEFAULTS = {
  left: {
    panelBg: '#111111b0',
    textColor: '#ffffff',
    buttonBg: '#333333',
    buttonText: '#ffffff',
    borderColor: '#444444',
    inputBg: '#1d1d1d'
  },
  right: {
    panelBg: '#222222',
    textColor: '#ffffff',
    buttonBg: '#222222',
    buttonText: '#ffffff',
    borderColor: '#444444'
  },
  canvas: {
    outerBg: '#000000',
    innerBg: '#000000'
  }
};

/**
 * Merge user-provided colors with the defaults, ensuring that every expected
 * key is present. This keeps rendering logic simple because it can rely on the
 * shape of the object always being the same.
 */
export function normalizeControlColors(raw = {}) {
  const left = {
    ...CONTROL_COLOR_DEFAULTS.left,
    ...(raw.left || {})
  };

  const right = {
    ...CONTROL_COLOR_DEFAULTS.right,
    ...(raw.right || {})
  };

  const canvas = {
    ...CONTROL_COLOR_DEFAULTS.canvas,
    ...(raw.canvas || {})
  };

  return { left, right, canvas };
}

/**
 * Load the user's saved colors from `localStorage`. When local storage is not
 * available (for example in SSR) we simply return `null` so the caller can fall
 * back to the defaults.
 */
export function loadStoredControlColors() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const serialized = localStorage.getItem(CONTROL_COLOR_STORAGE_KEY);
    if (!serialized) return null;
    const parsed = JSON.parse(serialized);
    return normalizeControlColors(parsed);
  } catch (error) {
    return null;
  }
}

/**
 * Save the current theme colors into `localStorage` so they persist between
 * browser sessions. Errors are ignored because colour persistence is a nice to
 * have, not a critical feature.
 */
export function persistControlColors(colors) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      CONTROL_COLOR_STORAGE_KEY,
      JSON.stringify(colors)
    );
  } catch (error) {
    /* ignore persistence failures */
  }
}

/**
 * Remember which save file was used most recently. Restoring this name on
 * startup helps the app feel "sticky" between visits.
 */
export function loadStoredLastSaveName() {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(LAST_SAVE_STORAGE_KEY);
  } catch (error) {
    return null;
  }
}

/**
 * Persist (or remove) the last loaded save name. Clearing is useful when the
 * save gets deleted so we do not restore a non-existent entry next launch.
 */
export function persistLastSaveName(name) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (name) {
      localStorage.setItem(LAST_SAVE_STORAGE_KEY, name);
    } else {
      localStorage.removeItem(LAST_SAVE_STORAGE_KEY);
    }
  } catch (error) {
    /* ignore persistence failures */
  }
}

export { CONTROL_COLOR_STORAGE_KEY, LAST_SAVE_STORAGE_KEY };
