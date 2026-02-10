import { openDB } from 'idb';

const DB_NAME = 'codex-db';
const STORE_NAME = 'blocks';

const FIREBASE_DB_URL = import.meta.env.VITE_FIREBASE_DB_URL;
const FIREBASE_SYNC_NAMESPACE =
  import.meta.env.VITE_FIREBASE_SYNC_NAMESPACE || 'default';

function isFirebaseSyncEnabled() {
  return Boolean(FIREBASE_DB_URL);
}

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

function firebaseSaveUrl(name) {
  const cleanBase = FIREBASE_DB_URL?.replace(/\/+$/, '');
  return `${cleanBase}/sync/${encodeURIComponent(FIREBASE_SYNC_NAMESPACE)}/saves/${saveKey(name)}.json`;
}

function firebaseListUrl() {
  const cleanBase = FIREBASE_DB_URL?.replace(/\/+$/, '');
  return `${cleanBase}/sync/${encodeURIComponent(FIREBASE_SYNC_NAMESPACE)}/saves.json`;
}

async function firebaseSave(name, blocks) {
  if (!isFirebaseSyncEnabled()) return;
  const response = await fetch(firebaseSaveUrl(name), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name,
      blocks,
      updatedAt: new Date().toISOString()
    })
  });
  if (!response.ok) {
    throw new Error(`Firebase save failed: ${response.status}`);
  }
}

async function firebaseLoad(name) {
  if (!isFirebaseSyncEnabled()) return null;
  const response = await fetch(firebaseSaveUrl(name));
  if (!response.ok) {
    throw new Error(`Firebase load failed: ${response.status}`);
  }
  const data = await response.json();
  return data?.blocks ?? null;
}

async function firebaseDelete(name) {
  if (!isFirebaseSyncEnabled()) return;
  const response = await fetch(firebaseSaveUrl(name), {
    method: 'DELETE'
  });
  if (!response.ok) {
    throw new Error(`Firebase delete failed: ${response.status}`);
  }
}

async function firebaseList() {
  if (!isFirebaseSyncEnabled()) return null;
  const response = await fetch(firebaseListUrl());
  if (!response.ok) {
    throw new Error(`Firebase list failed: ${response.status}`);
  }

  const payload = (await response.json()) || {};
  return Object.entries(payload)
    .map(([key, value]) => value?.name || saveNameFromKey(key))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

export async function getDB() {
  return await openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

export async function saveBlocks(name, blocks) {
  const db = await getDB();
  await db.put(STORE_NAME, blocks, name);

  try {
    await firebaseSave(name, blocks);
  } catch (error) {
    console.warn('Firebase sync failed during save, using local storage only.', error);
  }
}

export async function loadBlocks(name) {
  try {
    const remoteBlocks = await firebaseLoad(name);
    if (remoteBlocks !== null) {
      const db = await getDB();
      await db.put(STORE_NAME, remoteBlocks, name);
      return remoteBlocks;
    }
  } catch (error) {
    console.warn('Firebase sync failed during load, falling back to local storage.', error);
  }

  const db = await getDB();
  return (await db.get(STORE_NAME, name)) || [];
}

export async function deleteBlocks(name) {
  const db = await getDB();
  await db.delete(STORE_NAME, name);

  try {
    await firebaseDelete(name);
  } catch (error) {
    console.warn('Firebase sync failed during delete, local copy removed only.', error);
  }
}

export async function listSavedBlocks() {
  try {
    const remoteList = await firebaseList();
    if (remoteList) {
      return remoteList;
    }
  } catch (error) {
    console.warn('Firebase sync failed during listing, falling back to local data.', error);
  }

  const db = await getDB();
  return await db.getAllKeys(STORE_NAME); // returns list of names
}
