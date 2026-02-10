import { firebaseConfig, firebaseSyncNamespace } from '../firebase.ts';

export { firebaseConfig, firebaseSyncNamespace };

const FIREBASE_CDN_VERSION = '11.0.2';

let firebaseModulesPromise;
let firebaseContext;
let authUser = null;

function hasConfigValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeFileKey(fileId) {
  return encodeURIComponent(String(fileId || '').trim());
}

function userRootPath(uid) {
  return `sync/${firebaseSyncNamespace}/users/${uid}`;
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

async function writeUserIdentity(user) {
  const ctx = await ensureFirebase();
  if (!ctx || !user?.uid) return;

  const now = Date.now();
  const userPath = `${userRootPath(user.uid)}`;

  await ctx.update(ctx.ref(ctx.db, userPath), {
    email: user.email || null,
    displayName: user.displayName || null,
    photoURL: user.photoURL || null,
    lastLoginAt: now
  });
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

  try {
    const result = await ctx.signInWithPopup(ctx.auth, provider);
    authUser = result?.user || null;
  } catch (error) {
    if (error?.code === 'auth/popup-blocked' || error?.code === 'auth/cancelled-popup-request') {
      await ctx.signInWithRedirect(ctx.auth, provider);
      return null;
    }
    throw error;
  }

  if (authUser) {
    await writeUserIdentity(authUser);
  }

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
  const key = normalizeFileKey(fileId);
  if (!ctx || !uid || !key) return null;

  const snapshot = await ctx.get(ctx.ref(ctx.db, `${userRootPath(uid)}/files/${key}`));
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
  const key = normalizeFileKey(fileId);
  if (!ctx || !uid || !key) return null;

  const now = Date.now();
  const userPath = userRootPath(uid);

  await ctx.update(ctx.ref(ctx.db, userPath), {
    lastSyncedAt: now
  });

  await ctx.set(ctx.ref(ctx.db, `${userPath}/files/${key}`), {
    ...payload,
    fileId,
    syncedAt: now
  });

  await ctx.set(ctx.ref(ctx.db, `${userPath}/index/${key}`), {
    fileId,
    key,
    updatedAt: now,
    title: fileId
  });

  return { fileId, key, updatedAt: now };
}

export async function deleteRemoteFile(uid, fileId) {
  const ctx = await ensureFirebase();
  const key = normalizeFileKey(fileId);
  if (!ctx || !uid || !key) return null;

  await Promise.all([
    ctx.remove(ctx.ref(ctx.db, `${userRootPath(uid)}/files/${key}`)),
    ctx.remove(ctx.ref(ctx.db, `${userRootPath(uid)}/index/${key}`))
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
