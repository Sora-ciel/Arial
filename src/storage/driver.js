import { openDB } from 'idb';

const DB_NAME = 'codex-db';
const DB_VERSION = 4;
export const FILES_STORE = 'files';
export const BACKUP_STORE = '_legacy_backup';
export const LEGACY_BLOCKS_STORE = 'blocks';
export const LEGACY_FILE_STORE = 'block-files';
export const FS_SETTINGS_STORE = '_fs_settings';

const HIGH_CHAR = '￿';

let dbPromise = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(LEGACY_BLOCKS_STORE)) {
          db.createObjectStore(LEGACY_BLOCKS_STORE);
        }
        if (!db.objectStoreNames.contains(LEGACY_FILE_STORE)) {
          db.createObjectStore(LEGACY_FILE_STORE);
        }
        if (!db.objectStoreNames.contains(FILES_STORE)) {
          db.createObjectStore(FILES_STORE);
        }
        if (!db.objectStoreNames.contains(BACKUP_STORE)) {
          db.createObjectStore(BACKUP_STORE);
        }
        if (!db.objectStoreNames.contains(FS_SETTINGS_STORE)) {
          db.createObjectStore(FS_SETTINGS_STORE);
        }
      }
    });
  }
  return dbPromise;
}

// ---- DriverProxy — delegates to whichever backend is active ----

export class DriverProxy {
  constructor(initial) {
    this._inner = initial;
  }
  setInner(driver) { this._inner = driver; }
  getInner() { return this._inner; }
  read(path) { return this._inner.read(path); }
  write(path, value) { return this._inner.write(path, value); }
  delete(path) { return this._inner.delete(path); }
  list(prefix) { return this._inner.list(prefix); }
  deletePrefix(prefix) { return this._inner.deletePrefix(prefix); }
}

export class IndexedDBDriver {
  async read(path) {
    const db = await getDB();
    const value = await db.get(FILES_STORE, path);
    return value ?? null;
  }

  async write(path, value) {
    const db = await getDB();
    await db.put(FILES_STORE, value, path);
  }

  async delete(path) {
    const db = await getDB();
    await db.delete(FILES_STORE, path);
  }

  async list(prefix) {
    const db = await getDB();
    return db.getAllKeys(FILES_STORE, IDBKeyRange.bound(prefix, prefix + HIGH_CHAR));
  }

  async deletePrefix(prefix) {
    const db = await getDB();
    const keys = await this.list(prefix);
    if (!keys.length) return;
    const tx = db.transaction(FILES_STORE, 'readwrite');
    for (const key of keys) {
      tx.store.delete(key);
    }
    await tx.done;
  }
}
