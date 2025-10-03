import { openDB } from 'idb';

const DB_NAME = 'codex-db';
const STORE_NAME = 'blocks';

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
}

export async function loadBlocks(name) {
  const db = await getDB();
  return (await db.get(STORE_NAME, name)) || [];
}

export async function deleteBlocks(name) {
  const db = await getDB();
  await db.delete(STORE_NAME, name);
}

export async function listSavedBlocks() {
  const db = await getDB();
  return await db.getAllKeys(STORE_NAME); // returns list of names
}
