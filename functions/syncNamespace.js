// Which namespace under /sync the functions read and write.
//
// In its own file for the same reason limits.js is: more than one module needs
// it and none of them should have to require another to get it. index.js uses
// it for the nightly sweeps, storageAccounting.js for looking a plan up, and a
// mismatch between them would not fail — it would quietly read an empty branch
// and treat every account as unplanned.
//
// Must match firebaseSyncNamespace in firebase.ts and the NS constant in
// test-rules/database-rules.test.js.
const SYNC_NAMESPACE = 'default';

module.exports = { SYNC_NAMESPACE };
