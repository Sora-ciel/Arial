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
const DEBUG_SYNC = import.meta.env.VITE_DEBUG_SYNC === '1';
const remoteFileIdLookup = new Map();

function debugSyncLog(event, details = {}) {
  if (!DEBUG_SYNC) return;
  console.info(`[sync:${event}]`, details);
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

function canUseRemoteSync() {
  return isFirebaseConfigured() && Boolean(getCurrentUser());
}

function getSyncNamespace() {
  return import.meta.env.VITE_FIREBASE_SYNC_NAMESPACE || 'default';
}

function isNonEmptyObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

function readUpdatedAt(payload) {
  const value = Number(payload?.updatedAt || 0);
  return Number.isFinite(value) ? value : 0;
}

export function validatePayload(payload) {
  if (!isNonEmptyObject(payload)) {
    return { valid: false, reason: 'payload is null/empty/non-object' };
  }

  const hasBlocks = Array.isArray(payload.blocks);
  const hasModeOrders = payload.modeOrders && typeof payload.modeOrders === 'object';
  const hasExpectedRoot =
    'version' in payload ||
    'updatedAt' in payload ||
    hasBlocks ||
    hasModeOrders ||
    'canvas' in payload;

  if (!hasExpectedRoot) {
    return { valid: false, reason: 'missing expected root fields (version/canvas/blocks/modeOrders/updatedAt)' };
  }

  if (!hasBlocks && !hasModeOrders) {
    return { valid: false, reason: 'missing blocks/modeOrders structure' };
  }

  return { valid: true, reason: '' };
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

async function hydratePayloadForRuntime(payload, { source = 'unknown' } = {}) {
  const blocks = Array.isArray(payload?.blocks) ? payload.blocks : [];
  let hydrationErrors = 0;

  if (!canUseRemoteSync()) {
    return {
      ...payload,
      hydrationErrors,
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
      hydrationErrors += 1;
      console.warn(
        `Attachment URL resolution failed for block "${block.id}" from ${source}; rendering placeholder instead.`,
        error
      );
      hydratedBlocks.push({
        ...block,
        resolvedSrc: null,
        attachmentRequiresAuth: true
      });
    }
  }

  return {
    ...payload,
    hydrationErrors,
    blocks: hydratedBlocks
  };
}

function resolveFileId(name) {
  return remoteFileIdLookup.get(name) || saveKey(name);
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
    const fileId = resolveFileId(name);
    const remoteCurrent = await loadRemoteFile(fileId);
    const remoteUpdatedAt = Number(remoteCurrent?.updatedAt || 0);

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

export async function loadBlocks(name, options = {}) {
  return loadBlocksLocalFirst(name, options);
}

export async function loadBlocksLocalFirst(name, options = {}) {
  const { onRemoteUpdate } = options;
  const db = await getDB();
  const localRawPayload = (await db.get(STORE_NAME, name)) || [];
  const localPayload = asPayloadWithTimestamp(localRawPayload, 0);
  const hydratedLocalPayload = await hydratePayloadForRuntime(localPayload, { source: 'local' });
  const localUpdatedAt = readUpdatedAt(localPayload);

  debugSyncLog('load:start', {
    uid: getCurrentUser()?.uid || null,
    namespace: getSyncNamespace(),
    selectedKey: name,
    localKey: name,
    resolvedFileId: resolveFileId(name),
    localUpdatedAt,
    hydrationErrors: hydratedLocalPayload?.hydrationErrors || 0
  });

  if (canUseRemoteSync()) {
    const fileId = resolveFileId(name);
    Promise.resolve()
      .then(async () => {
        const remotePath = `sync/${getSyncNamespace()}/users/${getCurrentUser()?.uid || 'unknown'}/files/${fileId}`;
        const remotePayload = await loadRemoteFile(fileId);
        const validation = validatePayload(remotePayload);
        const remoteUpdatedAt = readUpdatedAt(remotePayload);
        const shouldUseRemote = validation.valid && remoteUpdatedAt > localUpdatedAt;

        debugSyncLog('load:remote', {
          selectedKey: name,
          resolvedFileId: fileId,
          remotePath,
          localKey: name,
          localUpdatedAt,
          remoteUpdatedAt,
          remoteValid: validation.valid,
          reason: validation.reason
        });

        if (!shouldUseRemote) return;

        const hydratedRemotePayload = await hydratePayloadForRuntime(remotePayload, {
          source: 'remote'
        });
        await db.put(STORE_NAME, remotePayload, name);
        if (typeof onRemoteUpdate === 'function') {
          await onRemoteUpdate(hydratedRemotePayload, {
            source: 'remote',
            localUpdatedAt,
            remoteUpdatedAt,
            remoteValid: validation.valid,
            hydrationErrors: hydratedRemotePayload?.hydrationErrors || 0
          });
        }
      })
      .catch(error => {
        console.warn('Firebase sync failed during load, falling back to local storage.', error);
      });
  }

  return hydratedLocalPayload;
}

export async function deleteBlocks(name) {
  const db = await getDB();
  await db.delete(STORE_NAME, name);

  if (!canUseRemoteSync()) return;

  try {
    const fileId = resolveFileId(name);
    await deleteRemoteFile(fileId);
  } catch (error) {
    console.warn('Firebase sync failed during delete, local copy removed only.', error);
  }
}

export async function listSavedBlocks() {
  if (canUseRemoteSync()) {
    try {
      const remoteIndex = (await loadRemoteIndex()) || {};
      remoteFileIdLookup.clear();
      for (const [fileId, value] of Object.entries(remoteIndex)) {
        const resolvedName = value?.name || saveNameFromKey(fileId);
        if (resolvedName) {
          remoteFileIdLookup.set(resolvedName, fileId);
        }
      }
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
