# Firebase sync on packaged builds (Tauri & Capacitor)

The browser/PWA build signs in with `signInWithPopup`. That cannot work inside
the Tauri or Capacitor WebView (no popup/opener relay, and `tauri://localhost` /
`capacitor://localhost` are not authorizable Firebase domains). The packaged
builds now sign in with a **native Google flow** and hand the resulting tokens
to Firebase via `signInWithCredential` — see `src/nativeAuth.js`.

The code is wired up. To make it actually run you must add OAuth credentials and
finish the per-platform native config below.

## 1. OAuth client IDs (both platforms)

In Google Cloud Console → **APIs & Services → Credentials** for project
`arial-473c1`:

- **Web application** client → copy its **Client ID** (ends in
  `.apps.googleusercontent.com`). This is also shown in Firebase Console →
  Authentication → Sign-in method → Google → *Web SDK configuration*.
- **Desktop app** client → copy its **Client ID** and **Client secret**.

Paste all three into `firebase.ts` → `googleOAuth`:

```ts
export const googleOAuth = {
  webClientId: 'XXXX.apps.googleusercontent.com',
  desktop: { clientId: 'YYYY.apps.googleusercontent.com', clientSecret: 'ZZZZ' }
};
```

Make sure Google is enabled as a sign-in provider in the Firebase console.

## 2. Capacitor / Android

1. Add an **Android app** to the Firebase project (package `com.sora.arial`).
   Add your debug + release **SHA-1** fingerprints (Firebase → Project settings
   → your Android app → Add fingerprint).
2. Download `google-services.json` into `android/app/google-services.json`.
3. Ensure the Google services Gradle plugin is applied (the
   `@capacitor-firebase/authentication` install docs cover the
   `com.google.gms.google-services` plugin in `android/build.gradle` and
   `android/app/build.gradle`).
4. `capacitor.config.json` already sets `skipNativeAuth: true` so the plugin
   returns the credential to JS instead of only signing in natively.
5. Build the web assets and sync: `npm run build && npx cap sync android`.

## 3. Tauri / Desktop

1. `Cargo.toml` already declares `tauri-plugin-oauth` and `tauri-plugin-opener`;
   `src-tauri/src/lib.rs` registers both; `capabilities/default.json` grants
   `opener:allow-open-url` and `oauth:default`.
   - If `cargo build` rejects `oauth:default`, check the permission name shipped
     by `@fabianlars/tauri-plugin-oauth` and adjust that entry.
2. In the **Desktop app** OAuth client, no redirect URI needs registering —
   Google allows any `http://127.0.0.1:<port>` loopback for installed apps,
   which is what `tauri-plugin-oauth` listens on.
3. Build: `npm run tauri build` (first build compiles the new Rust plugins).

## How it flows at runtime

- `signInWithGoogle()` (`src/firebaseClient.js`) checks `getRuntimePlatform()`.
- `web` → popup. `capacitor` → native plugin → ID token. `tauri` → system
  browser auth-code + PKCE → loopback capture → token exchange → ID token.
- The ID token becomes a `GoogleAuthProvider.credential(...)` and
  `signInWithCredential` establishes the JS-SDK user, after which all existing
  sync code (`saveRemoteFile`, `loadRemoteFile`, attachment uploads) works
  unchanged.
