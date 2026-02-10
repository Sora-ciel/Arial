const FIREBASE_CDN_VERSION = '11.0.2';

import { firebaseConfig, firebaseSyncNamespace } from '../firebase.ts';
import { syncDebugLog } from './syncDebug.js';

const FIREBASE_SYNC_NAMESPACE = firebaseSyncNamespace || 'default';

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

  syncDebugLog.logInfo('firebase.sdk', 'Loading Firebase SDK modules from CDN...');

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

  sdkPromise.then(
    () => syncDebugLog.logSuccess('firebase.sdk', 'Firebase SDK modules loaded.'),
    error =>
      syncDebugLog.logError(
        'firebase.sdk',
        error?.message || 'Failed to load Firebase SDK modules.'
      )
  );

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

  syncDebugLog.logInfo('firebase.init', 'Initializing Firebase app context...');

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

  syncDebugLog.logSuccess('firebase.init', 'Firebase app context initialized.');

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
    syncDebugLog.logInfo(
      'auth.state',
      user ? `Authenticated as ${user.email || user.uid}.` : 'No authenticated user.'
    );
    callback(user);
  });
}

export async function signInWithGoogle() {
  syncDebugLog.logInfo('auth.signin', 'Starting Google sign-in popup...');
  const ctx = await ensureInitialized();
  if (!ctx) {
    syncDebugLog.logError('auth.signin', 'Firebase is not configured.');
    throw new Error('Firebase is not configured.');
  }
  const result = await ctx.authSdk.signInWithPopup(ctx.auth, ctx.provider);
  currentUser = result.user || ctx.auth.currentUser;
  syncDebugLog.logSuccess(
    'auth.signin',
    `Signed in as ${currentUser?.email || currentUser?.uid || 'unknown user'}.`
  );
  return currentUser;
}

export async function signOutUser() {
  syncDebugLog.logInfo('auth.signout', 'Signing out user...');
  const ctx = await ensureInitialized();
  if (!ctx) return;
  await ctx.authSdk.signOut(ctx.auth);
  currentUser = null;
  syncDebugLog.logSuccess('auth.signout', 'User signed out.');
}

function requireUser() {
  const user = getCurrentUser();
  if (!user) return null;
  return user;
}

export async function loadRemoteFile(fileId) {
  syncDebugLog.logInfo('sync.load.remoteFile', `Preparing remote file read: ${fileId}`);
  const ctx = await ensureInitialized();
  const user = requireUser();
  if (!ctx || !user) {
    syncDebugLog.logInfo('sync.load.remoteFile', 'Remote file read skipped (not initialized or user missing).');
    return null;
  }

  const fileRef = ctx.dbSdk.ref(ctx.db, `${userRoot(user.uid)}/files/${fileId}`);
  syncDebugLog.logInfo('sync.load.remoteFile', `Reading remote file ${fileId}...`);
  const snapshot = await ctx.dbSdk.get(fileRef);
  syncDebugLog.logSuccess(
    'sync.load.remoteFile',
    snapshot.exists() ? `Remote file ${fileId} found.` : `Remote file ${fileId} is empty.`
  );
  return snapshot.exists() ? snapshot.val() : null;
}

export async function loadRemoteIndex() {
  syncDebugLog.logInfo('sync.list.remoteIndex', 'Preparing remote index read...');
  const ctx = await ensureInitialized();
  const user = requireUser();
  if (!ctx || !user) {
    syncDebugLog.logInfo('sync.list.remoteIndex', 'Remote index read skipped (not initialized or user missing).');
    return null;
  }

  const indexRef = ctx.dbSdk.ref(ctx.db, `${userRoot(user.uid)}/index`);
  syncDebugLog.logInfo('sync.list.remoteIndex', 'Reading remote file index...');
  const snapshot = await ctx.dbSdk.get(indexRef);
  syncDebugLog.logSuccess('sync.list.remoteIndex', 'Remote index loaded.');
  return snapshot.exists() ? snapshot.val() : {};
}

export async function saveRemoteFile(fileId, payload, metadata) {
  syncDebugLog.logInfo('sync.save.remoteFile', `Preparing remote write for ${fileId}...`);
  const ctx = await ensureInitialized();
  const user = requireUser();
  if (!ctx || !user) {
    syncDebugLog.logError('sync.save.remoteFile', 'Remote write aborted (not initialized or user missing).');
    return false;
  }

  const basePath = `${userRoot(user.uid)}`;
  const fileRef = ctx.dbSdk.ref(ctx.db, `${basePath}/files/${fileId}`);
  const indexRef = ctx.dbSdk.ref(ctx.db, `${basePath}/index/${fileId}`);

  syncDebugLog.logInfo('sync.save.remoteFile', `Writing remote file ${fileId}...`);
  await ctx.dbSdk.set(fileRef, {
    ...payload,
    clientUpdatedAt: Number(metadata?.clientUpdatedAt || Date.now()),
    updatedAt: ctx.dbSdk.serverTimestamp()
  });

  await ctx.dbSdk.update(indexRef, {
    ...metadata,
    updatedAt: ctx.dbSdk.serverTimestamp()
  });

  syncDebugLog.logSuccess('sync.save.remoteFile', `Remote file ${fileId} saved.`);

  return true;
}

export async function deleteRemoteFile(fileId) {
  syncDebugLog.logInfo('sync.delete.remoteFile', `Preparing remote delete for ${fileId}...`);
  const ctx = await ensureInitialized();
  const user = requireUser();
  if (!ctx || !user) {
    syncDebugLog.logError('sync.delete.remoteFile', 'Remote delete aborted (not initialized or user missing).');
    return false;
  }

  const basePath = `${userRoot(user.uid)}`;
  const fileRef = ctx.dbSdk.ref(ctx.db, `${basePath}/files/${fileId}`);
  const indexRef = ctx.dbSdk.ref(ctx.db, `${basePath}/index/${fileId}`);

  syncDebugLog.logInfo('sync.delete.remoteFile', `Deleting remote file ${fileId}...`);
  await Promise.all([ctx.dbSdk.remove(fileRef), ctx.dbSdk.remove(indexRef)]);
  syncDebugLog.logSuccess('sync.delete.remoteFile', `Remote file ${fileId} deleted.`);
  return true;
}

export async function uploadAttachmentFromDataUrl(attachmentId, dataUrl) {
  const ctx = await ensureInitialized();
  const user = requireUser();
  if (!ctx || !user) {
    syncDebugLog.logError('sync.upload.attachment', 'Attachment upload skipped (not initialized or user missing).');
    return null;
  }

  syncDebugLog.logInfo('sync.upload.attachment', `Uploading attachment ${attachmentId}...`);
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

  syncDebugLog.logSuccess('sync.upload.attachment', `Attachment ${attachmentId} uploaded.`);

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
  if (!ctx || !user) {
    syncDebugLog.logInfo('sync.resolve.attachment', 'Resolve skipped (not initialized or user missing).');
    return null;
  }

  if (!storagePath.startsWith(`users/${user.uid}/`)) {
    return null;
  }

  const fileRef = ctx.storageSdk.ref(ctx.storage, storagePath);
  syncDebugLog.logInfo('sync.resolve.attachment', `Resolving attachment URL: ${storagePath}`);
  return ctx.storageSdk.getDownloadURL(fileRef);
}
