# Codex PWA

A Svelte + Vite notes/blocks app with local IndexedDB saves and optional Firebase sync.

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

Use these rules so each user can access only their own subtree:

```json
{
  "rules": {
    "sync": {
      "$ns": {
        "users": {
          "$uid": {
            ".read": "auth != null && auth.uid == $uid",
            ".write": "auth != null && auth.uid == $uid"
          }
        }
      }
    }
  }
}
```

> Do **not** use open rules like `".read": true` / `".write": true`.


### 4) Apply secure Cloud Storage rules

Use Storage rules scoped per authenticated uid:

```txt
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{uid}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

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
- `users/{uid}/attachments/{attachmentId}.{ext}` (Cloud Storage)

Where:
- `namespace` = `VITE_FIREBASE_SYNC_NAMESPACE` (default `default`)
- `uid` = authenticated Firebase `auth.uid`

## Sync behavior

- Save: writes local IndexedDB first; for signed-in users it uploads inline base64 media to Cloud Storage and writes JSON refs to RTDB.
- Load: signed-in users read remote first, resolve Storage refs to download URLs, then local fallback.
- List: signed-in users read remote index, signed-out users read local keys.
- Delete: removes local and remote when signed in.
- Conflict safety: if remote timestamp is newer than local save attempt, remote overwrite is skipped.

## Legacy remote data migration

Old anonymous/public sync paths are intentionally ignored for safety.
Inline/base64 media in existing saves are migrated on the next signed-in save (uploaded to Storage and replaced with refs in RTDB).
If you need legacy path migration, do it with an explicit one-off admin script and user consent.

## Sanity checks

1. **Account isolation**: Sign in as account A, save notes. Sign out, sign in as account B — account B should not see A's notes.
2. **Cross-device sync**: Sign in with same account on two devices, save on one device, then load/list on the other.
