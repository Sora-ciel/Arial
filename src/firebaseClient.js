const FIREBASE_CDN_VERSION = '11.0.2';

const firebaseDefaults = {
  apiKey: 'AIzaSyBRrsegKXpz_7ZcKBQXhoxpOcx4HIzZ1fE',
  authDomain: 'arial-473c1.firebaseapp.com',
  projectId: 'arial-473c1',
  storageBucket: 'arial-473c1.firebasestorage.app',
  appId: '1:921907824188:web:652f54122a8d8a22742539',
  databaseURL: 'https://arial-473c1-default-rtdb.firebaseio.com'
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseDefaults.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseDefaults.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseDefaults.projectId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseDefaults.appId,
  databaseURL: import.meta.env.VITE_FIREBASE_DB_URL || firebaseDefaults.databaseURL,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseDefaults.storageBucket
};

const FIREBASE_SYNC_NAMESPACE =
  import.meta.env.VITE_FIREBASE_SYNC_NAMESPACE || 'default';

const requiredConfigKeys = [
  'apiKey',
  'authDomain',
  'projectId',
  'appId',
  'databaseURL',
  'storageBucket'
];

function hasValidConfig() {
  return requiredConfigKeys.every(key => Boolean(firebaseConfig[key]));
}

let sdkPromise = null;
let initialized = null;
let currentUser = null;

async function loadFirebaseSdk() {
  if (sdkPromise) return sdkPromise;

  sdkPromise = Promise.all([
    import(
      /* @vite-ignore */ `https://www.gstatic.com/firebasejs/${FIREBASE_CDN_VERSION}/firebase-app.js`
    ),
    import(
      /* @vite-ignore */ `https://www.gstatic.com/firebasejs/${FIREBASE_CDN_VERSION}/firebase-auth.js`
    ),
    import(
      /* @vite-ignore */ `https://www.gstatic.com/firebasejs/${FIREBASE_CDN_VERSION}/firebase-database.js`
    ),
    import(
      /* @vite-ignore */ `https://www.gstatic.com/firebasejs/${FIREBASE_CDN_VERSION}/firebase-storage.js`
    )
  ]).then(([appSdk, authSdk, dbSdk, storageSdk]) => ({
    appSdk,
    authSdk,
    dbSdk,
    storageSdk
  }));

  return sdkPromise;
}

export function isFirebaseConfigured() {
  return hasValidConfig();
}

export function getSyncNamespace() {
  return FIREBASE_SYNC_NAMESPACE;
}

export function getCurrentUser() {
  return currentUser;
}

async function ensureInitialized() {
  if (!hasValidConfig()) return null;
  if (initialized) return initialized;

  const { appSdk, authSdk, dbSdk, storageSdk } = await loadFirebaseSdk();

  const app = appSdk.initializeApp(firebaseConfig);
  const auth = authSdk.getAuth(app);
  const db = dbSdk.getDatabase(app);
  const storage = storageSdk.getStorage(app);
  const provider = new authSdk.GoogleAuthProvider();

  initialized = {
    app,
    auth,
    db,
    storage,
    provider,
    authSdk,
    dbSdk,
    storageSdk
  };

  return initialized;
}

function userRoot(uid) {
  return `sync/${FIREBASE_SYNC_NAMESPACE}/users/${uid}`;
}

function isStorageAttachmentRef(value) {
  return value && typeof value === 'object' && value.type === 'storage' && value.storagePath;
}

function extensionFromMime(mimeType = '') {
  const normalized = mimeType.toLowerCase();
  if (normalized === 'image/jpeg') return 'jpg';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'image/gif') return 'gif';
  if (normalized === 'video/mp4') return 'mp4';
  return 'bin';
}

export async function onAuthStateChange(callback) {
  const ctx = await ensureInitialized();
  if (!ctx) {
    callback(null);
    return () => {};
  }

  return ctx.authSdk.onAuthStateChanged(ctx.auth, user => {
    currentUser = user;
    callback(user);
  });
}

export async function signInWithGoogle() {
  const ctx = await ensureInitialized();
  if (!ctx) {
    throw new Error('Firebase is not configured.');
  }
  const result = await ctx.authSdk.signInWithPopup(ctx.auth, ctx.provider);
  currentUser = result.user || ctx.auth.currentUser;
  return currentUser;
}

