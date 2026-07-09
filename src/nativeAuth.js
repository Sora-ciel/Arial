// Native Google sign-in for packaged builds.
//
// `signInWithPopup` (used by the browser build) cannot work inside the Tauri
// or Capacitor WebView, so each packaged platform acquires a Google OAuth
// credential through a native flow and hands the resulting tokens back to the
// Firebase JS SDK via `signInWithCredential`.
//
//   - Capacitor (Android): the @capacitor-firebase/authentication plugin runs
//     the native Google Sign-In SDK and returns an ID token.
//   - Tauri (desktop): a system-browser authorization-code + PKCE flow with a
//     loopback redirect captured by tauri-plugin-oauth.
//
// Both require OAuth client IDs configured in firebase.ts (`googleOAuth`).

import { googleOAuth } from '../firebase.ts';

export async function getNativeGoogleCredential(platform) {
  if (platform === 'capacitor') return capacitorGoogleCredential();
  if (platform === 'tauri') return tauriGoogleCredential();
  throw new Error(`Native Google sign-in is not supported on platform "${platform}".`);
}

// ---- Capacitor (Android) -------------------------------------------------

async function capacitorGoogleCredential() {
  if (!googleOAuth?.webClientId) {
    throw new Error(
      'Missing googleOAuth.webClientId in firebase.ts — required for Android Google sign-in.'
    );
  }

  // `skipNativeAuth: true` must be set in capacitor.config.json so the plugin
  // returns the credential to JS instead of signing into the native layer only.
  const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
  const result = await FirebaseAuthentication.signInWithGoogle();

  const idToken = result?.credential?.idToken;
  const accessToken = result?.credential?.accessToken;
  if (!idToken) {
    throw new Error('Native Google sign-in did not return an ID token.');
  }
  return { idToken, accessToken: accessToken || null };
}

// ---- Tauri (desktop) -----------------------------------------------------

async function tauriGoogleCredential() {
  const desktop = googleOAuth?.desktop;
  if (!desktop?.clientId || !desktop?.clientSecret) {
    throw new Error(
      'Missing googleOAuth.desktop.clientId/clientSecret in firebase.ts — required for desktop Google sign-in.'
    );
  }

  const { start, onUrl, cancel } = await import('@fabianlars/tauri-plugin-oauth');
  const { openUrl } = await import('@tauri-apps/plugin-opener');

  const verifier = randomUrlSafeString(64);
  const challenge = await sha256Base64Url(verifier);
  const state = randomUrlSafeString(24);

  // Spin up the loopback server first so we know which port to redirect to.
  const port = await start();
  const redirectUri = `http://127.0.0.1:${port}`;

  let unlisten = () => {};
  const codePromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Google sign-in timed out.')), 5 * 60 * 1000);
    onUrl((url) => {
      clearTimeout(timer);
      try {
        const parsed = new URL(url);
        const error = parsed.searchParams.get('error');
        if (error) throw new Error(`Google returned an error: ${error}`);
        if (parsed.searchParams.get('state') !== state) {
          throw new Error('OAuth state mismatch — aborting for safety.');
        }
        const code = parsed.searchParams.get('code');
        if (!code) throw new Error('No authorization code returned by Google.');
        resolve(code);
      } catch (err) {
        reject(err);
      }
    }).then((fn) => { unlisten = fn; });
  });

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', desktop.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('prompt', 'select_account');

  await openUrl(authUrl.toString());

  let code;
  try {
    code = await codePromise;
  } finally {
    unlisten();
    await cancel(port).catch(() => {});
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: desktop.clientId,
      client_secret: desktop.clientSecret,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    })
  });

  if (!tokenResponse.ok) {
    const detail = await tokenResponse.text().catch(() => '');
    throw new Error(`Google token exchange failed (${tokenResponse.status}). ${detail}`);
  }

  const tokens = await tokenResponse.json();
  if (!tokens.id_token) {
    throw new Error('Google token response did not include an ID token.');
  }
  return { idToken: tokens.id_token, accessToken: tokens.access_token || null };
}

// ---- PKCE helpers --------------------------------------------------------

function randomUrlSafeString(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function sha256Base64Url(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
