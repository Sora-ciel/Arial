import { IndexedDBDriver, DriverProxy, getDB, FS_SETTINGS_STORE } from './storage/driver.js';
import { FileSystemDriver } from './storage/FileSystemDriver.js';
import { runMigrationIfNeeded } from './storage/migration.js';
import {
  readFileExplorer, writeFileExplorer,
  getBlockColors, setBlockColor, removeBlockColorForSave
} from './storage/fileExplorer.js';
import { readAllSettings, writeAllSettings } from './storage/settings.js';
import { htmlToText } from './utils/htmlToText.js';

const FILE_FIELDS = ['content', 'src', 'trackUrl', 'title', 'tasks'];

// ---- Utility helpers ----

function asPayloadWithTimestamp(payload, updatedAt = Date.now()) {
  if (Array.isArray(payload)) {
    return { blocks: payload, modeOrders: {}, updatedAt, modifiedAt: updatedAt };
  }
  if (!payload || typeof payload !== 'object') {
    return { blocks: [], modeOrders: {}, updatedAt, modifiedAt: updatedAt };
  }
  const modifiedAt = payload.modifiedAt || payload.updatedAt || updatedAt;
  return { ...payload, updatedAt: payload.updatedAt || updatedAt, modifiedAt };
}

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

function resolveContentType(encoding, mime) {
  if (encoding === 'binary') return mime.startsWith('video/') ? 'video' : 'image';
  if (mime === 'application/json') return 'json';
  return 'text';
}

function makeDisplayName(value, field, descriptor, counts) {
  const { encoding, mime } = descriptor;
  if (encoding === 'binary' && mime.startsWith('image/')) return `Image ${counts.image}`;
  if (encoding === 'binary' && mime.startsWith('video/')) return `Video ${counts.video}`;
  if (field === 'tasks') return counts.json > 1 ? `Tasks ${counts.json}` : 'Tasks';
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

// ---- Driver & migration bootstrap ----

const driver = new DriverProxy(new IndexedDBDriver());
let migrationPromise = null;

async function ensureMigrated() {
  if (!migrationPromise) {
    migrationPromise = runMigrationIfNeeded(driver);
  }
  return migrationPromise;
}

// ---- In-memory caches (speed up repeated saves) ----

// File_explorer.json cached in memory — one IDB read per session
let _registryCache = null;

async function getRegistry() {
  if (!_registryCache) _registryCache = await readFileExplorer(driver);
  return _registryCache;
}

function invalidateCaches() {
  _registryCache = null;
  _fingerprintCache.clear();
  _saveRefs.clear();
}

// uuid → lightweight fingerprint of the content written at that uuid
const _fingerprintCache = new Map();

// saveName → Map<"blockId::field", uuid> — the contentRefs from the last save/load
const _saveRefs = new Map();

function makeFingerprint(value, field) {
  if (typeof value === 'string') {
    // For large strings (e.g. data URLs) use length + head snippet
    if (value.length > 400) return `${value.length}:${value.slice(0, 80)}`;
    return value;
  }
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value ?? '');
}

// ---- Public API ----

