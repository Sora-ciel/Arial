import { openDB } from 'idb';
import {
  getCurrentUser,
  isFirebaseConfigured,
  loadRemoteFile,
  loadRemoteIndex,
  saveRemoteFile,
  deleteRemoteFile,
  uploadAttachmentFromDataUrl,
  resolveAttachmentUrl
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

function isDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:');
}

function isStorageAttachmentRef(value) {
  return value && typeof value === 'object' && value.type === 'storage' && value.storagePath;
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

function makeAttachmentId(fileName, blockId) {
  const randomPart = crypto.randomUUID();
  return `${saveKey(fileName)}-${blockId || 'block'}-${randomPart}`;
}

async function prepareRemotePayload(payload, fileName) {
  const blocks = Array.isArray(payload?.blocks) ? payload.blocks : [];
  let migratedAttachmentCount = 0;

  const migratedBlocks = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') {
      migratedBlocks.push(block);
      continue;
    }

    if (!('src' in block)) {
      migratedBlocks.push(block);
      continue;
    }

    if (isDataUrl(block.src)) {
      const attachmentId = makeAttachmentId(fileName, block.id);
      const attachmentRef = await uploadAttachmentFromDataUrl(attachmentId, block.src);
      if (attachmentRef) {
        migratedBlocks.push({
          ...block,
          src: attachmentRef
        });
        migratedAttachmentCount += 1;
        continue;
      }
    }

    migratedBlocks.push(block);
  }

  return {
    payload: {
      ...payload,
      blocks: migratedBlocks
    },
    migratedAttachmentCount
  };
}

async function hydrateRemotePayload(payload) {
  const blocks = Array.isArray(payload?.blocks) ? payload.blocks : [];
  const hydratedBlocks = [];

  for (const block of blocks) {
    if (!block || typeof block !== 'object') {
      hydratedBlocks.push(block);
      continue;
    }

    if (!isStorageAttachmentRef(block.src)) {
      hydratedBlocks.push(block);
      continue;
    }

    try {
      const url = await resolveAttachmentUrl(block.src);
      hydratedBlocks.push({
        ...block,
        src: url || ''
      });
    } catch (error) {
      console.warn('Attachment URL resolution failed for block, leaving empty src.', error);
      hydratedBlocks.push({
        ...block,
        src: ''
      });
    }
  }

  return {
    ...payload,
    blocks: hydratedBlocks
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

    const { payload: remotePayload, migratedAttachmentCount } = await prepareRemotePayload(
      payload,
      name
    );

    if (migratedAttachmentCount > 0) {
      console.info(`Migrated ${migratedAttachmentCount} inline attachment(s) to Firebase Storage.`);
    }

    await saveRemoteFile(fileId, remotePayload, {
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
        const hydratedRemotePayload = await hydrateRemotePayload(remotePayload);
        const db = await getDB();
        await db.put(STORE_NAME, hydratedRemotePayload, name);
        return hydratedRemotePayload;
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
