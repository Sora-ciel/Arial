// Which Firebase project the app talks to.
//
// The values below are production, and they are the default: with no env file
// present the app behaves exactly as it always has, which is what every
// existing build and every developer checkout relies on. They are not secrets
// — a Firebase web config ships inside the client bundle by design, and what
// protects an account is the security rules, not the obscurity of a project id.
//
// Anything set in an env file wins, which is how the app is pointed at
// `arial-staging` instead:
//
//   npm run dev:staging     reads .env.staging
//
// That matters for the things that cannot be tried on live data — a payment
// webhook, an entitlement being granted and then taken away, the downgrade
// path — where the account being ruined has to be one nobody minds losing.
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};

const fromEnv = (name, fallback) => {
  const value = env[name];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
};

export const firebaseConfig = {
  apiKey: fromEnv('VITE_FIREBASE_API_KEY', 'AIzaSyBRrsegKXpz_7ZcKBQXhoxpOcx4HIzZ1fE'),
  authDomain: fromEnv('VITE_FIREBASE_AUTH_DOMAIN', 'arial-473c1.firebaseapp.com'),
  projectId: fromEnv('VITE_FIREBASE_PROJECT_ID', 'arial-473c1'),
  storageBucket: fromEnv('VITE_FIREBASE_STORAGE_BUCKET', 'arial-473c1.firebasestorage.app'),
  appId: fromEnv('VITE_FIREBASE_APP_ID', '1:921907824188:web:652f54122a8d8a22742539'),
  databaseURL: fromEnv(
    'VITE_FIREBASE_DB_URL',
    'https://arial-473c1-default-rtdb.firebaseio.com'
  )
};

export const firebaseSyncNamespace = fromEnv('VITE_FIREBASE_SYNC_NAMESPACE', 'default');

// OAuth "Web client" ID for this Firebase project, used to drive native Google
// Sign-In on Android/Capacitor via @capgo/capacitor-social-login. Find it at
// Firebase Console > Authentication > Sign-in method > Google > Web SDK configuration
// (or Google Cloud Console > APIs & Services > Credentials > OAuth 2.0 Client IDs > Web client).
// Native Google sign-in on Android is disabled until this is set.
export const googleWebClientId = fromEnv(
  'VITE_GOOGLE_WEB_CLIENT_ID',
  '921907824188-kf0ui860gjep6blhpbj9dmpvs8ar0vg6.apps.googleusercontent.com'
);