export async function saveBlocks(name, payload) {
  await ensureMigrated();
  const normalized = asPayloadWithTimestamp(payload, Date.now());
  const registry = await getRegistry();

  // Previous contentRefs for this save (from memory after last load/save)
  const prevRefs = _saveRefs.get(name) ?? new Map();
  const nextRefs = new Map(); // will become new _saveRefs entry after save
  const keptUuids = new Set(); // UUIDs being reused — must NOT be deleted

  const counts = { image: 0, video: 0, text: 0, json: 0 };
  const now = Date.now();
  const convertedBlocks = [];

  for (const block of normalized.blocks || []) {
    const next = {
      ...block,
      position: { ...(block.position || {}) },
      size: { ...(block.size || {}) }
    };
    delete next.contentRefs;
    const contentRefs = {};

    if (next.bgColor !== undefined || next.textColor !== undefined) {
      setBlockColor(registry, next.id, next.bgColor, next.textColor, name);
      delete next.bgColor;
      delete next.textColor;
    }

    for (const field of FILE_FIELDS) {
      const value = next[field];
      const refKey = `${next.id}::${field}`;

      if (!shouldPersistAsFile(value)) {
        // Safety net: a block that still exists but momentarily lost its file
        // field (e.g. a transient empty `src` during HMR or a partial update)
        // must NOT lose its stored content. If we have a previous ref for this
        // field, preserve it instead of letting the cleanup pass delete the
        // (irreversible) content file. Only genuinely deleted blocks — absent
        // from this loop entirely — get their content cleaned up.
        const keepUuid = prevRefs.get(refKey);
        if (keepUuid && registry[keepUuid]) {
          keptUuids.add(keepUuid);
          contentRefs[field] = keepUuid;
          nextRefs.set(refKey, keepUuid);
          const ub = new Set(registry[keepUuid].usedBy || []);
          ub.add(name);
          registry[keepUuid].usedBy = [...ub];
          delete next[field];
        }
        continue;
      }

      const newFp = makeFingerprint(value, field);
      const existingUuid = prevRefs.get(refKey);

      // Reuse UUID if content is unchanged
      if (existingUuid && registry[existingUuid] && _fingerprintCache.get(existingUuid) === newFp) {
        keptUuids.add(existingUuid);
        contentRefs[field] = existingUuid;
        nextRefs.set(refKey, existingUuid);
        const ub = new Set(registry[existingUuid].usedBy || []);
        ub.add(name);
        registry[existingUuid].usedBy = [...ub];
        delete next[field];
        continue;
      }

      // Content changed — write new file
      const descriptor = valueToBlobDescriptor(value, field);
      const contentType = resolveContentType(descriptor.encoding, descriptor.mime);
      counts[contentType === 'image' ? 'image' : contentType === 'video' ? 'video' : contentType === 'json' ? 'json' : 'text']++;

      const uuid = crypto.randomUUID();
      await driver.write(`content/${uuid}.${descriptor.ext}`, descriptor.blob);
      _fingerprintCache.set(uuid, newFp);
      keptUuids.add(uuid);
      nextRefs.set(refKey, uuid);

      registry[uuid] = {
        displayName: makeDisplayName(value, field, descriptor, counts),
        file: `${uuid}.${descriptor.ext}`,
        mime: descriptor.mime,
        type: contentType,
        encoding: descriptor.encoding,
        preview: makePreview(value, descriptor.encoding),
        createdAt: now,
        usedBy: [name]
      };

      contentRefs[field] = uuid;
      delete next[field];
    }

    if (Object.keys(contentRefs).length) next.contentRefs = contentRefs;
    convertedBlocks.push(next);
  }

  // Clean up genuinely orphaned UUIDs (previously used by this save, no longer referenced)
  for (const [uuid, entry] of Object.entries(registry)) {
    if (!entry?.usedBy?.includes(name)) continue;
    if (keptUuids.has(uuid)) continue;
    entry.usedBy = entry.usedBy.filter(s => s !== name);
    if (entry.usedBy.length === 0) {
      await driver.delete(`content/${entry.file}`);
      _fingerprintCache.delete(uuid);
      delete registry[uuid];
    }
  }

  await driver.write(`folders/${name}/layout.json`, { ...normalized, blocks: convertedBlocks });
  await writeFileExplorer(driver, registry);
  _saveRefs.set(name, nextRefs);
}

