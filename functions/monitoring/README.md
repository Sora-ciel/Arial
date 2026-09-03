# Ostava bandwidth monitoring

Mails `toyane.tb@gmail.com` when sync traffic gets heavy — per user as it
happens, project-wide hourly, and a summary at the end of each day.

Self-contained: its own config, its own mailer, its own thresholds. It reads
the `usage/{uid}/{date}` counter the quota guard in [`../index.js`](../index.js)
already maintains, and writes only under `alerts/`. Removing the three
`exports.bandwidth*` lines from `../index.js` disables every alert without
touching enforcement.

## Setup (once)

There is a GUI for the day-to-day side of this: [`../../monitoring/`](../../monitoring/)
serves a dashboard that shows live usage, whether the last alert mail actually
delivered, and lets you retune every threshold without a redeploy. Start there.
The steps below are the parts a browser page cannot do for you.

1. **App password.** 2-Step Verification must be on for the Google account,
   then Google Account → Security → App passwords → name it `arial`. Your
   normal account password will not work over SMTP. Use a *different* app
   password from Prosnatcher's so either can be revoked alone.
2. **Store it as a secret** (never in source, never in the repo):

   ```bash
   firebase functions:secrets:set ARIAL_SMTP_PASS
   ```

3. **Deploy** — rules as well as functions, since the dashboard needs the rules
   that grant an admin read access:

   ```bash
   firebase deploy --only database,functions
   ```

   Grant the secret-accessor prompt if the CLI asks. Blaze is required —
   outbound SMTP is a network call, and these are already-deployed v2
   functions, so that is already the case here.

## What mails, and when

| Function | Trigger | Fires |
| --- | --- | --- |
| `bandwidthWatch` | write to `usage/{uid}/{date}` | A user crosses 50%, 80% or 100% of `DAILY_BYTE_LIMIT`. Once per step per user per day. |
| `projectBandwidthWatch` | hourly | All users combined pass `PROJECT_DAILY_BYTE_ALERT` (1 GB/day). Once per day. |
| `bandwidthDigest` | daily 23:55 UTC | Day's total, active users, heaviest consumers, anyone still blocked. Silent on days with no writes unless `DIGEST_ON_QUIET_DAYS` is on. |

100% is the point where `database.rules.json` starts refusing writes, so the
50/80 steps are the ones that give you actual warning. A single large write
that jumps straight past several steps sends one mail, not three.

Dedupe is a transaction on `alerts/{uid}/{date}/bandwidth/{step}`, so two
invocations racing on the same crossing can only mail once (verified against a
stubbed database). `database.rules.json` gives `alerts/`, `usage/` and
`monitoring/` read access to admins only, and grants no client write access at
all except to `monitoring/config`; the Admin SDK these functions use bypasses
rules entirely.

## Tuning

Live settings are stored at `monitoring/config` in the database and edited from
the dashboard — recipient, alert steps, the project threshold, digest size, and
a master on/off. [`config.js`](config.js) holds the defaults used when nothing
is stored, and [`settings.js`](settings.js) merges and range-checks the two; a
database hiccup falls back to the defaults rather than taking alerting down.

The per-user ceiling is the exception and stays in [`../limits.js`](../limits.js).
It is enforced by `database.rules.json` and by the quota guard, neither of which
can read a runtime override, so a live setting for it would only produce a
number that disagrees with what actually happens.

## The part this does *not* cover

`usage/` counts **bytes written through sync**. It knows nothing about reads,
hosting, storage, or anything else you get billed egress for. If the question
is "why is the bill high" rather than "who is hammering sync", set these up in
the console once — no code, and they mail you directly:

- **Cloud Monitoring alert policy** — Google Cloud console → Monitoring →
  Alerting → Create policy, metric
  `firebasedatabase.googleapis.com/network/sent_bytes_count`, condition above
  your comfortable daily egress, notification channel = your email.
- **Billing budget** — Billing → Budgets & alerts → set a monthly cap on the
  `arial-473c1` project with alert thresholds at 50/90/100%. This is the one
  that catches a category of overrun nobody predicted.

## Cost

Four scheduled jobs total across the project now (Cloud Scheduler gives 3 free,
so roughly $0.10/month), plus 24 hourly invocations a day. `bandwidthWatch`
adds one small function run per sync-index write, capped at `maxInstances: 3`.
