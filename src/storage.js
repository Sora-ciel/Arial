import { openDB } from 'idb';

const DB_NAME = 'codex-db';
const STORE_NAME = 'blocks';
const FILE_STORE_NAME = 'block-files';
const DB_VERSION = 2;
const FILE_FIELDS = ['content', 'src', 'trackUrl', 'title', 'tasks'];

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
  return await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(FILE_STORE_NAME)) {
        db.createObjectStore(FILE_STORE_NAME);
      }
    }
  });
}

function decodeBase64(base64) {
  if (typeof atob === 'function') {
    return atob(base64);
  }
  return '';
}

function dataUrlToBlob(dataUrl) {
  const [meta, encoded] = String(dataUrl || '').split(',', 2);
  const mimeMatch = meta?.match(/data:(.*?)(;base64)?$/);
  const mime = mimeMatch?.[1] || 'application/octet-stream';
  const isBase64 = /;base64/i.test(meta || '');
  const binaryString = isBase64 ? decodeBase64(encoded || '') : decodeURIComponent(encoded || '');
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function extensionFromMime(mime = '') {
  const normalized = mime.toLowerCase();
  if (normalized.includes('jpeg')) return 'jpg';
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('svg')) return 'svg';
  if (normalized.includes('mp4')) return 'mp4';
  if (normalized.includes('webm')) return 'webm';
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('plain')) return 'txt';
  if (normalized.includes('json')) return 'json';
  return 'bin';
}

function makeFileKey(saveName, blockId, field, ext) {
  return `${saveName}/${blockId}/${field}.${ext}`;
}

async function blobToDataUrl(blob) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

function cloneBlock(block) {
  return {
    ...block,
    position: { ...(block?.position || {}) },
    size: { ...(block?.size || {}) }
  };
}

function shouldPersistAsFile(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function valueToBlobDescriptor(value, field) {
  if (field === 'src' && typeof value === 'string' && value.startsWith('data:')) {
    const blob = dataUrlToBlob(value);
    const mime = blob.type || 'application/octet-stream';
    return { blob, ext: extensionFromMime(mime), encoding: 'binary', mime };
  }

  if (typeof value === 'object') {
    const blob = new Blob([JSON.stringify(value)], { type: 'application/json' });
    return { blob, ext: 'json', encoding: 'json', mime: 'application/json' };
  }

  const text = String(value);
  const ext = field === 'src' && /^https?:\/\//i.test(text) ? 'url' : 'txt';
  const mime = ext === 'url' ? 'text/uri-list' : 'text/plain';
  const blob = new Blob([text], { type: mime });
  return { blob, ext, encoding: 'text', mime };
}

async function clearSaveFiles(db, saveName) {
  const tx = db.transaction(FILE_STORE_NAME, 'readwrite');
  const store = tx.objectStore(FILE_STORE_NAME);
  const lower = `${saveName}/`;
  const upper = `${saveName}/\uffff`;
  const keys = await store.getAllKeys(IDBKeyRange.bound(lower, upper));
  for (const key of keys) {
    await store.delete(key);
  }
  await tx.done;
}

async function preparePersistedPayload(saveName, payload) {
  const normalized = asPayloadWithTimestamp(payload, Date.now());
  const blocks = (normalized.blocks || []).map(cloneBlock);
  const fileWrites = [];
  const persistedBlocks = blocks.map(block => {
    const next = { ...block };
    const fileRefs = {};

    for (const field of FILE_FIELDS) {
      const value = next[field];
      if (!shouldPersistAsFile(value)) continue;

      const descriptor = valueToBlobDescriptor(value, field);
      const key = makeFileKey(saveName, block.id, field, descriptor.ext);
      fileWrites.push({ key, blob: descriptor.blob });
      fileRefs[field] = {
        key,
        ext: descriptor.ext,
        encoding: descriptor.encoding,
        mime: descriptor.mime
      };
      delete next[field];
    }

    if (Object.keys(fileRefs).length) {
      next.__fileRefs = fileRefs;
    }

    return next;
  });

  return {
    payload: {
      ...normalized,
      blocks: persistedBlocks
    },
    files: fileWrites
  };
}

async function hydratePayload(db, payload) {
  const normalized = asPayloadWithTimestamp(payload || []);
  const hydratedBlocks = [];

  for (const originalBlock of normalized.blocks || []) {
    const block = cloneBlock(originalBlock);
    const refs = block.__fileRefs || {};
    delete block.__fileRefs;

    for (const [field, ref] of Object.entries(refs)) {
      if (!ref?.key) continue;
      const blob = await db.get(FILE_STORE_NAME, ref.key);
      if (!blob) continue;

      if (ref.encoding === 'binary') {
        block[field] = await blobToDataUrl(blob);
      } else if (ref.encoding === 'json') {
        const text = await blob.text();
        try {
          block[field] = JSON.parse(text);
        } catch {
          block[field] = text;
        }
      } else {
        block[field] = await blob.text();
      }
    }

    hydratedBlocks.push(block);
  }

  return {
    ...normalized,
    blocks: hydratedBlocks
  };
}

export async function saveBlocks(name, blocks) {
  const db = await getDB();
  const prepared = await preparePersistedPayload(name, blocks);
  await clearSaveFiles(db, name);

  const tx = db.transaction([STORE_NAME, FILE_STORE_NAME], 'readwrite');
  await tx.objectStore(STORE_NAME).put(prepared.payload, name);
  for (const file of prepared.files) {
    await tx.objectStore(FILE_STORE_NAME).put(file.blob, file.key);
  }
  await tx.done;
}

export async function loadBlocks(name) {
  const db = await getDB();
  const localPayload = await db.get(STORE_NAME, name);
  return await hydratePayload(db, localPayload || []);
}

export async function deleteBlocks(name) {
  const db = await getDB();
  await db.delete(STORE_NAME, name);
  await clearSaveFiles(db, name);
}

export async function listSavedBlocks() {
  const db = await getDB();
  const keys = await db.getAllKeys(STORE_NAME);
  return keys.map(String);
}
