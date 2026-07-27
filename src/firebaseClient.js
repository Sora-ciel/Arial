import { Capacitor } from '@capacitor/core';
import { firebaseConfig, firebaseSyncNamespace, googleWebClientId } from '../firebase.ts';

export { firebaseConfig, firebaseSyncNamespace };

let socialLoginPlugin = null;
let socialLoginInitPromise;

function loadSocialLogin() {
  return import('@capgo/capacitor-social-login');
}

async function ensureNativeGoogleAuthInitialized() {
  // Capacitor plugin proxies expose a callable property for any method name
  // accessed on them, including "then" - so a plugin object must never be
  // returned as a Promise resolution value. JS's Promise "thenable
  // assimilation" would call `plugin.then(...)` to try to unwrap it, which
  // hits the native bridge as a bogus "then" method call and throws
  // "X.then() is not implemented on android". Keep the plugin instance in a
  // plain module-level variable instead, and only ever resolve this promise
  // to a primitive.
  if (!socialLoginInitPromise) {
    socialLoginInitPromise = loadSocialLogin().then(async (mod) => {
      socialLoginPlugin = mod.SocialLogin;
      await socialLoginPlugin.initialize({ google: { webClientId: googleWebClientId } });
      return true;
    });
  }
  await socialLoginInitPromise;
}

async function signInWithGoogleNative(ctx) {
  if (!googleWebClientId) {
    throw new Error('Google sign-in is not configured for this app (missing web client ID).');
  }

  await ensureNativeGoogleAuthInitialized();
  // The plugin already requests email/profile/openid scopes by default.
  // Passing custom `scopes` here triggers a native check that requires
  // modifying MainActivity to implement ModifiedMainActivityForSocialLoginPlugin,
  // which isn't needed since the defaults already cover what we use.
  const { result } = await socialLoginPlugin.login({
    provider: 'google'
  });

  const idToken = result?.idToken;
  if (!idToken) throw new Error('Google sign-in did not return an ID token.');

  const credential = ctx.authApi.GoogleAuthProvider.credential(idToken);
  const signInResult = await ctx.authApi.signInWithCredential(ctx.auth, credential);
  return signInResult.user;
}

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

  if (Capacitor.isNativePlatform()) {
    return signInWithGoogleNative(ctx);
  }

  const provider = new ctx.authApi.GoogleAuthProvider();
  const result = await ctx.authApi.signInWithPopup(ctx.auth, provider);
  return result.user;
}

export async function signOutUser() {
  const ctx = await getFirebaseContext();
  if (!ctx) return;

  if (Capacitor.isNativePlatform() && socialLoginInitPromise) {
    await socialLoginInitPromise;
    await socialLoginPlugin?.logout({ provider: 'google' }).catch(() => {});
  }

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

export async function saveRemoteFile(fileId, payload, options = {}) {
  if (!isFirebaseConfigured()) return null;
  const ctx = await getFirebaseContext();
  const user = requireUser(ctx.auth.currentUser);
  const shouldUploadAttachments = options.uploadAttachments !== false;
  const payloadWithRemoteAttachments = shouldUploadAttachments
    ? await uploadBlockAttachments(fileId, payload, ctx, user.uid)
    : payload;
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
