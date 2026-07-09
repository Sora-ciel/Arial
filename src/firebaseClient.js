import { firebaseConfig, firebaseSyncNamespace } from '../firebase.ts';

export { firebaseConfig, firebaseSyncNamespace };

const REQUIRED_FIREBASE_KEYS = [
  'apiKey',
  'authDomain',
  'projectId',
  'appId',
  'databaseURL'
];

const ATTACHMENT_FIELDS = ['src', 'content', 'trackUrl'];

let firebaseModulesPromise;
let firebaseContextPromise;

// Load the Firebase SDK from the bundled npm package rather than the gstatic
// CDN. Packaged builds (Tauri / Capacitor) run from a custom-scheme origin
// (tauri://localhost, capacitor://localhost) and can't reliably resolve a
// cross-origin ESM `import()` from gstatic — and require live network. Bundling
// makes sync work offline and on every platform.
function loadFirebaseModules() {
  if (!firebaseModulesPromise) {
    firebaseModulesPromise = Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/database'),
      import('firebase/storage')
    ]).then(([app, auth, database, storage]) => ({ app, auth, database, storage }));
  }
  return firebaseModulesPromise;
}

// Which shell are we running inside? Mirrors the detection used by the storage
// layer (see src/storage.js). Determines how Google sign-in is performed.
export function getRuntimePlatform() {
  if (typeof window === 'undefined') return 'web';
  if ('__TAURI_INTERNALS__' in window) return 'tauri';
  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
    return 'capacitor';
  }
  return 'web';
}

async function getFirebaseContext() {
  if (!isFirebaseConfigured()) return null;
  if (!firebaseContextPromise) {
    firebaseContextPromise = loadFirebaseModules().then(({ app, auth, database, storage }) => {
      const firebaseApp = app.getApps().length
        ? app.getApp()
        : app.initializeApp(firebaseConfig);
      const firebaseAuth = auth.getAuth(firebaseApp);
      auth.setPersistence(firebaseAuth, auth.browserLocalPersistence).catch(() => {});
      const firebaseDb = database.getDatabase(firebaseApp);
      const firebaseStorage = storage.getStorage(firebaseApp);
      return { app: firebaseApp, auth: firebaseAuth, db: firebaseDb, storage: firebaseStorage, authApi: auth, dbApi: database, storageApi: storage };
    });
  }
  return firebaseContextPromise;
}

function inferExtensionFromMime(mime = '') {
  const normalized = String(mime).toLowerCase();
  if (normalized.includes('jpeg')) return 'jpg';
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('svg')) return 'svg';
  if (normalized.includes('mp4')) return 'mp4';
  if (normalized.includes('webm')) return 'webm';
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('mpeg')) return 'mp3';
  return 'bin';
}

async function uploadBlockAttachments(fileId, payload, ctx, uid) {
  if (!Array.isArray(payload?.blocks)) return payload;

  const blocks = await Promise.all(payload.blocks.map(async (block, index) => {
    const next = { ...block };

    for (const field of ATTACHMENT_FIELDS) {
      const value = next[field];
      if (typeof value !== 'string' || !value.startsWith('data:')) continue;

      const uploadedUrl = await uploadAttachmentFromDataUrl(value, {
        fileId,
        blockId: block?.id || `block-${index + 1}`,
        field,
        uid,
        ctx
      });

      if (uploadedUrl) {
        next[field] = uploadedUrl;
      }
    }

    return next;
  }));

  return {
    ...payload,
    blocks
  };
}

// Content fields whose LOSS must never clobber a good cloud value. Covers
// images/media (`src`, `trackUrl`) and rich-text (`content`).
const PRESERVE_FIELDS = ['src', 'trackUrl', 'content'];

// A field counts as "lost" only when it's absent (undefined/null) — that's how
// a block hydrates when its stored bytes went missing. An empty string is an
// intentional clear (e.g. emptying a note) and is left to sync normally.
function isLostField(value) {
  return value === undefined || value === null;
}

// Which content field(s) each block type is expected to carry. Used to decide
// whether a missing field is a genuine loss (worth a remote read) versus a
// field the block simply never has (e.g. a text block has no `src`).
const TYPE_CONTENT_FIELDS = {
  text: ['content'],
  cleantext: ['content'],
  embed: ['content'],
  image: ['src'],
  video: ['src'],
  music: ['src', 'trackUrl']
};

