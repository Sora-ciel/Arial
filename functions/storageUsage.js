// The decisions the storage accounting makes, kept apart from the code that
// acts on them so Node can import them without a Cloud Functions runtime, a
// bucket, or a network. Same split as src/utils/syncRules.js: the rules are
// testable, the side effects stay in index.js.

// Attachments are written to users/{uid}/attachments/{fileId}/{blockId}/{field}/{object}
// and nowhere else — see getStorageUserPath in src/firebaseClient.js and the
// prefix confinement in storage.rules.
//
// Storage triggers fire for the whole bucket rather than a path pattern, so
// every object that lands anywhere has to be identified from its name alone.
// Anything that is not inside a user's own prefix returns null and is not
// charged to anybody: it should not exist, since the rules deny writes outside
// users/{uid}/, but a trigger that guesses a uid from an unexpected path would
// charge the wrong account, which is worse than not counting it.
function uidFromObjectName(name) {
  if (typeof name !== 'string') return null;

  const parts = name.split('/');
  if (parts.length < 3) return null; // users/{uid} alone is a prefix, not an object
  if (parts[0] !== 'users') return null;

  const uid = parts[1];
  if (!uid) return null;

  return uid;
}

// setCustomUserClaims replaces the whole claims object rather than merging
// into it, so writing one flag with a bare object silently drops every other
// claim on the account. Today that would be harmless; the moment a paid `plan`
// claim exists it would mean a storage counter revoking somebody's
// subscription. Always build the next claims from the current ones.
function nextClaims(existingClaims, changes) {
  const next = { ...(existingClaims || {}), ...changes };

  // A false flag is the absence of the flag. Deleting it rather than storing
  // `false` keeps the token small — custom claims share a 1000-byte ceiling —
  // and keeps `request.auth.token.x != true` reading the same either way.
  for (const [key, value] of Object.entries(next)) {
    if (value === false || value === null || value === undefined) delete next[key];
  }

  return next;
}

// True when the two claim sets differ, so the caller can skip writing an
// unchanged token. Every write invalidates the user's refresh token cache and
// costs an Admin SDK round trip, and the storage triggers fire on every single
// upload.
function claimsChanged(before, after) {
  const a = before || {};
  const b = after || {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const key of keys) {
    if (a[key] !== b[key]) return true;
  }

  return false;
}

// --- Reconciliation ----------------------------------------------------
//
// The running balance is event-driven, and an event-driven counter is only
// ever as right as the last event it heard. One trigger that times out, one
// retry that never lands, one object written by something other than the app,
// and the balance is wrong from then on — silently, and for good, because
// nothing downstream ever recomputes it. These turn a full bucket listing
// into the numbers that balance should have held.

// GCS reports object sizes as strings, and lists objects for the whole bucket
// rather than per user, so both the parsing and the grouping happen here.
function tallyByUid(objects) {
  const totals = {};

  for (const object of objects || []) {
    const uid = uidFromObjectName(object && object.name);
    if (!uid) continue;

    const size = Number(object.size) || 0;
    if (size <= 0) continue;

    totals[uid] = (totals[uid] || 0) + size;
  }

  return totals;
}

// An account that deleted everything has no objects left in the bucket, so a
// listing alone would never mention it and its stale balance would stand for
// ever — leaving someone who cleared their storage still locked out of
// uploading. Anything with a recorded balance and nothing in the bucket has to
// be explicitly zeroed.
function withZeroedMissing(totals, knownUids) {
  const out = { ...totals };

  for (const uid of knownUids || []) {
    if (!(uid in out)) out[uid] = 0;
  }

  return out;
}

// A listing is a snapshot, and uploads do not stop while it is being taken. If
// an upload or delete landed for this account after the scan began, its
// arithmetic is newer than anything the scan can say, and overwriting it would
// throw those bytes away permanently. Leave it; the next run will catch up.
function isStaleScan(current, scanStartedAt) {
  return Number((current && current.updatedAt) || 0) >= scanStartedAt;
}

module.exports = {
  uidFromObjectName,
  nextClaims,
  claimsChanged,
  tallyByUid,
  withZeroedMissing,
  isStaleScan
};
