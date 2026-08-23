# Codex PWA

A Svelte + Vite notes/blocks app with local IndexedDB saves and optional Firebase sync.

## Download

Latest release: **v0.8.40**

- 🌐 Web: <https://arial-473c1.web.app> — nothing to install
- 📱 Android: [Arial_0.8.40.apk](https://github.com/Sora-ciel/Arial/releases/download/v0.8.40/Arial_0.8.40.apk)
- 💻 Windows: [installer (.exe)](https://github.com/Sora-ciel/Arial/releases/download/v0.8.40/Arial_0.8.40_x64-setup.exe) or [.msi](https://github.com/Sora-ciel/Arial/releases/download/v0.8.40/Arial_0.8.40_x64_en-US.msi)

[![All releases](https://img.shields.io/badge/Download-Latest-blue)](https://github.com/Sora-ciel/Arial/releases/latest)

The Android build is unlisted, so Android will warn about installing outside
the Play Store. Music plays with the screen off, which needs the notification
permission it asks for on first play — denying it stops playback when the
phone sleeps.

## Local development

```bash
npm install
npm run dev
```

## Optional secure Firebase sync (Google account)

Sync is **optional**. If Firebase env vars are missing or user is signed out, the app stays local-only.

### 1) Create Firebase project

1. Create/select a Firebase project.
2. Enable **Authentication → Sign-in method → Google**.
3. Add your dev/prod domains to **Authentication → Settings → Authorized domains**.
4. Create a **Realtime Database**.

### 2) Configure environment

Create `.env` in project root:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_DB_URL=https://YOUR_DB.firebaseio.com
VITE_FIREBASE_STORAGE_BUCKET=YOUR_PROJECT_ID.appspot.com
VITE_FIREBASE_SYNC_NAMESPACE=default
```

### 3) Apply secure RTDB rules

The rules that ship with the project are in [`database.rules.json`](database.rules.json);
deploy them with `firebase deploy --only database` rather than copying a
snippet, so what runs is what's in version control.

They do two things beyond scoping access to `auth.uid`:

- **Write is granted on `files` and `index` only**, not on the whole user
  node. Granting it at the user level lets a signed-in account put arbitrary
  data anywhere beneath it and use the database as free storage.
- A file must carry a numeric `updatedAt`, and an index entry a `fileId`
  matching its key. Validation is skipped on delete, so removal still works.

> Do **not** use open rules like `".read": true` / `".write": true`.


### 4) Apply secure Cloud Storage rules

The rules are in [`storage.rules`](storage.rules) and are referenced from
`firebase.json`, so `firebase deploy --only storage` applies them.

Keep them in the repo rather than editing in the console: with no rules file,
whatever the console happens to hold is the only thing separating one
account's attachments from another's, and Firebase's default for Storage
allows any signed-in user to read and write the entire bucket.

Note that `create, update` and `delete` are granted separately. Using `write`
for all three would apply the upload size check to deletes as well, where
`request.resource` is null.

> Files already handed out as download URLs stay reachable through those URLs:
> a Firebase download token grants access on its own and is not subject to
> these rules.

### 5) Billing note (important)

Cloud Storage requires a **Blaze (pay-as-you-go)** plan in many Firebase projects/environments.
To keep costs predictable:
- set a monthly budget in Google Cloud Billing
- create budget alerts (50% / 90% / 100%)
- monitor Firebase Storage usage regularly

## Remote data model

All synced data is written under:

- `/sync/{namespace}/users/{uid}/files/{fileId}`
- `/sync/{namespace}/users/{uid}/index/{fileId}`
- `users/{uid}/attachments/{fileId}/{blockId}/{field}/{object}` (Cloud Storage)

Where:
- `namespace` = `VITE_FIREBASE_SYNC_NAMESPACE` (default `default`)
- `uid` = authenticated Firebase `auth.uid`

## Sync behavior

- Save: writes local IndexedDB first; for signed-in users it uploads inline base64 media to Cloud Storage and writes JSON refs to RTDB.
- Load: signed-in users read remote first, resolve Storage refs to runtime download URLs (`getDownloadURL`), then local fallback.
- List: signed-in users read remote index, signed-out users read local keys.
- Delete: removes local and remote when signed in.
- Conflict safety: if remote timestamp is newer than local save attempt, remote overwrite is skipped.

## Legacy remote data migration

Old anonymous/public sync paths are intentionally ignored for safety.
Inline/base64 media in existing saves are migrated on the next signed-in save (uploaded to Storage and replaced with refs in RTDB).
Resolved download URLs are runtime-only and are not written back to RTDB.
If you need legacy path migration, do it with an explicit one-off admin script and user consent.

## Sanity checks

1. **Account isolation**: Sign in as account A, save notes. Sign out, sign in as account B — account B should not see A's notes.
2. **Cross-device sync**: Sign in with same account on two devices, save on one device, then load/list on the other.