// Guard against the data-loss bug: when a local block lost its stored bytes it
// hydrates with the field absent, and a naive upload would overwrite the cloud
// value with nothing — irrecoverably (text lives only in the DB; there is no
// Storage copy to relink later). Before writing, if a block's field is lost
// locally but the current cloud copy still has a value, keep the cloud one.
async function preserveRemoteMediaAttachments(fileId, payload, ctx, uid) {
  if (!Array.isArray(payload?.blocks)) return payload;

  // Only pay for a remote read when a content-bearing block actually lost the
  // field it's supposed to carry. A fully-populated folder skips the read.
  const atRisk = payload.blocks.some(block => {
    const fields = TYPE_CONTENT_FIELDS[block?.type];
    return fields && fields.some(f => isLostField(block?.[f]));
  });
  if (!atRisk) return payload;

  const snapshot = await ctx.dbApi.get(
    ctx.dbApi.ref(ctx.db, getUserPath(uid, `files/${fileId}`))
  );
  const remote = snapshot.exists() ? snapshot.val() : null;
  if (!Array.isArray(remote?.blocks)) return payload;

  const remoteById = new Map(remote.blocks.map(b => [b?.id, b]));
  const blocks = payload.blocks.map(block => {
    const remoteBlock = remoteById.get(block?.id);
    if (!remoteBlock) return block;
    let next = block;
    for (const field of PRESERVE_FIELDS) {
      const remoteVal = remoteBlock?.[field];
      if (isLostField(block?.[field]) && typeof remoteVal === 'string' && remoteVal) {
        if (next === block) next = { ...block };
        next[field] = remoteVal;
      }
    }
    return next;
  });

  return { ...payload, blocks };
}

// ---- Text safety net ----
//
// Rich-text `content` lives only inline in the Realtime DB — unlike images it
// has no Storage copy, so a DB wipe is unrecoverable. As defense-in-depth we
// also snapshot each text block's content into Storage (alongside attachments,
// under the same {fileId}/{blockId}/content/ path), so it can be relinked the
// same way images are. This never alters the payload; the inline copy stays.
const TEXT_BACKUP_TYPES = ['text', 'cleantext', 'embed'];
// `${fileId}::${blockId}` -> fingerprint of the last content we backed up, so
// unchanged text isn't re-uploaded on every 3s autosync tick.
const _textBackupFingerprints = new Map();

