import { openDB } from 'idb';

const DB_NAME = 'codex-db';
const STORE_NAME = 'blocks';

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

function estimatePayloadSizeBytes(payload) {
  try {
    return new Blob([JSON.stringify(payload)]).size;
  } catch (error) {
    return 0;
  }
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
  const payload = asPayloadWithTimestamp(blocks, Date.now());
  payload.sizeBytes = estimatePayloadSizeBytes(payload);
  const db = await getDB();
  await db.put(STORE_NAME, payload, name);
}

export async function loadBlocks(name) {
  const db = await getDB();
  const localPayload = await db.get(STORE_NAME, name);
  return asPayloadWithTimestamp(localPayload || []);
}

export async function deleteBlocks(name) {
  const db = await getDB();
  await db.delete(STORE_NAME, name);
}

export async function listSavedBlocks() {
  const db = await getDB();
  const keys = await db.getAllKeys(STORE_NAME);
  return keys.map(String);
}

export async function getSavedBlocksMeta(name) {
  const db = await getDB();
  const payload = await db.get(STORE_NAME, name);

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  return {
    updatedAt: Number(payload.updatedAt) || 0,
    sizeBytes: Number(payload.sizeBytes) || estimatePayloadSizeBytes(payload)
  };
}
