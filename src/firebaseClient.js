const FIREBASE_CDN_VERSION = '11.0.2';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DB_URL
};

const FIREBASE_SYNC_NAMESPACE =
  import.meta.env.VITE_FIREBASE_SYNC_NAMESPACE || 'default';

const requiredConfigKeys = [
  'apiKey',
  'authDomain',
  'projectId',
  'appId',
  'databaseURL'
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
    )
  ]).then(([appSdk, authSdk, dbSdk]) => ({ appSdk, authSdk, dbSdk }));

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

  const { appSdk, authSdk, dbSdk } = await loadFirebaseSdk();

  const app = appSdk.initializeApp(firebaseConfig);
  const auth = authSdk.getAuth(app);
  const db = dbSdk.getDatabase(app);
  const provider = new authSdk.GoogleAuthProvider();

  initialized = {
    app,
    auth,
    db,
    provider,
    authSdk,
    dbSdk
  };

  return initialized;
}

function userRoot(uid) {
  return `sync/${FIREBASE_SYNC_NAMESPACE}/users/${uid}`;
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