export async function loadBlocks(name) {
  await ensureMigrated();

  const [layout, registry] = await Promise.all([
    driver.read(`folders/${name}/layout.json`),
    getRegistry()
  ]);
  if (!layout) return { blocks: [], modeOrders: {}, modeSettings: { simple: { columnCount: 2 } } };

  const blockColors = getBlockColors(registry);
  const loadedRefs = new Map(); // populate _saveRefs so first save after load can deduplicate
  const hydratedBlocks = [];

  for (const block of layout.blocks || []) {
    const next = {
      ...block,
      position: { ...(block.position || {}) },
      size: { ...(block.size || {}) }
    };
    const refs = next.contentRefs || {};
    delete next.contentRefs;

    const colors = blockColors[next.id];
    if (colors) { next.bgColor = colors.bgColor; next.textColor = colors.textColor; }

    for (const [field, uuid] of Object.entries(refs)) {
      const entry = registry[uuid];
      if (!entry) continue;
      const blob = await driver.read(`content/${entry.file}`);
      if (!blob) continue;

      let value;
      if (entry.encoding === 'binary') {
        value = await blobToDataUrl(blob);
        // Must match the fingerprint saveBlocks computes from the data URL, or
        // the next save thinks the image changed and rewrites it every time
        // (wasteful churn that can drop the image if a save is interrupted).
        _fingerprintCache.set(uuid, makeFingerprint(value, field));
      } else if (entry.encoding === 'json') {
        const text = await blob.text();
        try { value = JSON.parse(text); } catch { value = text; }
        _fingerprintCache.set(uuid, makeFingerprint(value, field));
      } else {
        value = await blob.text();
        _fingerprintCache.set(uuid, makeFingerprint(value, field));
      }

      next[field] = value;
      loadedRefs.set(`${next.id}::${field}`, uuid);
    }

    hydratedBlocks.push(next);
  }

  _saveRefs.set(name, loadedRefs);
  return { ...layout, blocks: hydratedBlocks };
}

export async function deleteBlocks(name) {
  await ensureMigrated();
  _saveRefs.delete(name);

  const [layout, registry] = await Promise.all([
    driver.read(`folders/${name}/layout.json`),
    getRegistry()
  ]);

  // Remove orphaned content files
  for (const [uuid, entry] of Object.entries(registry)) {
    if (!entry.usedBy?.includes(name)) continue;
    entry.usedBy = entry.usedBy.filter(s => s !== name);
    if (entry.usedBy.length === 0) {
      await driver.delete(`content/${entry.file}`);
      delete registry[uuid];
    }
  }

  // Release this save's claim on each block's color — only deletes the
  // color mapping once no other save (e.g. a "save as" duplicate that
  // shares the same block ids) still references it.
  if (layout?.blocks) {
    for (const block of layout.blocks) {
      removeBlockColorForSave(registry, block.id, name);
    }
  }

  await writeFileExplorer(driver, registry);
  await driver.delete(`folders/${name}/layout.json`);
}

export async function listSavedBlocks() {
  await ensureMigrated();
  const paths = await driver.list('folders/');
  const names = new Set();
  for (const path of paths) {
    const parts = path.split('/');
    if (parts.length >= 2) names.add(parts[1]);
  }
  return [...names];
}

// ---- Content sharing ----

export async function prepareSharedContent(uuid, field) {
  await ensureMigrated();
  const registry = await getRegistry();
  const entry = registry[uuid];
  if (!entry) return null;

  const blob = await driver.read(`content/${entry.file}`);
  if (!blob) return null;

  let value;
  if (entry.encoding === 'binary') {
    value = await blobToDataUrl(blob);
    _fingerprintCache.set(uuid, `${blob.size}`);
  } else if (entry.encoding === 'json') {
    const text = await blob.text();
    try { value = JSON.parse(text); } catch { value = text; }
    _fingerprintCache.set(uuid, makeFingerprint(value, field));
  } else {
    value = await blob.text();
    _fingerprintCache.set(uuid, makeFingerprint(value, field));
  }

  return { value, entry };
}

// Tell the save engine to reuse an existing UUID for a specific block-field.
// Call this after creating a new block that shares content from another block/folder,
// BEFORE the next saveBlocks call, so deduplication reuses the UUID instead of copying.
export function seedSharedRef(saveName, blockId, field, uuid) {
  let refs = _saveRefs.get(saveName);
  if (!refs) { refs = new Map(); _saveRefs.set(saveName, refs); }
  refs.set(`${blockId}::${field}`, uuid);
}

// ---- Content file deletion ----