async function backupTextToStorage(fileId, payload, ctx, uid) {
  if (!Array.isArray(payload?.blocks)) return;
  for (const block of payload.blocks) {
    if (!TEXT_BACKUP_TYPES.includes(block?.type)) continue;
    const content = block?.content;
    if (typeof content !== 'string' || content === '') continue;

    const key = `${fileId}::${block.id}`;
    const fingerprint = `${content.length}:${content.slice(0, 100)}`;
    if (_textBackupFingerprints.get(key) === fingerprint) continue;

    try {
      const objectName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.html`;
      const objectPath = `${getStorageUserPath(uid, `attachments/${fileId}/${block.id}/content`)}/${objectName}`;
      const ref = ctx.storageApi.ref(ctx.storage, objectPath);
      await ctx.storageApi.uploadBytes(ref, new Blob([content], { type: 'text/html' }), {
        contentType: 'text/html',
        cacheControl: 'public,max-age=31536000'
      });
      _textBackupFingerprints.set(key, fingerprint);
    } catch (error) {
      // Best-effort safety net — never let a backup failure break sync.
      console.warn('[firebase] text backup failed for', key, error?.message);
    }
  }
}

function normalizeNamespace() {
  return firebaseSyncNamespace || 'default';
}

function getUserPath(uid, suffix = '') {
  const ns = normalizeNamespace();
  return `sync/${ns}/users/${uid}/${suffix}`.replace(/\/$/, '');
}

function getStorageUserPath(uid, suffix = '') {
  return `users/${uid}/${suffix}`.replace(/\/$/, '');
}

function requireUser(user) {
  if (!user) throw new Error('Please sign in with Google first.');
  return user;
}

export function isFirebaseConfigured() {
  return REQUIRED_FIREBASE_KEYS.every(key => {
    const value = firebaseConfig?.[key];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

export function getCurrentUser() {
  return null;
}

export function onAuthStateChange(callback) {
  let unsub = () => {};
  let cancelled = false;

  getFirebaseContext()
    .then(ctx => {
      if (cancelled || !ctx) {
        callback?.(null);
        return;
      }
      unsub = ctx.authApi.onAuthStateChanged(ctx.auth, callback);
    })
    .catch(() => {
      callback?.(null);
    });

  return () => {
    cancelled = true;
    unsub();
  };
}

export async function signInWithGoogle() {
  const ctx = await getFirebaseContext();
  if (!ctx) throw new Error('Firebase is not configured.');

  const platform = getRuntimePlatform();

  // Browser / PWA: the popup flow works and is the smoothest UX.
  if (platform === 'web') {
    const provider = new ctx.authApi.GoogleAuthProvider();
    const result = await ctx.authApi.signInWithPopup(ctx.auth, provider);
    return result.user;
  }

  // Packaged builds (Tauri desktop, Capacitor Android): `signInWithPopup`
  // can't work inside a native WebView (no popup/opener relay, and the custom
  // scheme origin isn't an authorizable Firebase domain). Instead we obtain a
  // Google credential through a platform-native flow and sign in with it.
  const { getNativeGoogleCredential } = await import('./nativeAuth.js');
  const { idToken, accessToken } = await getNativeGoogleCredential(platform);
  const credential = ctx.authApi.GoogleAuthProvider.credential(idToken, accessToken || null);
  const result = await ctx.authApi.signInWithCredential(ctx.auth, credential);
  return result.user;
}

export async function signOutUser() {
  const ctx = await getFirebaseContext();
  if (!ctx) return;
  await ctx.authApi.signOut(ctx.auth);
}

export async function loadRemoteFile(fileId) {
  if (!isFirebaseConfigured()) return null;
  const ctx = await getFirebaseContext();
  const user = requireUser(ctx.auth.currentUser);

  const snapshot = await ctx.dbApi.get(
    ctx.dbApi.ref(ctx.db, getUserPath(user.uid, `files/${fileId}`))
  );

  if (!snapshot.exists()) return null;
  const raw = snapshot.val();
  // v2 payloads carry content by hash; resolve them back to inline values.
  // v1 (no schemaVersion) already has inline/URL fields — return as-is.
  if (raw && raw.schemaVersion === CLOUD_SCHEMA_VERSION) {
    return await resolveRemoteFileV2(raw, ctx, user.uid);
  }
  return raw;
}

export async function loadRemoteIndex() {
  if (!isFirebaseConfigured()) return {};
  const ctx = await getFirebaseContext();
  const user = requireUser(ctx.auth.currentUser);

  const snapshot = await ctx.dbApi.get(
    ctx.dbApi.ref(ctx.db, getUserPath(user.uid, 'index'))
  );

  return snapshot.exists() ? snapshot.val() : {};
}

export async function saveRemoteFile(fileId, payload, options = {}) {
  if (!isFirebaseConfigured()) return null;
  const ctx = await getFirebaseContext();
  const user = requireUser(ctx.auth.currentUser);
  const shouldUploadAttachments = options.uploadAttachments !== false;
  const uploadedPayload = shouldUploadAttachments
    ? await uploadBlockAttachments(fileId, payload, ctx, user.uid)
    : payload;
  const payloadWithRemoteAttachments = await preserveRemoteMediaAttachments(
    fileId, uploadedPayload, ctx, user.uid
  );
  const updatedAt = payload?.updatedAt || Date.now();
  const modifiedAt = payload?.modifiedAt || payload?.updatedAt || Date.now();
  const lastSyncedAt = Date.now();

  await ctx.dbApi.set(
    ctx.dbApi.ref(ctx.db, getUserPath(user.uid, `files/${fileId}`)),
    { ...payloadWithRemoteAttachments, updatedAt, modifiedAt, lastSyncedAt }
  );

  await ctx.dbApi.set(
    ctx.dbApi.ref(ctx.db, getUserPath(user.uid, `index/${fileId}`)),
    {
      fileId,
      updatedAt,
      modifiedAt,
      lastSyncedAt,
      blockCount: Array.isArray(payloadWithRemoteAttachments?.blocks) ? payloadWithRemoteAttachments.blocks.length : 0
    }
  );

  // Snapshot text content to Storage as a recovery net (changed blocks only).
  await backupTextToStorage(fileId, payloadWithRemoteAttachments, ctx, user.uid);

  return { fileId, updatedAt };
}

export async function deleteRemoteFile(fileId) {
  if (!isFirebaseConfigured()) return null;
  const ctx = await getFirebaseContext();
  const user = requireUser(ctx.auth.currentUser);

  await Promise.all([
    ctx.dbApi.remove(ctx.dbApi.ref(ctx.db, getUserPath(user.uid, `files/${fileId}`))),
    ctx.dbApi.remove(ctx.dbApi.ref(ctx.db, getUserPath(user.uid, `index/${fileId}`)))
  ]);

  return { fileId };
}

export async function uploadAttachmentFromDataUrl(dataUrl, options = {}) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;

  const ctx = options.ctx || await getFirebaseContext();
  if (!ctx) return null;

  const uid = options.uid || requireUser(ctx.auth.currentUser).uid;
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const mime = blob.type || 'application/octet-stream';
  const ext = inferExtensionFromMime(mime);
  const fileId = String(options.fileId || 'unknown-file');
  const blockId = String(options.blockId || 'unknown-block');
  const field = String(options.field || 'attachment');
  const objectName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const objectPath = `${getStorageUserPath(uid, `attachments/${fileId}/${blockId}/${field}`)}/${objectName}`;
  const storageRef = ctx.storageApi.ref(ctx.storage, objectPath);

  await ctx.storageApi.uploadBytes(storageRef, blob, {
    contentType: mime,
    cacheControl: 'public,max-age=31536000'
  });

  return await ctx.storageApi.getDownloadURL(storageRef);
}

// ---- Recovery: relink cloud Storage objects back to their blocks ----
//
// Every uploaded attachment lives at a path that encodes its owner:
//   users/{uid}/attachments/{fileId}/{blockId}/{field}/{timestamp-rand.ext}
// so even if the Realtime DB pointers were wiped, the folder→block→field
// mapping survives in Storage. This walks every object, keeps the newest per
// (fileId, blockId, field), and returns { fileId: { blockId: { field: url } } }.
export async function listCloudAttachmentUrls() {
  if (!isFirebaseConfigured()) return {};
  const ctx = await getFirebaseContext();
  const user = requireUser(ctx.auth.currentUser);

  const rootRef = ctx.storageApi.ref(ctx.storage, getStorageUserPath(user.uid, 'attachments'));

  const items = [];
  async function walk(ref) {
    const res = await ctx.storageApi.listAll(ref);
    items.push(...res.items);
    for (const prefix of res.prefixes) await walk(prefix);
  }
  await walk(rootRef);

  // Newest object per (fileId, blockId, field), by the timestamp name prefix.
  const best = new Map();
  for (const item of items) {
    const parts = item.fullPath.split('/');
    const aIdx = parts.indexOf('attachments');
    if (aIdx < 0 || parts.length < aIdx + 5) continue;
    const fileId = parts[aIdx + 1];
    const blockId = parts[aIdx + 2];
    const field = parts[aIdx + 3];
    const name = parts[aIdx + 4];
    const ts = Number(String(name).split('-')[0]) || 0;
    const key = `${fileId} ${blockId} ${field}`;
    const prev = best.get(key);
    if (!prev || ts > prev.ts) best.set(key, { item, ts, fileId, blockId, field });
  }

  const map = {};
  for (const { item, fileId, blockId, field } of best.values()) {
    const url = await ctx.storageApi.getDownloadURL(item);
    if (!map[fileId]) map[fileId] = {};
    if (!map[fileId][blockId]) map[fileId][blockId] = {};
    map[fileId][blockId][field] = url;
  }
  return map;
}

// ===================== v2: content-addressed cloud =====================
//
// Mirrors the local storage.js model in the cloud: each unique file is stored
// once at content/{sha256}.{ext}, a per-user `registry` maps hash -> { url,
// mime, kind, usedBy }, and folder payloads carry `contentRefs: { field: hash }`
// instead of inline data. Identical images/text across blocks and folders
// collapse to a single object. v1 (inline/URL) payloads still read unchanged;
// a payload is v2 only when it carries `schemaVersion: 2`.
export const CLOUD_SCHEMA_VERSION = 2;
// Which block fields become deduplicated content objects. Small meta (title,
// colors, positions) stays inline on the block.
const ADDRESSABLE_FIELDS = ['src', 'trackUrl', 'content', 'tasks'];

async function sha256Hex(arrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', arrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function isEmptyFieldValue(value) {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

// Normalize any block field value into an uploadable blob + descriptor.
async function fieldValueToBlob(value) {
  if (typeof value === 'string' && (value.startsWith('data:') || /^https?:\/\//i.test(value))) {
    const blob = await (await fetch(value)).blob();
    const mime = blob.type || 'application/octet-stream';
    return { blob, mime, ext: inferExtensionFromMime(mime), kind: mime.startsWith('video/') ? 'video' : 'image' };
  }
  if (value && typeof value === 'object') {
    const text = JSON.stringify(value);
    return { blob: new Blob([text], { type: 'application/json' }), mime: 'application/json', ext: 'json', kind: 'json' };
  }
  const text = String(value ?? '');
  return { blob: new Blob([text], { type: 'text/html' }), mime: 'text/html', ext: 'html', kind: 'text' };
}

async function readCloudRegistry(ctx, uid) {
  const snap = await ctx.dbApi.get(ctx.dbApi.ref(ctx.db, getUserPath(uid, 'registry')));
  return snap.exists() ? snap.val() : {};
}

// Upload a field's content once (keyed by hash); reuse an existing registry
// entry if the same bytes are already in the cloud. Returns the content hash.
async function ensureCloudContent(value, ctx, uid, folderId, registry, dirty) {
  const desc = await fieldValueToBlob(value);
  const hash = await sha256Hex(await desc.blob.arrayBuffer());

  let entry = registry[hash];
  if (!entry) {
    const objectPath = getStorageUserPath(uid, `content/${hash}.${desc.ext}`);
    const ref = ctx.storageApi.ref(ctx.storage, objectPath);
    await ctx.storageApi.uploadBytes(ref, desc.blob, {
      contentType: desc.mime,
      cacheControl: 'public,max-age=31536000'
    });
    const url = await ctx.storageApi.getDownloadURL(ref);
    entry = { ext: desc.ext, mime: desc.mime, kind: desc.kind, url, usedBy: {} };
    registry[hash] = entry;
    dirty.v = true;
  }
  if (!entry.usedBy) entry.usedBy = {};
  if (!entry.usedBy[folderId]) { entry.usedBy[folderId] = true; dirty.v = true; }
  return hash;
}

// Write a folder in v2 form: fields are content-addressed, blocks hold
// contentRefs. Does NOT touch the index/timestamps handling of saveRemoteFile —
// callers use this deliberately (migration / v2 upload path).
export async function saveRemoteFileV2(fileId, payload, options = {}) {
  if (!isFirebaseConfigured()) return null;
  const ctx = await getFirebaseContext();
  const user = requireUser(ctx.auth.currentUser);
  const uid = user.uid;

  const registry = await readCloudRegistry(ctx, uid);
  const dirty = { v: false };

  const blocks = [];
  for (const block of payload?.blocks || []) {
    const next = { ...block };
    const contentRefs = {};
    for (const field of ADDRESSABLE_FIELDS) {
      const value = next[field];
      if (isEmptyFieldValue(value)) { delete next[field]; continue; }
      contentRefs[field] = await ensureCloudContent(value, ctx, uid, fileId, registry, dirty);
      delete next[field];
    }
    if (Object.keys(contentRefs).length) next.contentRefs = contentRefs;
    blocks.push(next);
  }

  if (dirty.v) {
    await ctx.dbApi.set(ctx.dbApi.ref(ctx.db, getUserPath(uid, 'registry')), registry);
  }

  const updatedAt = payload?.updatedAt || Date.now();
  const modifiedAt = payload?.modifiedAt || updatedAt;
  const lastSyncedAt = Date.now();

  await ctx.dbApi.set(
    ctx.dbApi.ref(ctx.db, getUserPath(uid, `files/${fileId}`)),
    { ...payload, blocks, schemaVersion: CLOUD_SCHEMA_VERSION, updatedAt, modifiedAt, lastSyncedAt }
  );
  await ctx.dbApi.set(
    ctx.dbApi.ref(ctx.db, getUserPath(uid, `index/${fileId}`)),
    { fileId, updatedAt, modifiedAt, lastSyncedAt, schemaVersion: CLOUD_SCHEMA_VERSION, blockCount: blocks.length }
  );

  return { fileId, updatedAt };
}

// Resolve a raw v2 payload (blocks with contentRefs) back into an inline
// payload the local storage layer understands: media -> URL, text -> string,
// json -> parsed object. Shared by loadRemoteFile's version dispatch.
async function resolveRemoteFileV2(rawPayload, ctx, uid) {
  const registry = await readCloudRegistry(ctx, uid);
  const blocks = [];
  for (const block of rawPayload?.blocks || []) {
    const next = { ...block };
    const refs = next.contentRefs || {};
    delete next.contentRefs;
    for (const [field, hash] of Object.entries(refs)) {
      const entry = registry[hash];
      if (!entry?.url) continue;
      if (entry.kind === 'image' || entry.kind === 'video') {
        next[field] = entry.url;
      } else if (entry.kind === 'json') {
        try { next[field] = JSON.parse(await (await fetch(entry.url)).text()); }
        catch { next[field] = await (await fetch(entry.url)).text(); }
      } else {
        next[field] = await (await fetch(entry.url)).text();
      }
    }
    blocks.push(next);
  }
  return { ...rawPayload, blocks };
}

export async function resolveAttachmentUrl(value) {
  return value || null;
}

export async function resolveAttachmentURL(value) {
  return resolveAttachmentUrl(value);
}
