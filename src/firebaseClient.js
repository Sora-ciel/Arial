import { firebaseConfig, firebaseSyncNamespace } from '../firebase.ts';

export { firebaseConfig, firebaseSyncNamespace };

const FIREBASE_CDN_VERSION = '11.0.2';

let firebaseModulesPromise;
let firebaseContext;
let authUser = null;

function hasConfigValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

async function loadFirebaseModules() {
  if (!firebaseModulesPromise) {
    firebaseModulesPromise = Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_CDN_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_CDN_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_CDN_VERSION}/firebase-database.js`)
    ]);
  }

  const [appModule, authModule, dbModule] = await firebaseModulesPromise;
  return {
    ...appModule,
    ...authModule,
    ...dbModule
  };
}

async function ensureFirebase() {
  if (!isFirebaseConfigured()) return null;

  if (!firebaseContext) {
    const modules = await loadFirebaseModules();
    const app = modules.initializeApp(firebaseConfig);
    const auth = modules.getAuth(app);
    const db = modules.getDatabase(app);

    firebaseContext = {
      ...modules,
      app,
      auth,
      db
    };

    modules.onAuthStateChanged(auth, user => {
      authUser = user || null;
    });
    authUser = auth.currentUser || null;
  }

  return firebaseContext;
}

function userRootPath(uid) {
  return `sync/${firebaseSyncNamespace}/users/${uid}`;
}

export function isFirebaseConfigured() {
  return (
    !!firebaseConfig &&
    hasConfigValue(firebaseConfig.apiKey) &&
    hasConfigValue(firebaseConfig.authDomain) &&
    hasConfigValue(firebaseConfig.projectId) &&
    hasConfigValue(firebaseConfig.appId) &&
    hasConfigValue(firebaseConfig.databaseURL)
  );
}

export function getCurrentUser() {
  return authUser;
}

export async function onAuthStateChange(callback = () => {}) {
  const ctx = await ensureFirebase();
  if (!ctx) {
    callback(null);
    return () => {};
  }

  return ctx.onAuthStateChanged(ctx.auth, user => {
    authUser = user || null;
    callback(authUser);
  });
}

export async function signInWithGoogle() {
  const ctx = await ensureFirebase();
  if (!ctx) return null;

  const provider = new ctx.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await ctx.signInWithPopup(ctx.auth, provider);
  authUser = result?.user || null;
  return authUser;
}

export async function signOutUser() {
  const ctx = await ensureFirebase();
  if (!ctx) return null;
  await ctx.signOut(ctx.auth);
  authUser = null;
  return null;
}

export async function loadRemoteFile(uid, fileId) {
  const ctx = await ensureFirebase();
  if (!ctx || !uid || !fileId) return null;

  const snapshot = await ctx.get(ctx.ref(ctx.db, `${userRootPath(uid)}/files/${fileId}`));
  return snapshot.exists() ? snapshot.val() : null;
}

export async function loadRemoteIndex(uid) {
  const ctx = await ensureFirebase();
  if (!ctx || !uid) return {};

  const snapshot = await ctx.get(ctx.ref(ctx.db, `${userRootPath(uid)}/index`));
  return snapshot.exists() ? snapshot.val() || {} : {};
}

export async function saveRemoteFile(uid, fileId, payload) {
  const ctx = await ensureFirebase();
  if (!ctx || !uid || !fileId) return null;

  const now = Date.now();
  await ctx.set(ctx.ref(ctx.db, `${userRootPath(uid)}/files/${fileId}`), {
    ...payload,
    syncedAt: now
  });

  await ctx.set(ctx.ref(ctx.db, `${userRootPath(uid)}/index/${fileId}`), {
    fileId,
    updatedAt: now,
    title: fileId
  });

  return { fileId, updatedAt: now };
}

export async function deleteRemoteFile(uid, fileId) {
  const ctx = await ensureFirebase();
  if (!ctx || !uid || !fileId) return null;

  await Promise.all([
    ctx.remove(ctx.ref(ctx.db, `${userRootPath(uid)}/files/${fileId}`)),
    ctx.remove(ctx.ref(ctx.db, `${userRootPath(uid)}/index/${fileId}`))
  ]);

  return true;
}

export async function uploadAttachmentFromDataUrl() {
  return null;
}

export async function resolveAttachmentUrl() {
  return null;
}

export async function resolveAttachmentURL() {
  return null;
}
