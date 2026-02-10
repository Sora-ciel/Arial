# Firebase sync setup (secure, account-based)

This app supports optional cross-device sync using Firebase Auth (Google) + Realtime Database.

## Required environment variables

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_DB_URL=https://YOUR_DB.firebaseio.com
VITE_FIREBASE_SYNC_NAMESPACE=default
```

## Required Firebase setup

1. Enable Google provider in Firebase Authentication.
2. Add authorized domains in Firebase Auth settings.
3. Create Firebase Realtime Database.
4. Apply secure rules:

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

Do not use open/public read or write rules.

## Data paths

- `/sync/{namespace}/users/{uid}/files/{fileId}`
- `/sync/{namespace}/users/{uid}/index/{fileId}`

Users only access their own `{uid}` subtree.

## Legacy note

Legacy anonymous/public sync paths are intentionally not read by this app.
