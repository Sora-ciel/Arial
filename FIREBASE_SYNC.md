# Firebase sync setup (secure, account-based)

This app supports optional cross-device sync using Firebase Auth (Google), Realtime Database (scene JSON), and Cloud Storage (attachments).

## Required environment variables

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_DB_URL=https://YOUR_DB.firebaseio.com
VITE_FIREBASE_STORAGE_BUCKET=YOUR_PROJECT_ID.appspot.com
VITE_FIREBASE_SYNC_NAMESPACE=default
```

## Required Firebase setup

1. Enable Google provider in Firebase Authentication.
2. Add authorized domains in Firebase Auth settings.
3. Create Firebase Realtime Database.
4. Create/enable Firebase Cloud Storage.
5. Apply secure Realtime Database rules:

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

6. Apply secure Cloud Storage rules:

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

Do not use open/public read or write rules.


## Per-user structure in RTDB

After Google authentication, data is written under each authenticated user UID so users are isolated:

```json
{
  "sync": {
    "default": {
      "users": {
        "UID_OF_USER_1": {
          "email": "user1@example.com",
          "files": {
            "default": { "blocks": [], "modeOrders": {}, "syncedAt": 1730000000000 }
          },
          "index": {
            "default": { "fileId": "default", "updatedAt": 1730000000000 }
          }
        },
        "UID_OF_USER_2": {
          "email": "user2@example.com",
          "files": {
            "work-notes": { "blocks": [], "modeOrders": {}, "syncedAt": 1730000000000 }
          }
        }
      }
    }
  }
}
```

This matches the idea of `users/{uid}/...` per account so RTDB sync is only for the signed-in user.

## Data paths

- RTDB: `/sync/{namespace}/users/{uid}/files/{fileKey}`
- RTDB: `/sync/{namespace}/users/{uid}/index/{fileKey}`
- Storage: `users/{uid}/attachments/{attachmentId}.{ext}`

`fileKey` is a URL-encoded key derived from the original local file name, while metadata keeps the original `fileId` text.

Users only access their own `{uid}` subtree.

## Attachment behavior

- On save, inline base64 media is uploaded to Cloud Storage.
- The JSON written to RTDB stores a lightweight reference only:
  `{ type: "storage", attachmentId, storagePath, contentType, size }`
- `downloadURL` is never persisted to RTDB.
- On load, storage refs are resolved at runtime via `getDownloadURL` before rendering.
- Existing inline/base64 media gets migrated during the next signed-in save.

## Billing note

Cloud Storage typically requires Blaze billing in Firebase projects/environments.
Set a budget and alerts in Google Cloud Billing to control spend.

## Legacy note

Legacy anonymous/public sync paths are intentionally not read by this app.
