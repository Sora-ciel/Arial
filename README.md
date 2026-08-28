# Codex PWA

A Svelte + Vite notes/blocks app with local IndexedDB saves and optional Firebase sync.

## Download

Latest release: **v0.8.42**

- 🌐 Web: <https://arial-473c1.web.app> — nothing to install
- 📱 Android: [Arial_0.8.42.apk](https://github.com/Sora-ciel/Arial/releases/download/v0.8.42/Arial_0.8.42.apk)
- 💻 Windows: [installer (.exe)](https://github.com/Sora-ciel/Arial/releases/download/v0.8.42/Arial_0.8.42_x64-setup.exe) or [.msi](https://github.com/Sora-ciel/Arial/releases/download/v0.8.42/Arial_0.8.42_x64_en-US.msi)

[![All releases](https://img.shields.io/badge/Download-Latest-blue)](https://github.com/Sora-ciel/Arial/releases/latest)

The Android build is unlisted, so Android will warn about installing outside
the Play Store. Music plays with the screen off, which needs the notification
permission it asks for on first play — denying it stops playback when the
phone sleeps.

## Themes

Style presets live under **Settings → Style presets**. Alongside the built-in
set the app currently ships **Mr.Lee Dusk** and **Mr.Lee Day**, a guest theme
that also supplies a Single Note mode background and swaps a few toolbar icons
for characters from its artwork. It is temporary — see
[`HATO_THEME.md`](HATO_THEME.md) for what it touches and how to remove it, and
[`ASSETS-LICENSE.md`](ASSETS-LICENSE.md) for the terms on its artwork.

Matching Brave/Chrome browser themes are in
[`../Hato skins/brave`](../Hato%20skins/brave).

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

## Releasing

Bump the patch version **before** building, never after — the artifacts are
named by version, and rebuilding under one already published leaves two
different binaries claiming to be the same release. Three places have to
agree, plus the links at the top of this file:

| file | field |
| --- | --- |
| `src-tauri/tauri.conf.json` | `version` |
| `android/app/build.gradle` | `versionName`, and `versionCode` +1 |
| `README.md` | the version and the download links under **Download** |

Then:

```bash
npm run build          # web -> dist/, deployed with deploy-firebase.bat
build_tauri.bat        # windows -> .msi + .exe
build_apk.bat          # android -> signed .apk
```

Copy all three into `release/` as `Arial_<version>.*` to match the download
links. The browser themes version separately, from `THEME_VERSION` in
`../Hato skins/tools/build_hato_assets.py`.

Two things this machine needs, both handled inside `build_apk.bat` — worth
knowing if you ever run gradle by hand:

- **`TEMP` must point somewhere ASCII.** Gradle opens a unix-domain socket in
  the temp directory, and it cannot do that under the default one, because
  the real path runs through a Windows user folder with an accented name.
  Without this every gradle command fails at once with *Unable to establish
  loopback connection*. Setting `java.io.tmpdir` does not help; the socket
  path follows `TEMP`/`TMP`.
- **`JAVA_HOME` must be a JDK 21.** The project compiles against 21; Android
  Studio uses its own bundled runtime, but a shell build follows `JAVA_HOME`,
  which is a 17 install here and fails with *invalid source release: 21*.

## Licence

The source code is MIT — see [`LICENSE.txt`](LICENSE.txt).

The Mr.Lee theme artwork under `public/hato/` is **not** covered by it. See
[`ASSETS-LICENSE.md`](ASSETS-LICENSE.md) before publishing a build anywhere
public.

## Sanity checks

1. **Account isolation**: Sign in as account A, save notes. Sign out, sign in as account B — account B should not see A's notes.
2. **Cross-device sync**: Sign in with same account on two devices, save on one device, then load/list on the other.
