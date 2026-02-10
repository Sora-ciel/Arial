import { openDB } from 'idb';
import {
  getCurrentUser,
  isFirebaseConfigured,
  loadRemoteFile,
  loadRemoteIndex,
  saveRemoteFile,
  deleteRemoteFile,
  uploadAttachmentFromDataUrl,
  resolveAttachmentURL
} from './firebaseClient.js';

const DB_NAME = 'codex-db';
const STORE_NAME = 'blocks';
const REMOTE_SYNC_COOLDOWN_MS = 30_000;

const pendingRemoteSyncByName = new Map();

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

function sanitizeBlockForRemote(block) {
  if (!block || typeof block !== 'object') return block;

  const { resolvedSrc, downloadURL, ...rest } = block;
  if (isStorageAttachmentRef(rest.src)) {
    const { type, storagePath, attachmentId, contentType, size } = rest.src;
    return {
      ...rest,
      src: {
        type,
        storagePath,
        attachmentId,
        contentType,
        size
      }
    };
  }

  return rest;
}

function sanitizePayloadForRemote(payload) {
  const blocks = Array.isArray(payload?.blocks) ? payload.blocks : [];
  return {
    ...payload,
    blocks: blocks.map(sanitizeBlockForRemote)
  };
}

function makeAttachmentId(fileName, blockId) {
  const randomPart = crypto.randomUUID();
  return `${saveKey(fileName)}-${blockId || 'block'}-${randomPart}`;
}

async function prepareRemotePayload(payload, fileName) {
  const sanitizedPayload = sanitizePayloadForRemote(payload);
  const blocks = Array.isArray(sanitizedPayload?.blocks) ? sanitizedPayload.blocks : [];
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
      ...sanitizedPayload,
      blocks: migratedBlocks
    },
    migratedAttachmentCount
  };
}

async function flushRemoteSync(name) {
  const pendingSync = pendingRemoteSyncByName.get(name);
  if (!pendingSync) return;

  pendingRemoteSyncByName.delete(name);

  if (!canUseRemoteSync()) return;

  const { payload, updatedAt } = pendingSync;

  try {
    const fileId = saveKey(name);
    const remoteCurrent = await loadRemoteFile(fileId);
    const remoteUpdatedAt = Number(remoteCurrent?.updatedAt || 0);

    if (remoteUpdatedAt > updatedAt) {
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
      clientUpdatedAt: updatedAt
    });
  } catch (error) {
    console.warn('Firebase sync failed during save, using local storage only.', error);
  }
}

function scheduleRemoteSync(name, payload, updatedAt) {
  const previous = pendingRemoteSyncByName.get(name);
  if (previous?.timerId) {
    clearTimeout(previous.timerId);
  }

  const timerId = setTimeout(() => {
    flushRemoteSync(name);
  }, REMOTE_SYNC_COOLDOWN_MS);

  pendingRemoteSyncByName.set(name, {
    payload,
    updatedAt,
    timerId
  });
}

async function hydratePayloadForRuntime(payload) {
  const blocks = Array.isArray(payload?.blocks) ? payload.blocks : [];

  if (!canUseRemoteSync()) {
    return {
      ...payload,
      blocks: blocks.map(block => {
        if (!block || typeof block !== 'object') return block;
        if (!isStorageAttachmentRef(block.src)) return block;
        return {
          ...block,
          resolvedSrc: null,
          attachmentRequiresAuth: true
        };
      })
    };
  }

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
      const url = await resolveAttachmentURL(block.src.storagePath);
      hydratedBlocks.push({
        ...block,
        resolvedSrc: url || null,
        attachmentRequiresAuth: !url
      });
    } catch (error) {
      console.warn('Attachment URL resolution failed for block, leaving unresolved.', error);
      hydratedBlocks.push({
        ...block,
        resolvedSrc: null,
        attachmentRequiresAuth: true
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

  scheduleRemoteSync(name, payload, now);
}

export async function loadBlocks(name) {
  if (canUseRemoteSync()) {
    try {
      const fileId = saveKey(name);
      const remotePayload = await loadRemoteFile(fileId);
      if (remotePayload) {
        const db = await getDB();
        await db.put(STORE_NAME, remotePayload, name);
        return hydratePayloadForRuntime(remotePayload);
      }
    } catch (error) {
      console.warn('Firebase sync failed during load, falling back to local storage.', error);
    }
  }

  const db = await getDB();
  const localPayload = (await db.get(STORE_NAME, name)) || [];
  return hydratePayloadForRuntime(localPayload);
}

export async function deleteBlocks(name) {
  const db = await getDB();
  await db.delete(STORE_NAME, name);

  const pendingSync = pendingRemoteSyncByName.get(name);
  if (pendingSync?.timerId) {
    clearTimeout(pendingSync.timerId);
  }
  pendingRemoteSyncByName.delete(name);

  if (!canUseRemoteSync()) return;

  try {
    const fileId = saveKey(name);
    await deleteRemoteFile(fileId);
  } catch (error) {
    console.warn('Firebase sync failed during delete, local copy removed only.', error);
  }
}

export async function listSavedBlocks() {
  const db = await getDB();
  const localKeys = (await db.getAllKeys(STORE_NAME)).map(String);

  if (canUseRemoteSync()) {
    try {
      const remoteIndex = (await loadRemoteIndex()) || {};
      const remoteNames = Object.entries(remoteIndex)
        .map(([fileId, value]) => value?.name || saveNameFromKey(fileId))
        .filter(Boolean);

      return Array.from(new Set([...localKeys, ...remoteNames]))
        .sort((a, b) => a.localeCompare(b));
    } catch (error) {
      console.warn('Firebase sync failed during listing, falling back to local data.', error);
    }
  }

  return localKeys;
}
