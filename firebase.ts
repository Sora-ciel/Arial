export const firebaseConfig = {
  apiKey: 'AIzaSyBRrsegKXpz_7ZcKBQXhoxpOcx4HIzZ1fE',
  authDomain: 'arial-473c1.firebaseapp.com',
  projectId: 'arial-473c1',
  storageBucket: 'arial-473c1.firebasestorage.app',
  appId: '1:921907824188:web:652f54122a8d8a22742539',
  databaseURL: 'https://arial-473c1-default-rtdb.firebaseio.com'
};

export const firebaseSyncNamespace = 'default';

// OAuth client IDs used only by the *packaged* builds (Tauri desktop and
// Capacitor Android), where `signInWithPopup` cannot work inside the native
// WebView. The browser/PWA build does not use these. Fill them in from the
// Google Cloud Console > APIs & Services > Credentials for project
// `arial-473c1`. See the sync setup notes for step-by-step instructions.
export const googleOAuth = {
  // Capacitor (Android): the "Web application" OAuth client ID. This is the
  // same client ID Firebase lists under Authentication > Sign-in method >
  // Google > "Web SDK configuration". It MUST end in `.apps.googleusercontent.com`.
  webClientId: '',

  // Tauri (desktop): a dedicated "Desktop app" OAuth client. Google requires
  // the authorization-code + PKCE flow for loopback redirects, which needs
  // both an id and a secret (the secret is not treated as confidential for
  // installed apps, but the token endpoint still requires it).
  desktop: {
    clientId: '',
    clientSecret: ''
  }
};
