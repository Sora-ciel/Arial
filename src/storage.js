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
import { syncDebugLog } from './syncDebug.js';

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
  syncDebugLog.logInfo('sync.save.local', `Saving "${name}" to local IndexedDB...`);
  const now = Date.now();
  const payload = asPayloadWithTimestamp(blocks, now);

  const db = await getDB();
  await db.put(STORE_NAME, payload, name);
  syncDebugLog.logSuccess('sync.save.local', `Saved "${name}" locally.`);

  if (!canUseRemoteSync()) {
    syncDebugLog.logInfo('sync.save.remote', 'Remote sync skipped (not signed in or Firebase unavailable).');
    return;
  }

  try {
    const fileId = saveKey(name);
    const remoteCurrent = await loadRemoteFile(fileId);
    const remoteUpdatedAt = Number(
      remoteCurrent?.clientUpdatedAt || remoteCurrent?.updatedAt || 0
    );

    if (remoteUpdatedAt > now) {
      const message = `Skipped remote overwrite for "${name}" because remote version is newer.`;
      console.warn(message);
      syncDebugLog.logInfo('sync.save.remote', message);
      return;
    }

    const { payload: remotePayload, migratedAttachmentCount } = await prepareRemotePayload(
      payload,
      name
    );

    if (migratedAttachmentCount > 0) {
      console.info(`Migrated ${migratedAttachmentCount} inline attachment(s) to Firebase Storage.`);
    }

    syncDebugLog.logInfo('sync.save.remote', `Syncing "${name}" to Firebase...`);
    await saveRemoteFile(fileId, remotePayload, {
      name,
      fileId,
      clientUpdatedAt: now
    });
    syncDebugLog.logSuccess('sync.save.remote', `Firebase sync completed for "${name}".`);
  } catch (error) {
    console.warn('Firebase sync failed during save, using local storage only.', error);
    syncDebugLog.logError('sync.save.remote', error?.message || 'Firebase sync failed during save.');
  }
}

export async function loadBlocks(name) {
  syncDebugLog.logInfo('sync.load', `Loading "${name}"...`);
  if (canUseRemoteSync()) {
    try {
      const fileId = saveKey(name);
      const remotePayload = await loadRemoteFile(fileId);
      if (remotePayload) {
        const db = await getDB();
        await db.put(STORE_NAME, remotePayload, name);
        syncDebugLog.logSuccess('sync.load', `Loaded "${name}" from Firebase.`);
        return hydratePayloadForRuntime(remotePayload);
      }
    } catch (error) {
      console.warn('Firebase sync failed during load, falling back to local storage.', error);
      syncDebugLog.logError('sync.load', error?.message || 'Firebase load failed; used local fallback.');
    }
  }

  const db = await getDB();
  const localPayload = (await db.get(STORE_NAME, name)) || [];
  syncDebugLog.logSuccess('sync.load', `Loaded "${name}" from local storage.`);
  return hydratePayloadForRuntime(localPayload);
}

export async function deleteBlocks(name) {
  syncDebugLog.logInfo('sync.delete', `Deleting "${name}"...`);
  const db = await getDB();
  await db.delete(STORE_NAME, name);
  syncDebugLog.logSuccess('sync.delete', `Deleted "${name}" locally.`);

  if (!canUseRemoteSync()) {
    syncDebugLog.logInfo('sync.delete.remote', 'Remote delete skipped (not signed in or Firebase unavailable).');
    return;
  }

  try {
    const fileId = saveKey(name);
    await deleteRemoteFile(fileId);
    syncDebugLog.logSuccess('sync.delete.remote', `Deleted "${name}" from Firebase.`);
  } catch (error) {
    console.warn('Firebase sync failed during delete, local copy removed only.', error);
    syncDebugLog.logError('sync.delete.remote', error?.message || 'Firebase delete failed.');
  }
}

export async function listSavedBlocks() {
  syncDebugLog.logInfo('sync.list', 'Loading saved files list...');
  if (canUseRemoteSync()) {
    try {
      const remoteIndex = (await loadRemoteIndex()) || {};
      const remoteList = Object.entries(remoteIndex)
        .map(([fileId, value]) => value?.name || saveNameFromKey(fileId))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      syncDebugLog.logSuccess('sync.list', `Loaded ${remoteList.length} file(s) from Firebase index.`);
      return remoteList;
    } catch (error) {
      console.warn('Firebase sync failed during listing, falling back to local data.', error);
      syncDebugLog.logError('sync.list', error?.message || 'Firebase list failed; used local fallback.');
    }
  }

  const db = await getDB();
  const keys = await db.getAllKeys(STORE_NAME);
  syncDebugLog.logSuccess('sync.list', `Loaded ${keys.length} file(s) from local storage.`);
  return keys.map(String);
}