export async function deleteContentFile(uuid) {
  await ensureMigrated();
  const registry = await getRegistry();
  const entry = registry[uuid];
  if (!entry) return;

  // Remove the contentRef from every block in every layout that references this UUID
  for (const saveName of [...(entry.usedBy || [])]) {
    const layout = await driver.read(`folders/${saveName}/layout.json`);
    if (!layout?.blocks) continue;
    let dirty = false;
    for (const block of layout.blocks) {
      for (const [field, ref] of Object.entries(block.contentRefs || {})) {
        if (ref === uuid) {
          delete block.contentRefs[field];
          dirty = true;
        }
      }
      if (block.contentRefs && Object.keys(block.contentRefs).length === 0) {
        delete block.contentRefs;
      }
    }
    if (dirty) {
      await driver.write(`folders/${saveName}/layout.json`, layout);
      _saveRefs.delete(saveName);
    }
  }

  await driver.delete(`content/${entry.file}`);
  _fingerprintCache.delete(uuid);
  delete registry[uuid];
  await writeFileExplorer(driver, registry);
}

// ---- Recovery / repair ----
//
// The old binary-fingerprint bug rewrote images on every save. If a save was
// interrupted, a layout could end up referencing a content file the registry
// had dropped — the bytes are still on disk, just unregistered. This rebuilds
// those registry entries (so blocks resolve again) and surfaces any remaining
// orphaned files into the File Library.

function mimeFromExt(ext) {
  const e = String(ext || '').toLowerCase();
  if (e === 'png') return 'image/png';
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
  if (e === 'gif') return 'image/gif';
  if (e === 'webp') return 'image/webp';
  if (e === 'svg') return 'image/svg+xml';
  if (e === 'mp4') return 'video/mp4';
  if (e === 'webm') return 'video/webm';
  if (e === 'ogg') return 'video/ogg';
  if (e === 'json') return 'application/json';
  if (e === 'url') return 'text/uri-list';
  return 'text/plain';
}

function classifyExt(ext) {
  const mime = mimeFromExt(ext);
  if (mime.startsWith('image/')) return { type: 'image', encoding: 'binary', mime };
  if (mime.startsWith('video/')) return { type: 'video', encoding: 'binary', mime };
  if (mime === 'application/json') return { type: 'json', encoding: 'json', mime };
  return { type: 'text', encoding: 'text', mime };
}

