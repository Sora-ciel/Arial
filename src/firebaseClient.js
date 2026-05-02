import { firebaseConfig, firebaseSyncNamespace } from '../firebase.ts';

export { firebaseConfig, firebaseSyncNamespace };

const REQUIRED_FIREBASE_KEYS = [
  'apiKey',
  'authDomain',
  'projectId',
  'appId',
  'databaseURL'
];

const FIREBASE_SDK_VERSION = '11.7.0';
const ATTACHMENT_FIELDS = ['src', 'content', 'trackUrl'];

let firebaseModulesPromise;
let firebaseContextPromise;

function loadFirebaseModules() {
  if (!firebaseModulesPromise) {
    firebaseModulesPromise = Promise.all([
      import(/* @vite-ignore */ `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
      import(/* @vite-ignore */ `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`),
      import(/* @vite-ignore */ `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-database.js`),
      import(/* @vite-ignore */ `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-storage.js`)
    ]).then(([app, auth, database, storage]) => ({ app, auth, database, storage }));
  }
  return firebaseModulesPromise;
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

  const provider = new ctx.authApi.GoogleAuthProvider();
  const result = await ctx.authApi.signInWithPopup(ctx.auth, provider);
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

  return snapshot.exists() ? snapshot.val() : null;
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

export async function saveRemoteFile(fileId, payload) {
  if (!isFirebaseConfigured()) return null;
  const ctx = await getFirebaseContext();
  const user = requireUser(ctx.auth.currentUser);
  const payloadWithRemoteAttachments = await uploadBlockAttachments(fileId, payload, ctx, user.uid);
  const updatedAt = payload?.updatedAt || Date.now();

  await ctx.dbApi.set(
    ctx.dbApi.ref(ctx.db, getUserPath(user.uid, `files/${fileId}`)),
    { ...payloadWithRemoteAttachments, updatedAt }
  );

  await ctx.dbApi.set(
    ctx.dbApi.ref(ctx.db, getUserPath(user.uid, `index/${fileId}`)),
    {
      fileId,
      updatedAt,
      blockCount: Array.isArray(payloadWithRemoteAttachments?.blocks) ? payloadWithRemoteAttachments.blocks.length : 0
    }
  );

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

export async function resolveAttachmentUrl(value) {
  return value || null;
}

export async function resolveAttachmentURL(value) {
  return resolveAttachmentUrl(value);
}
