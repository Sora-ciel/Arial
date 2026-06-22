import { getDB, LEGACY_BLOCKS_STORE, LEGACY_FILE_STORE, BACKUP_STORE } from './driver.js';
import { readFileExplorer, writeFileExplorer } from './fileExplorer.js';
import { htmlToText } from '../utils/htmlToText.js';

const FILE_FIELDS = ['content', 'src', 'trackUrl', 'title', 'tasks'];

// ---- Helpers (ported from old storage.js) ----

function decodeBase64(base64) {
  if (typeof atob === 'function') return atob(base64);
  return '';
}

function dataUrlToBlob(dataUrl) {
  const [meta, encoded] = String(dataUrl || '').split(',', 2);
  const mimeMatch = meta?.match(/data:(.*?)(;base64)?$/);
  const mime = mimeMatch?.[1] || 'application/octet-stream';
  const isBase64 = /;base64/i.test(meta || '');
  const binaryString = isBase64
    ? decodeBase64(encoded || '')
    : decodeURIComponent(encoded || '');
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function extensionFromMime(mime = '') {
  const n = mime.toLowerCase();
  if (n.includes('jpeg')) return 'jpg';
  if (n.includes('png')) return 'png';
  if (n.includes('gif')) return 'gif';
  if (n.includes('webp')) return 'webp';
  if (n.includes('svg')) return 'svg';
  if (n.includes('mp4')) return 'mp4';
  if (n.includes('webm')) return 'webm';
  if (n.includes('ogg')) return 'ogg';
  if (n.includes('plain')) return 'txt';
  if (n.includes('json')) return 'json';
  return 'bin';
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
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
  return { blob: new Blob([text], { type: mime }), ext, encoding: 'text', mime };
}

// ---- Legacy hydration (reads from old block-files store) ----

async function hydrateLegacyPayload(db, payload) {
  const hydrated = [];
  for (const original of payload?.blocks || []) {
    const block = {
      ...original,
      position: { ...(original.position || {}) },
      size: { ...(original.size || {}) }
    };
    const refs = block.__fileRefs || {};
    delete block.__fileRefs;

    for (const [field, ref] of Object.entries(refs)) {
      if (!ref?.key) continue;
      const blob = await db.get(LEGACY_FILE_STORE, ref.key);
      if (!blob) continue;
      if (ref.encoding === 'binary') {
        block[field] = await blobToDataUrl(blob);
      } else if (ref.encoding === 'json') {
        const text = await blob.text();
        try { block[field] = JSON.parse(text); } catch { block[field] = text; }
      } else {
        block[field] = await blob.text();
      }
    }
    hydrated.push(block);
  }
  return { ...payload, blocks: hydrated };
}

// ---- Display name & preview helpers ----

function resolveContentType(encoding, mime) {
  if (encoding === 'binary') {
    if (mime.startsWith('video/')) return 'video';
    return 'image';
  }
  if (mime === 'application/json') return 'json';
  return 'text';
}

function makeDisplayName(value, field, descriptor, counts) {
  const { encoding, mime } = descriptor;
  if (encoding === 'binary' && mime.startsWith('image/')) return `Image ${counts.image}`;
  if (encoding === 'binary' && mime.startsWith('video/')) return `Video ${counts.video}`;
  if (field === 'tasks') return `Tasks ${counts.json > 1 ? counts.json : ''}`.trim();
  if (field === 'src' && encoding === 'text' && /^https?:\/\//i.test(String(value))) {
    const s = String(value);
    return s.length > 60 ? s.slice(0, 57) + '...' : s;
  }
  if (typeof value === 'string' && value.length > 0) {
    const trimmed = htmlToText(value).replace(/\s+/g, ' ').trim();
    if (!trimmed) return `Content ${counts.text}`;
    return trimmed.length > 50 ? trimmed.slice(0, 47) + '...' : trimmed;
  }
  return `Content ${counts.text}`;
}

function makePreview(value, encoding) {
  if (encoding === 'binary') return null;
  if (typeof value === 'string') {
    const t = htmlToText(value).replace(/\s+/g, ' ').trim();
    return t.length > 80 ? t.slice(0, 77) + '...' : t || null;
  }
  return null;
}

// ---- Main migration ----

export async function runMigrationIfNeeded(driver) {
  const already = await driver.read('meta/migrated');
  if (already) return;

  try {
    await _runMigration(driver);
  } catch (err) {
    console.error('[storage] Migration failed:', err);
    await driver.write('meta/migrated', {
      timestamp: Date.now(),
      fromVersion: 2,
      error: String(err)
    });
  }
}

async function _runMigration(driver) {

  const db = await getDB();
  const saveNames = await db.getAllKeys(LEGACY_BLOCKS_STORE);

  // 1. Back up old blocks store
  for (const name of saveNames) {
    const raw = await db.get(LEGACY_BLOCKS_STORE, name);
    const tx = db.transaction(BACKUP_STORE, 'readwrite');
    await tx.store.put(raw, `blocks/${name}`);
    await tx.done;
  }

  // 2. Back up old block-files store
  const fileKeys = await db.getAllKeys(LEGACY_FILE_STORE);
  for (const key of fileKeys) {
    const blob = await db.get(LEGACY_FILE_STORE, key);
    const tx = db.transaction(BACKUP_STORE, 'readwrite');
    await tx.store.put(blob, `block-files/${key}`);
    await tx.done;
  }

  // 3. Convert each save to new structure
  const registry = await readFileExplorer(driver);
  const now = Date.now();

  for (const saveName of saveNames) {
    const rawPayload = await db.get(LEGACY_BLOCKS_STORE, saveName);
    if (!rawPayload) continue;

    const hydrated = await hydrateLegacyPayload(db, rawPayload);
    const counts = { image: 0, video: 0, text: 0, json: 0 };
    const convertedBlocks = [];

    for (const block of hydrated.blocks || []) {
      const next = {
        ...block,
        position: { ...(block.position || {}) },
        size: { ...(block.size || {}) }
      };
      delete next.contentRefs;
      const contentRefs = {};

      for (const field of FILE_FIELDS) {
        const value = next[field];
        if (!shouldPersistAsFile(value)) continue;

        const descriptor = valueToBlobDescriptor(value, field);
        const contentType = resolveContentType(descriptor.encoding, descriptor.mime);

        counts[contentType === 'image' ? 'image'
          : contentType === 'video' ? 'video'
          : contentType === 'json' ? 'json'
          : 'text']++;

        const uuid = crypto.randomUUID();
        const contentPath = `content/${uuid}.${descriptor.ext}`;

        const displayName = makeDisplayName(value, field, descriptor, counts);
        const preview = makePreview(value, descriptor.encoding);

        await driver.write(contentPath, descriptor.blob);

        registry[uuid] = {
          displayName,
          file: `${uuid}.${descriptor.ext}`,
          mime: descriptor.mime,
          type: contentType,
          encoding: descriptor.encoding,
          preview,
          createdAt: now,
          usedBy: [saveName]
        };

        contentRefs[field] = uuid;
        delete next[field];
      }

      if (Object.keys(contentRefs).length) {
        next.contentRefs = contentRefs;
      }
      convertedBlocks.push(next);
    }

    await driver.write(`folders/${saveName}/layout.json`, {
      blocks: convertedBlocks,
      modeOrders: hydrated.modeOrders || {},
      modeSettings: hydrated.modeSettings || { simple: { columnCount: 2 } },
      updatedAt: hydrated.updatedAt || now,
      modifiedAt: hydrated.modifiedAt || now
    });
  }

  await writeFileExplorer(driver, registry);
  await driver.write('meta/migrated', { timestamp: now, fromVersion: 2 });
}

// ---- Rollback ----

export async function rollbackMigration(driver) {
  const db = await getDB();
  const backupKeys = await db.getAllKeys(BACKUP_STORE);

  for (const key of backupKeys) {
    const value = await db.get(BACKUP_STORE, key);
    if (key.startsWith('blocks/')) {
      const saveName = key.slice('blocks/'.length);
      const tx = db.transaction(LEGACY_BLOCKS_STORE, 'readwrite');
      await tx.store.put(value, saveName);
      await tx.done;
    } else if (key.startsWith('block-files/')) {
      const oldKey = key.slice('block-files/'.length);
      const tx = db.transaction(LEGACY_FILE_STORE, 'readwrite');
      await tx.store.put(value, oldKey);
      await tx.done;
    }
  }

  await driver.deletePrefix('content/');
  await driver.deletePrefix('folders/');
  await driver.delete('meta/migrated');
}
