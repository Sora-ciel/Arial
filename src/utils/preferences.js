import { readJSON, writeJSON, readValue, writeValue, removeValue } from './browserStorage';

export const CONTROL_COLOR_STORAGE_KEY = 'controlColors';
export const LAST_SAVE_STORAGE_KEY = 'lastLoadedSave';

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

export function normalizeControlColors(raw = {}) {
  const left = {
    ...CONTROL_COLOR_DEFAULTS.left,
    ...(raw.left || {})
  };

  if (!('inputBg' in left) || !left.inputBg) {
    left.inputBg = (raw.left && raw.left.panelBg) || CONTROL_COLOR_DEFAULTS.left.inputBg;
  }

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

export function loadStoredControlColors() {
  const stored = readJSON(CONTROL_COLOR_STORAGE_KEY);
  return stored ? normalizeControlColors(stored) : null;
}

export function persistControlColors(colors) {
  const normalized = normalizeControlColors(colors);
  writeJSON(CONTROL_COLOR_STORAGE_KEY, normalized);
}

export function loadStoredLastSaveName() {
  return readValue(LAST_SAVE_STORAGE_KEY);
}

export function persistLastSaveName(name) {
  if (!name) {
    removeValue(LAST_SAVE_STORAGE_KEY);
    return;
  }
  writeValue(LAST_SAVE_STORAGE_KEY, name);
}
