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

const FIREBASE_COMPAT_SCRIPTS = [
  `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app-compat.js`,
  `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth-compat.js`,
  `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-database-compat.js`
];

let firebaseScriptsPromise;
let firebaseContextPromise;


function isTauriRuntime() {
  return typeof window !== 'undefined' && (
    Boolean(window.__TAURI__) ||
    Boolean(window.__TAURI_INTERNALS__) ||
    window.location?.protocol === 'tauri:'
  );
}

function configureRealtimeTransport(firebase) {
  if (!isTauriRuntime()) return;

  // WebView network stacks can be flaky with RTDB WebSocket upgrades.
  // Force long polling in Tauri so sync/authenticated reads-writes stay stable.
  firebase?.database?.INTERNAL?.forceLongPolling?.();
}


function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-firebase-sdk="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
      } else {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error(`Failed to load Firebase script: ${src}`)), { once: true });
      }
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.firebaseSdk = src;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load Firebase script: ${src}`));
    document.head.appendChild(script);
  });
}

function loadFirebaseScripts() {
  if (!firebaseScriptsPromise) {
    firebaseScriptsPromise = FIREBASE_COMPAT_SCRIPTS.reduce(
      (chain, src) => chain.then(() => loadScript(src)),
      Promise.resolve()
    );
  }
  return firebaseScriptsPromise;
}

async function getFirebaseContext() {
  if (!isFirebaseConfigured()) return null;
  if (!firebaseContextPromise) {
    firebaseContextPromise = loadFirebaseScripts().then(() => {
      const firebase = window?.firebase;
      if (!firebase) {
        throw new Error('Firebase SDK failed to initialize.');
      }

      configureRealtimeTransport(firebase);
      const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
      const auth = firebase.auth(app);
      auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
      const db = firebase.database(app);
      return { app, auth, db };
    });
  }
  return firebaseContextPromise;
}

function normalizeNamespace() {
  return firebaseSyncNamespace || 'default';
}

function getUserPath(uid, suffix = '') {
  const ns = normalizeNamespace();
  return `sync/${ns}/users/${uid}/${suffix}`.replace(/\/$/, '');
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
  return window?.firebase?.auth?.()?.currentUser ?? null;
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
      unsub = ctx.auth.onAuthStateChanged(callback);
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

  const provider = new window.firebase.auth.GoogleAuthProvider();
  const result = await ctx.auth.signInWithPopup(provider);
  return result.user;
}

export async function signOutUser() {
  const ctx = await getFirebaseContext();
  if (!ctx) return;
  await ctx.auth.signOut();
}

export async function loadRemoteFile(fileId) {
  if (!isFirebaseConfigured()) return null;
  const ctx = await getFirebaseContext();
  const user = requireUser(ctx.auth.currentUser);

  const snapshot = await ctx.db.ref(getUserPath(user.uid, `files/${fileId}`)).get();

  return snapshot.exists() ? snapshot.val() : null;
}

export async function loadRemoteIndex() {
  if (!isFirebaseConfigured()) return {};
  const ctx = await getFirebaseContext();
  const user = requireUser(ctx.auth.currentUser);

  const snapshot = await ctx.db.ref(getUserPath(user.uid, 'index')).get();

  return snapshot.exists() ? snapshot.val() : {};
}

export async function saveRemoteFile(fileId, payload) {
  if (!isFirebaseConfigured()) return null;
  const ctx = await getFirebaseContext();
  const user = requireUser(ctx.auth.currentUser);
  const updatedAt = payload?.updatedAt || Date.now();

  await ctx.db.ref(getUserPath(user.uid, `files/${fileId}`)).set({ ...payload, updatedAt });

  await ctx.db.ref(getUserPath(user.uid, `index/${fileId}`)).set({
    fileId,
    updatedAt,
    blockCount: Array.isArray(payload?.blocks) ? payload.blocks.length : 0
  });

  return { fileId, updatedAt };
}

export async function deleteRemoteFile(fileId) {
  if (!isFirebaseConfigured()) return null;
  const ctx = await getFirebaseContext();
  const user = requireUser(ctx.auth.currentUser);

  await Promise.all([
    ctx.db.ref(getUserPath(user.uid, `files/${fileId}`)).remove(),
    ctx.db.ref(getUserPath(user.uid, `index/${fileId}`)).remove()
  ]);

  return { fileId };
}

export async function uploadAttachmentFromDataUrl() {
  return null;
}

export async function resolveAttachmentUrl(value) {
  return value || null;
}

export async function resolveAttachmentURL(value) {
  return resolveAttachmentUrl(value);
}
