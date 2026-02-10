# Firebase settings you should configure

Use this checklist to make Google login + manual RTDB sync work.

## 1) Authentication
1. Go to **Firebase Console → Authentication → Sign-in method**.
2. Enable **Google** provider.
3. Go to **Authentication → Settings → Authorized domains**.
4. Add your local/dev/prod domains (for Vite dev usually `localhost`).

## 2) Realtime Database
1. Create a **Realtime Database** in your Firebase project.
2. Set rules so each user can read/write only their own data:

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

## 3) App config file
Update `firebase.ts` with your Firebase Web App values:
- `apiKey`
- `authDomain`
- `projectId`
- `appId`
- `databaseURL`
- `firebaseSyncNamespace` (usually `default`)

## 4) How sync works in this app
- Click **Sign in Google**.
- Click **Sync to Cloud**.
- The app uploads every save from IndexedDB to:
  - `sync/{namespace}/users/{uid}/files/{fileName}`
  - `sync/{namespace}/users/{uid}/index/{fileName}`

If remote data is newer than local, that file is skipped to avoid accidental overwrite.
