# Austavia

A Svelte + Vite notes/blocks app with local IndexedDB saves and optional Firebase sync.

## Tests

```bash
npm test
```

Node's own test runner, no dependencies, about a second and a half. `npm run
build` runs it first and refuses to build if anything fails, so a broken rule
cannot reach a release.

Every case in the suite is a bug that once reached a release: folder names the
database cannot hold, pictures pasted into text going into the database as
base64, two open instances handing a folder back and forth, and undo stepping
back by the wrong amount. See [test/README.md](test/README.md) for what is
covered, what is not, and how to add to it.

Security rules get their own suite, because they are enforced by the database
rather than by any code Node can import:

```bash
npm run test:rules
```

That one starts the database emulator, runs [`test-rules/`](test-rules/)
against the real `database.rules.json`, and shuts the emulator down. It needs
Java; it does not need credentials or a network, and it never touches the live
project. Deploy rules with `npm run deploy:rules` rather than
`firebase deploy --only database` and the suite runs first, so a broken rule
cannot reach the live database.

## Projects

Two, aliased in [`.firebaserc`](.firebaserc):

| alias | project | what it is |
| --- | --- | --- |
| `default` | `arial-473c1` | production — real users, real notes |
| `staging` | `arial-staging` | throwaway, for anything that must not be tried on live data |

Every CLI command takes `--project staging`. `npm run deploy:rules` targets
production and `npm run deploy:rules:staging` targets staging; both run the
rules suite first.

Staging exists for the things the emulator cannot cover: a payment webhook
arriving from a real provider, an entitlement being granted and then revoked,
and the downgrade path, which has to be tried on an account that can be
destroyed. Rules and quota logic should still be tested in the emulator first,
because it is faster and needs no network.

## Local emulator

```bash
npm run emulators
```

Database, functions and storage on a throwaway `demo-arial` project, with the
emulator UI on <http://localhost:4000>. Ports are in
[`firebase.json`](firebase.json).

Both commands go through [`scripts/emulator.mjs`](scripts/emulator.mjs) rather
than calling the Firebase CLI directly, for the same reason `build_apk.bat`
exists: the emulators are Java processes, and on a machine whose user folder
has an accented name every one of them dies at startup with *Unable to
establish loopback connection*. Java opens a unix-domain socket in the temp
directory and cannot do it under the default one. The wrapper points `TEMP`
and `TMP` at `.emulator-tmp/` inside the repo, which is ASCII and short.

## Download

Latest release: **v0.9.0**

- 🌐 Web: <https://arial-473c1.web.app> — nothing to install
- 📱 Android: [Austavia_0.9.0.apk](https://github.com/Sora-ciel/Austavia/releases/download/v0.9.0/Austavia_0.9.0.apk)
- 💻 Windows: [installer (.exe)](https://github.com/Sora-ciel/Austavia/releases/download/v0.9.0/Austavia_0.9.0_x64-setup.exe) or [.msi](https://github.com/Sora-ciel/Austavia/releases/download/v0.9.0/Austavia_0.9.0_x64_en-US.msi)

[![All releases](https://img.shields.io/badge/Download-Latest-blue)](https://github.com/Sora-ciel/Austavia/releases/latest)

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

Custom themes sync too, one node each:

- `/sync/{namespace}/users/{uid}/themes/{themeId}`

Whole-theme last-writer-wins, the same model folders use: a theme is looked at
as a whole or not at all, so merging one field at a time would only let two
devices each hold half of a theme nobody designed. What may be written and
which copy wins is decided in [`src/utils/themeSync.js`](src/utils/themeSync.js);
the fields are capped individually in `database.rules.json`, because nothing
else bounds the size of that node.

The awkward case is a theme this device has and the cloud does not, because a
theme made offline and a theme deleted on another device look identical from
here. `syncedAt` separates them — set once a theme has been written to the
cloud, never synced itself, so it means exactly "this device has seen this
theme up there". Absent from the cloud *and* previously synced is a deletion;
absent and never synced is something to upload. Without it, either every
deletion gets undone by whichever device missed it, or a theme made on a plane
disappears on landing.

Server-written and readable but never writable by the client:

- `/sync/{namespace}/users/{uid}/blocked` — set when the daily bandwidth
  ceiling is crossed, swept nightly
- `/sync/{namespace}/users/{uid}/plan` — which storage tier the account is on
- `/storage/{uid}` — `{ bytes, limit, full, updatedAt }`, the running total of
  what the account is keeping in Cloud Storage

## Usage ceilings

Two, and they measure different things. Both live in
[`functions/limits.js`](functions/limits.js).

**Bandwidth** is a cost guard: how much one account may write in a UTC day.
`enforceSyncQuota` tallies it under `usage/{uid}/{date}` and sets `blocked`,
which `database.rules.json` denies writes on. `resetDailyBlocks` clears it each
night.

**Stored bytes** is the thing a plan is sold against. `enforceSyncQuota` cannot
see it: attachments live in Cloud Storage, so a 40 MB upload writes only a few
hundred bytes of ref into the database and the rest is invisible to a database
trigger. `trackStorageUpload` and `trackStorageDelete` keep a running balance
under `storage/{uid}` instead — up on upload, down on delete, never reset.

Enforcing that one needs a detour. Storage rules can query Firestore but cannot
read the Realtime Database, so the balance is unreachable from
`storage.rules`. The functions therefore stamp a `storageFull` custom claim on
the account's own token, which the rules can read. Two consequences worth
knowing:

- **It lags.** An ID token refreshes about hourly, so an account can keep
  uploading for up to that long after going over. Acceptable for a cost guard;
  the exact number is always in the database, which is written the moment an
  object lands.
- **Deleting is never blocked.** It is the only way out of a full account.

`reconcileStorageUsage` recomputes every balance from a full bucket listing,
weekly. The triggers are the fast path, but an event-driven counter is only as
right as the last event it heard: one trigger that times out, one retry that
never lands, one object written by anything other than the app, and the balance
is wrong from then on — silently, because nothing else ever recomputes it.
Drift is not cosmetic here. Too low and the ceiling never fires; too high and a
paying account is locked out of a bucket with room in it.

It is also the backfill. Every upload that predates these functions is
uncounted until it runs, so **the first run is what gives existing accounts a
balance other than zero**. It computes absolute totals rather than applying
changes, so it is safe to run at any time and safe to run twice. To run it now,
use **Force run** on its Cloud Scheduler job in the Google Cloud console.

The accounting lives in
[`functions/storageAccounting.js`](functions/storageAccounting.js) rather than
in `index.js`, so it can be imported and tested without a functions runtime;
`index.js` keeps only the trigger wiring.

## Knowing how it is used

No tracking script, no cookies, no third party. Everything below is derived
from data the sync already holds, and covers signed-in accounts only —
local-only users are invisible by design, which is the trade for not tracking
anyone.

`enforceSyncQuota` stamps `activity/{uid}` as `{ firstSeenAt, lastSeenAt }`.
It already fires on every sync write, so there is no extra trigger and nothing
on the client. "Active" therefore means *saved something*, which is the
definition worth having. The stamp is coarsened to once an hour, because a save
happens every few seconds while someone is typing and nothing downstream asks a
finer question than "was this account active today".

`rollUpStats` writes one row a day to `monitoring/stats/{date}`, plus
`monitoring/stats/latest`:

| | |
| --- | --- |
| `accounts`, `newToday` | how many exist, how many arrived |
| `activeToday`, `active7d`, `active30d` | how many come back — conversion is a fraction of these, never of signups |
| `storedBytesMedian`, `storedBytesP90` | where the free tier belongs: below the median and ordinary use hits a wall, above the p90 and nobody ever reaches it |
| `overFreeLimit` | how many accounts today's ceiling would actually convert |

The numbers are cheap to recompute; the history is not. Nothing can
reconstruct what last month looked like after the fact, which is the whole
reason this runs from before there is anything to see.

Both nodes are top-level rather than under `sync/{ns}/users/{uid}`, for the
same reason `usage/` and `storage/` are: the roll-up reads every account at
once, and a read of `sync/{ns}/users` would drag down every note every user
owns with it.

Web traffic — visitors, referrers, which download link gets clicked — is not
covered here and needs something like Plausible or Umami on the hosted app.
Worth adding the week Austavia is first pushed somewhere public; before that it
measures a flat line.

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

Copy all three into `release/` as `Austavia_<version>.*` to match the download
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

The source code is under the [PolyForm Noncommercial License
1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0) — see
[`LICENSE.txt`](LICENSE.txt).

Source-available, not open source. Read it, run it, copy it, change it, share
it — for anything that is not commercial. Personal use, study, hobby projects,
charities, schools and public research are all covered. **Using it commercially,
including inside a business, needs a separate licence**; open an issue to ask.

Releases up to and including v0.8.44 were published under MIT, and that is not
withdrawn — anyone who received those versions keeps what MIT gave them, in
those versions. These terms govern everything after.

The Mr.Lee theme artwork under `public/hato/` is **not** covered by the licence
either way. See [`ASSETS-LICENSE.md`](ASSETS-LICENSE.md) before publishing a
build anywhere public.

The libraries this app depends on keep their own licences, unaffected by this.

## Sanity checks

1. **Account isolation**: Sign in as account A, save notes. Sign out, sign in as account B — account B should not see A's notes.
2. **Cross-device sync**: Sign in with same account on two devices, save on one device, then load/list on the other.
