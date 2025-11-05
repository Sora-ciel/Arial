const isStorageAvailable = storage => {
  if (!storage) return false;
  try {
    const testKey = '__storage_test__';
    storage.setItem(testKey, 'test');
    storage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
};

export function getLocalStorage() {
  if (typeof window === 'undefined' || !('localStorage' in window)) {
    return null;
  }
  const storage = window.localStorage;
  return isStorageAvailable(storage) ? storage : null;
}

export function readJSON(key, fallback = null, storage = getLocalStorage()) {
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value, storage = getLocalStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readValue(key, fallback = null, storage = getLocalStorage()) {
  if (!storage) return fallback;
  try {
    const value = storage.getItem(key);
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

export function writeValue(key, value, storage = getLocalStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeValue(key, storage = getLocalStorage()) {
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
