# Firebase sync setup

This app now supports optional cross-device save sync using **Firebase Realtime Database REST API**.

## 1) Create a Firebase Realtime Database

1. Open Firebase Console.
2. Create/select your project.
3. Go to **Build → Realtime Database** and create a database.
4. Copy your database URL (example: `https://my-app-default-rtdb.firebaseio.com`).

## 2) Add environment variables

Create a `.env` file at the project root:

```bash
VITE_FIREBASE_DB_URL=https://YOUR_DB.firebaseio.com
VITE_FIREBASE_SYNC_NAMESPACE=my-app
```

Notes:
- `VITE_FIREBASE_DB_URL` enables sync.
- `VITE_FIREBASE_SYNC_NAMESPACE` isolates saves for your app/install. Optional; defaults to `default`.

## 3) Realtime Database rules (minimum)

Use secure rules in production with Firebase Auth.
For simple testing, you can start with something like:

```json
{
  "rules": {
    "sync": {
      ".read": true,
      ".write": true
    }
  }
}
```

## Behavior

- Save: writes locally (IndexedDB) and to Firebase.
- Load: tries Firebase first, then local fallback.
- Delete: removes local and remote save.
- Saved files list: uses Firebase when available, local fallback otherwise.

If Firebase is unavailable, the app continues working with local-only data.
