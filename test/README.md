# Tests

```bash
npm test
```

No framework, no dependencies — Node's own test runner. The whole suite takes
about a second and a half. `npm run build` runs it first and stops if anything
fails, so a broken rule cannot reach a release.

## Why these tests exist

Every case in here is a bug that got as far as a release and was found by using
the app. Not one of them needed a browser, a signed-in account, or a second
device to detect — they only *looked* that way, because the rules that broke
were buried in files that cannot be loaded outside a browser.

- `App.svelte` needs a component runtime
- `firebaseClient.js` imports Capacitor and a Firebase config

So the rules that decide things were moved into plain modules that Node can
import, and the code that acts on them stayed where it was:

| Module | Decides |
| --- | --- |
| `src/utils/syncRules.js` | what may be synced, and what counts as a change |
| `src/utils/textHistory.js` | how typing is grouped into undo steps |
| `src/utils/syncLog.js` | what sync decided, and what it thought had changed |

## What is covered

**`sync-rules.test.js`**

- A folder name the database cannot hold is never sent. A blank one is not just
  rejected, it is dangerous: `files/${fileId}` with a blank id collapses to the
  node holding *every* folder, and the write replaces the lot.
- A picture pasted into written text is found, in HTML and in markdown, in
  notes and in tasks. Missing this put megabytes of base64 into a database
  field, the write failed, and the upload loop abandoned every folder queued
  behind it.
- Inline base64 anywhere in a payload is detected, as the last line of defence
  before a write.
- A cloud round trip does not look like an edit. The database stores no empty
  list, so a folder uploaded with `tasks: []` comes back without the field;
  putting it back made the copy on disk differ, the save stamped a new
  modifiedAt, and two open instances handed the folder back and forth for as
  long as both were running.

**`sync-log.test.js`**

- The difference between two folders is named exactly: the field path, both
  values, deep inside a block. This is what answers "what did it think had
  changed?" on a machine I cannot reach, so it is tested rather than trusted.
- Long values are cut down (a note can hold megabytes of base64) and the list
  stops after a few findings, so the culprit is not buried.
- The log does not grow without limit, keeps the newest, and a listener that
  throws cannot stop it recording. That last one was a real bug this test
  found: the listener called at subscription was outside the guard.

**`text-history.test.js`**

- Undo steps back about a sentence: three presses for three sentences, where it
  was once a whole paragraph in one press and later twenty-nine.
- Typing in the middle of a note groups the same as typing at the end.
- History survives the editor being rebuilt, which happens on every block move
  and every mode switch.
- Redo returns exactly what undo took away.

## Adding to it

When you add something that decides *whether* or *what* — whether to sync,
whether something changed, how to group an edit — put the decision in a plain
module and test it here. The rule of thumb: if answering "is this still
correct?" means running the app and trying it by hand, it is in the wrong file.

Two habits worth keeping:

- **Name a test after the behaviour, not the function.** A failure should say
  what broke. `three sentences take three presses, not twenty-nine` is worth
  more at 2am than `recordText returns 3`.
- **Check that a new test can fail.** Undo the fix, watch it go red, put the fix
  back. A test that has never failed is not yet evidence of anything. All four
  fixes in this suite were verified that way.

## What this does not cover

Deliberately, so nobody reads a green run as more than it is:

- Anything needing a signed-in account: the actual database write, permission
  rules, two real devices.
- Anything needing a browser: the editor, the canvas, layout, themes.
- Android and the desktop shell.

A green run means the rules are intact. It does not mean the app works.