export async function signOutUser() {
  const ctx = await ensureInitialized();
  if (!ctx) return;
  await ctx.authSdk.signOut(ctx.auth);
  currentUser = null;
}

function requireUser() {
  const user = getCurrentUser();
  if (!user) return null;
  return user;
}

export async function loadRemoteFile(fileId) {
  const ctx = await ensureInitialized();
  const user = requireUser();
  if (!ctx || !user) return null;

  const fileRef = ctx.dbSdk.ref(ctx.db, `${userRoot(user.uid)}/files/${fileId}`);
  const snapshot = await ctx.dbSdk.get(fileRef);
  return snapshot.exists() ? snapshot.val() : null;
}

export async function loadRemoteIndex() {
  const ctx = await ensureInitialized();
  const user = requireUser();
  if (!ctx || !user) return null;

  const indexRef = ctx.dbSdk.ref(ctx.db, `${userRoot(user.uid)}/index`);
  const snapshot = await ctx.dbSdk.get(indexRef);
  return snapshot.exists() ? snapshot.val() : {};
}

export async function saveRemoteFile(fileId, payload, metadata) {
  const ctx = await ensureInitialized();
  const user = requireUser();
  if (!ctx || !user) return false;

  const basePath = `${userRoot(user.uid)}`;
  const fileRef = ctx.dbSdk.ref(ctx.db, `${basePath}/files/${fileId}`);
  const indexRef = ctx.dbSdk.ref(ctx.db, `${basePath}/index/${fileId}`);

  await ctx.dbSdk.set(fileRef, {
    ...payload,
    updatedAt: ctx.dbSdk.serverTimestamp()
  });

  await ctx.dbSdk.update(indexRef, {
    ...metadata,
    updatedAt: ctx.dbSdk.serverTimestamp()
  });

  return true;
}

export async function deleteRemoteFile(fileId) {
  const ctx = await ensureInitialized();
  const user = requireUser();
  if (!ctx || !user) return false;

  const basePath = `${userRoot(user.uid)}`;
  const fileRef = ctx.dbSdk.ref(ctx.db, `${basePath}/files/${fileId}`);
  const indexRef = ctx.dbSdk.ref(ctx.db, `${basePath}/index/${fileId}`);

  await Promise.all([ctx.dbSdk.remove(fileRef), ctx.dbSdk.remove(indexRef)]);
  return true;
}

export async function uploadAttachmentFromDataUrl(attachmentId, dataUrl) {
  const ctx = await ensureInitialized();
  const user = requireUser();
  if (!ctx || !user) return null;

  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const contentType = blob.type || 'application/octet-stream';
  const ext = extensionFromMime(contentType);
  const safeExt = ext ? `.${ext}` : '';
  const storagePath = `users/${user.uid}/attachments/${attachmentId}${safeExt}`;
  const attachmentRef = ctx.storageSdk.ref(ctx.storage, storagePath);

  await ctx.storageSdk.uploadBytes(attachmentRef, blob, {
    contentType
  });

  return {
    type: 'storage',
    attachmentId,
    storagePath,
    contentType,
    size: blob.size
  };
}

export async function resolveAttachmentUrl(attachmentRefLike) {
  if (!isStorageAttachmentRef(attachmentRefLike)) return null;

  const ctx = await ensureInitialized();
  const user = requireUser();
  if (!ctx || !user) return null;

  if (!attachmentRefLike.storagePath.startsWith(`users/${user.uid}/`)) {
    return null;
  }

  const fileRef = ctx.storageSdk.ref(ctx.storage, attachmentRefLike.storagePath);
  return ctx.storageSdk.getDownloadURL(fileRef);
}

export async function resolveAttachmentURL(storagePath) {
  if (!storagePath || typeof storagePath !== 'string') return null;

  const ctx = await ensureInitialized();
  const user = requireUser();
  if (!ctx || !user) return null;

  if (!storagePath.startsWith(`users/${user.uid}/`)) {
    return null;
  }

  const fileRef = ctx.storageSdk.ref(ctx.storage, storagePath);
  return ctx.storageSdk.getDownloadURL(fileRef);
}
