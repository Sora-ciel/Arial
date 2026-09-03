# Ostavia monitoring dashboard

A single static page for watching sync bandwidth and retuning the alerts. The
alerting logic itself lives in [`../functions/monitoring/`](../functions/monitoring/);
this is just the window onto it.

Double-click **`dashboard.bat`**.

It serves this folder on `http://localhost:5055` and opens the page. It has to
be `http://localhost` rather than opening the file directly — Firebase Auth
only allows sign-in from an authorised domain, `localhost` is on that list by
default and `file://` is not, so Google sign-in silently refuses to complete
from a double-clicked file.

Nothing is built or deployed. The page reads straight from the Firebase
project, so it shows live data.

## First run: make yourself an admin

Everything under `usage/`, `alerts/` and `monitoring/` is denied to normal
users by the security rules. The page will sign you in, notice you are not on
the admin list, show you your user ID and offer a **Copy** button.

In the Firebase console → Realtime Database, create:

```
admins/<your-uid>: true
```

(boolean `true`, not the string). Then press **I have added it — check again**.

This is a one-time bootstrap and deliberately manual: an admin list that could
be edited from the app would not be much of an admin list.

## What you get

- **Alerting** — whether alerts are on, whether the last mail actually
  delivered or failed and why, and a **Send test mail** button that proves the
  SMTP secret works without waiting for real traffic.
- **Today** — every user's sync writes with a bar against the daily limit.
- **Last 14 days** — project-wide daily totals.
- **Alerts sent** — the log of every threshold that has fired.
- **Settings** — recipient, the percentage steps, the project-wide threshold,
  digest size, quiet-day digests, and a master on/off. Saved to the database
  and picked up by the next alert check, **no redeploy**.

The page is responsive and has a dark mode, so it is usable from a phone once
you host it somewhere.

## What it deliberately cannot do

**Set the SMTP password.** That lives in Google Secret Manager as
`ARIAL_SMTP_PASS`; a browser page has no business reading or writing it, and
the rules give it no way to. Set or rotate it in the Secret Manager console
(there is a button on the page), then `firebase deploy --only functions` and
use **Send test mail** to confirm.

**Change the per-user daily limit.** That is enforced by
`database.rules.json` and the quota guard, neither of which can read a runtime
override — a dashboard control for it would only produce a number that
disagrees with what actually happens. It lives in
[`../functions/limits.js`](../functions/limits.js) and the page shows it
read-only.

**Read anyone's notes.** The rules grant admins `usage/`, `alerts/` and
`monitoring/` only. `sync/` access is unchanged: still each user's own data and
nothing else.

## Deploying the pieces this needs

```bash
firebase deploy --only database,functions
```

`database` ships the rules that let an admin read the monitoring data, and
`functions` ships the alert watchers plus the `sendMonitoringTestMail`
callable the test button uses.
