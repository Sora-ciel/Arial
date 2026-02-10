import { openDB } from 'idb';
import {
  getCurrentUser,
  isFirebaseConfigured,
  loadRemoteFile,
  loadRemoteIndex,
  saveRemoteFile,
  deleteRemoteFile
} from './firebaseClient.js';

const DB_NAME = 'codex-db';
const STORE_NAME = 'blocks';

function toUtf8Base64(value) {
  if (typeof window === 'undefined') return value;
  return btoa(unescape(encodeURIComponent(value)));
}

function fromUtf8Base64(value) {
  if (typeof window === 'undefined') return value;
  return decodeURIComponent(escape(atob(value)));
}

function saveKey(name) {
  return toUtf8Base64(name)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function saveNameFromKey(key) {
  const normalized = key.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  return fromUtf8Base64(padded);
}

function canUseRemoteSync() {
  return isFirebaseConfigured() && Boolean(getCurrentUser());
}

function asPayloadWithTimestamp(payload, updatedAt = Date.now()) {
  if (Array.isArray(payload)) {
    return {
      blocks: payload,
      modeOrders: {},
      updatedAt
    };
  }

  if (!payload || typeof payload !== 'object') {
    return {
      blocks: [],
      modeOrders: {},
      updatedAt
    };
  }

  return {
    ...payload,
    updatedAt: payload.updatedAt || updatedAt
  };
}

export async function getDB() {
  return await openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    }
  });
}

export async function saveBlocks(name, blocks) {
  const now = Date.now();
  const payload = asPayloadWithTimestamp(blocks, now);

  const db = await getDB();
  await db.put(STORE_NAME, payload, name);

  if (!canUseRemoteSync()) return;

  try {
    const fileId = saveKey(name);
    const remoteCurrent = await loadRemoteFile(fileId);
    const remoteUpdatedAt = Number(remoteCurrent?.updatedAt || 0);

    // Last-write-wins guard: do not overwrite when remote appears newer.
    if (remoteUpdatedAt > now) {
      console.warn(
        `Skipped remote overwrite for "${name}" because remote version is newer.`
      );
      return;
    }

    await saveRemoteFile(fileId, payload, {
      name,
      fileId,
      clientUpdatedAt: now
    });
  } catch (error) {
    console.warn('Firebase sync failed during save, using local storage only.', error);
  }
}

export async function loadBlocks(name) {
  if (canUseRemoteSync()) {
    try {
      const fileId = saveKey(name);
      const remotePayload = await loadRemoteFile(fileId);
      if (remotePayload) {
        const db = await getDB();
        await db.put(STORE_NAME, remotePayload, name);
        return remotePayload;
      }
    } catch (error) {
      console.warn('Firebase sync failed during load, falling back to local storage.', error);
    }
  }

  const db = await getDB();
  return (await db.get(STORE_NAME, name)) || [];
}

export async function deleteBlocks(name) {
  const db = await getDB();
  await db.delete(STORE_NAME, name);

  if (!canUseRemoteSync()) return;

  try {
    const fileId = saveKey(name);
    await deleteRemoteFile(fileId);
  } catch (error) {
    console.warn('Firebase sync failed during delete, local copy removed only.', error);
  }
}

export async function listSavedBlocks() {
  if (canUseRemoteSync()) {
    try {
      const remoteIndex = (await loadRemoteIndex()) || {};
      return Object.entries(remoteIndex)
        .map(([fileId, value]) => value?.name || saveNameFromKey(fileId))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
    } catch (error) {
      console.warn('Firebase sync failed during listing, falling back to local data.', error);
    }
  }

  const db = await getDB();
  const keys = await db.getAllKeys(STORE_NAME);
  return keys.map(String);
}