export async function recoverFiles() {
  await ensureMigrated();
  const registry = await getRegistry();

  // Map every content file currently on disk: uuid -> "uuid.ext"
  const contentKeys = await driver.list('content/');
  const fileByUuid = new Map();
  for (const key of contentKeys) {
    const file = key.replace(/^content\//, '');
    if (file === 'File_explorer.json') continue;
    const uuid = file.replace(/\.[^.]+$/, '');
    if (uuid) fileByUuid.set(uuid, file);
  }

  const knownFiles = new Set(
    Object.values(registry).filter(e => e && e.file).map(e => e.file)
  );

  let relinked = 0; // layout refs whose registry entry we rebuilt
  let orphans = 0;  // unreferenced files surfaced into the library
  const now = Date.now();
  const referenced = new Set();

  // 1) Re-register content files that layouts reference but the registry lost.
  const saves = await listSavedBlocks();
  for (const save of saves) {
    const layout = await driver.read(`folders/${save}/layout.json`);
    if (!layout?.blocks) continue;
    for (const block of layout.blocks) {
      const refs = block.contentRefs || {};
      for (const uuid of Object.values(refs)) {
        referenced.add(uuid);
        if (registry[uuid]) {
          if (!registry[uuid].usedBy?.includes(save)) {
            registry[uuid].usedBy = [...new Set([...(registry[uuid].usedBy || []), save])];
          }
          continue;
        }
        const file = fileByUuid.get(uuid);
        if (!file) continue; // bytes truly gone — nothing to recover
        const blob = await driver.read(`content/${file}`);
        if (!blob) continue;
        const ext = file.split('.').pop();
        const { type, encoding, mime } = classifyExt(ext);
        let preview = null, displayName = `Recovered ${type}`;
        if (encoding !== 'binary') {
          try {
            const text = await blob.text();
            preview = makePreview(text, 'text');
            displayName = makeDisplayName(text, type === 'json' ? 'tasks' : 'content', { encoding, mime }, { text: 1, image: 1, video: 1, json: 1 }) || displayName;
          } catch {}
        }
        registry[uuid] = {
          displayName, file, mime, type, encoding, preview,
          createdAt: now, modifiedAt: now, usedBy: [save], recovered: true
        };
        knownFiles.add(file);
        relinked++;
      }
    }
  }

  // 2) Surface still-orphaned content files (not in registry, not referenced).
  for (const [uuid, file] of fileByUuid) {
    if (knownFiles.has(file)) continue;
    if (registry[uuid]) continue;
    const blob = await driver.read(`content/${file}`);
    if (!blob) continue;
    const ext = file.split('.').pop();
    const { type, encoding, mime } = classifyExt(ext);
    let preview = null, displayName = `Recovered ${type}`;
    if (encoding !== 'binary') {
      try { const text = await blob.text(); preview = makePreview(text, 'text'); } catch {}
    }
    registry[uuid] = {
      displayName, file, mime, type, encoding, preview,
      createdAt: now, modifiedAt: now, usedBy: [], recovered: true
    };
    orphans++;
  }

  if (relinked || orphans) {
    await writeFileExplorer(driver, registry);
    _saveRefs.clear(); // force fresh contentRefs mapping on next save
  }
  return { relinked, orphans };
}

// ---- File Explorer public API ----

export async function getFileExplorer() {
  await ensureMigrated();
  const registry = await readFileExplorer(driver);
  // Strip internal _colors section — that's block metadata, not content files
  const { _colors, ...contentEntries } = registry;
  return contentEntries;
}

export async function renameContentFile(uuid, newDisplayName) {
  await ensureMigrated();
  const registry = await readFileExplorer(driver);
  if (!registry[uuid]) return;
  registry[uuid].displayName = String(newDisplayName).trim() || registry[uuid].displayName;
  await writeFileExplorer(driver, registry);
}

export async function loadContentBlob(uuid) {
  await ensureMigrated();
  const registry = await readFileExplorer(driver);
  const entry = registry[uuid];
  if (!entry) return null;
  const blob = await driver.read(`content/${entry.file}`);
  return blob ?? null;
}

// Reads a blob directly by its stored filename — avoids re-reading the registry
// when the caller already has the entry's `file` field.
export async function loadBlobByPath(filePath) {
  await ensureMigrated();
  return (await driver.read(`content/${filePath}`)) ?? null;
}

// ---- Standalone notes (files that live in the global pool, not in a folder) ----
//
// A standalone note is a real registry entry (kind: 'note') with an empty
// usedBy list — i.e. it belongs to no folder. It is edited directly by
// reading/writing its content file, and can later be added to folders.

function noteTitleFromContent(content) {
  const firstLine = htmlToText(content).split('\n')[0]?.trim() || '';
  if (!firstLine) return 'Untitled note';
  return firstLine.length > 60 ? firstLine.slice(0, 57) + '...' : firstLine;
}

export async function createStandaloneNote(content = '') {
  await ensureMigrated();
  const registry = await getRegistry();
  const uuid = crypto.randomUUID();
  const now = Date.now();
  const text = String(content ?? '');
  await driver.write(`content/${uuid}.txt`, new Blob([text], { type: 'text/plain' }));
  registry[uuid] = {
    displayName: noteTitleFromContent(text),
    file: `${uuid}.txt`,
    mime: 'text/plain',
    type: 'text',
    encoding: 'text',
    kind: 'note',
    autoName: true,
    preview: makePreview(text, 'text'),
    tags: [],
    description: '',
    createdAt: now,
    modifiedAt: now,
    usedBy: []
  };
  _fingerprintCache.set(uuid, makeFingerprint(text, 'content'));
  await writeFileExplorer(driver, registry);
  return uuid;
}

export async function getNoteContent(uuid) {
  await ensureMigrated();
  const registry = await getRegistry();
  const entry = registry[uuid];
  if (!entry) return '';
  const blob = await driver.read(`content/${entry.file}`);
  return blob ? await blob.text() : '';
}

export async function setNoteContent(uuid, content) {
  await ensureMigrated();
  const registry = await getRegistry();
  const entry = registry[uuid];
  if (!entry) return;
  const text = String(content ?? '');
  await driver.write(`content/${entry.file}`, new Blob([text], { type: entry.mime || 'text/plain' }));
  entry.preview = makePreview(text, 'text');
  entry.modifiedAt = Date.now();
  if (entry.kind === 'note' && entry.autoName !== false) {
    entry.displayName = noteTitleFromContent(text);
  }
  _fingerprintCache.set(uuid, makeFingerprint(text, 'content'));
  await writeFileExplorer(driver, registry);
}

// All standalone (unfiled) notes — for the Single Note sidebar / cloud drive.
export async function listStandaloneNotes() {
  await ensureMigrated();
  const registry = await getRegistry();
  const notes = [];
  for (const [uuid, entry] of Object.entries(registry)) {
    if (uuid === '_colors' || uuid === '_folders') continue;
    if (entry?.kind !== 'note') continue;
    if ((entry.usedBy || []).length !== 0) continue;
    notes.push({ uuid, ...entry });
  }
  return notes;
}

// Update metadata (display name / tags / description) on any registry file.
export async function updateFileMeta(uuid, patch = {}) {
  await ensureMigrated();
  const registry = await getRegistry();
  const entry = registry[uuid];
  if (!entry) return;
  if (patch.displayName !== undefined) {
    const trimmed = String(patch.displayName).trim();
    if (trimmed) { entry.displayName = trimmed; entry.autoName = false; }
  }
  if (patch.tags !== undefined) entry.tags = Array.isArray(patch.tags) ? patch.tags : [];
  if (patch.description !== undefined) entry.description = String(patch.description);
  entry.modifiedAt = Date.now();
  await writeFileExplorer(driver, registry);
}

// ---- Bundle export / import ----

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(b64, mime) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function exportBundle(saveName, sections = ['layout', 'content']) {
  await ensureMigrated();
  const bundle = {
    _codex_bundle: true,
    version: 1,
    exportedAt: Date.now(),
    saveName,
    sections
  };

  if (sections.includes('layout')) {
    const layout = await driver.read(`folders/${saveName}/layout.json`);
    bundle.layout = layout || { blocks: [], modeOrders: {}, modeSettings: { simple: { columnCount: 2 } } };
  }

  if (sections.includes('content')) {
    const registry = await readFileExplorer(driver);
    const relevant = Object.entries(registry).filter(
      ([k, v]) => k !== '_colors' && v?.usedBy?.includes(saveName)
    );
    const files = {};
    for (const [uuid, entry] of relevant) {
      const blob = await driver.read(`content/${entry.file}`);
      if (!blob) continue;
      if (entry.encoding === 'binary') {
        files[uuid] = await blobToBase64(blob);
      } else {
        files[uuid] = await blob.text();
      }
    }
    bundle.content = {
      registry: Object.fromEntries(relevant.map(([k, v]) => [k, v])),
      files,
      colors: registry._colors || {}
    };
  }

  if (sections.includes('settings')) {
    bundle.settings = await readAllSettings();
  }

  return bundle;
}

export async function importBundle(bundle, { saveName, sections }) {
  if (!bundle?._codex_bundle) throw new Error('Not a valid Codex bundle');
  await ensureMigrated();
  invalidateCaches();

  if (sections.includes('content') && bundle.content) {
    const registry = await readFileExplorer(driver);

    for (const [uuid, entry] of Object.entries(bundle.content.registry || {})) {
      const rawData = bundle.content.files?.[uuid];
      if (rawData === undefined || rawData === null) continue;

      let blob;
      if (entry.encoding === 'binary') {
        blob = base64ToBlob(rawData, entry.mime);
      } else {
        blob = new Blob([rawData], { type: entry.mime });
      }

      await driver.write(`content/${entry.file}`, blob);

      const usedBy = new Set(entry.usedBy || []);
      usedBy.add(saveName);
      registry[uuid] = { ...entry, usedBy: [...usedBy] };
    }

    // Merge block colors
    if (bundle.content.colors) {
      if (!registry._colors) registry._colors = {};
      Object.assign(registry._colors, bundle.content.colors);
    }

    await writeFileExplorer(driver, registry);
  }

  if (sections.includes('layout') && bundle.layout) {
    // Clear old content refs for this save before writing new layout
    const registry = await readFileExplorer(driver);
    for (const [uuid, entry] of Object.entries(registry)) {
      if (!entry.usedBy?.includes(saveName)) continue;
      entry.usedBy = entry.usedBy.filter(s => s !== saveName);
      if (entry.usedBy.length === 0 && !sections.includes('content')) {
        // only delete content if we're not also importing content
        await driver.delete(`content/${entry.file}`);
        delete registry[uuid];
      }
    }

    // Mark all contentRefs in the new layout as usedBy this save
    for (const block of bundle.layout.blocks || []) {
      for (const uuid of Object.values(block.contentRefs || {})) {
        if (registry[uuid]) {
          const usedBy = new Set(registry[uuid].usedBy || []);
          usedBy.add(saveName);
          registry[uuid].usedBy = [...usedBy];
        }
      }
    }

    await driver.write(`folders/${saveName}/layout.json`, bundle.layout);
    await writeFileExplorer(driver, registry);
  }

  if (sections.includes('settings') && bundle.settings) {
    await writeAllSettings(bundle.settings);
  }
}

// ---- Filesystem storage (File System Access API) ----

async function saveFSHandle(handle) {
  const db = await getDB();
  const tx = db.transaction(FS_SETTINGS_STORE, 'readwrite');
  await tx.store.put(handle, 'rootHandle');
  await tx.done;
}

async function loadFSHandle() {
  const db = await getDB();
  return db.get(FS_SETTINGS_STORE, 'rootHandle') ?? null;
}

async function clearFSHandle() {
  const db = await getDB();
  await db.delete(FS_SETTINGS_STORE, 'rootHandle');
}

export function isFileSystemStorageActive() {
  return driver.getInner() instanceof FileSystemDriver;
}

export function getFileSystemFolderName() {
  const inner = driver.getInner();
  return inner instanceof FileSystemDriver ? inner.rootName : null;
}

export function isFileSystemAccessSupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function tryInitFileSystemStorage() {
  // Tauri — auto-activate, no user gesture needed
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    try {
      const { TauriFileSystemDriver } = await import(/* @vite-ignore */ './storage/TauriFileSystemDriver.js');
      migrationPromise = null;
      invalidateCaches();
      driver.setInner(new TauriFileSystemDriver());
      return true;
    } catch (e) {
      console.warn('[storage] Tauri driver failed to load:', e);
    }
  }

  // Capacitor — auto-activate, no user gesture needed
  if (
    typeof window !== 'undefined' &&
    typeof window.Capacitor !== 'undefined' &&
    window.Capacitor?.isNativePlatform?.()
  ) {
    try {
      const { CapacitorFileSystemDriver } = await import(/* @vite-ignore */ './storage/CapacitorFileSystemDriver.js');
      migrationPromise = null;
      invalidateCaches();
      driver.setInner(new CapacitorFileSystemDriver());
      return true;
    } catch (e) {
      console.warn('[storage] Capacitor driver failed to load:', e);
    }
  }

  // Browser — try to reconnect a previously chosen local folder
  if (!isFileSystemAccessSupported()) return false;
  const handle = await loadFSHandle();
  if (!handle) return false;
  try {
    let perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      perm = await handle.requestPermission({ mode: 'readwrite' });
    }
    if (perm === 'granted') {
      migrationPromise = null;
      invalidateCaches();
      driver.setInner(new FileSystemDriver(handle));
      return true;
    }
  } catch {
    // Permission API unavailable or handle invalid
  }
  return false;
}

export async function enableFileSystemStorage() {
  if (!isFileSystemAccessSupported()) {
    throw new Error('File System Access API is not supported in this browser.');
  }
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  migrationPromise = null;
  invalidateCaches();
  driver.setInner(new FileSystemDriver(handle));
  await saveFSHandle(handle);
  return handle.name;
}

export async function disableFileSystemStorage() {
  migrationPromise = null;
  invalidateCaches();
  driver.setInner(new IndexedDBDriver());
  await clearFSHandle();
}

// ---- Exported for DevTools / rollback ----
export { driver };
export { rollbackMigration } from './storage/migration.js';
