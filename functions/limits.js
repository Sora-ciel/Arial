// Single source of truth for the sync usage ceilings.
//
// Lives in its own file because several independent things need the same
// numbers and none should have to require the others: the quota guard in
// index.js (which enforces them), the bandwidth monitor in monitoring/ (which
// warns before you get there), and the tests. Change them here and all of them
// follow.

// --- Bandwidth ---------------------------------------------------------
//
// A cost guard, not a product. It caps how much a single account can write in
// a day so a runaway client or a script cannot run up the bill; it is not what
// anyone is sold, and it is deliberately far above normal use.
const DAILY_BYTE_LIMIT = 250 * 1024 * 1024; // per user, per UTC day

// --- Stored bytes ------------------------------------------------------
//
// This one *is* the product. It is what a person understands ("5 GB"), what a
// price is attached to, and what actually costs money to keep, because
// attachments live in Cloud Storage for as long as the note does. Bandwidth
// above is charged per day and forgotten; this accumulates.
//
// Free is set where a text note-taker will never reach it and someone using
// image and music blocks in earnest will, within weeks — those are the two
// groups, and only the second one costs anything to serve.
const STORAGE_BYTE_LIMITS = {
  free: 100 * 1024 * 1024, //  100 MB
  pro: 10 * 1024 * 1024 * 1024 //  10 GB
};

const DEFAULT_PLAN = 'free';

// An account with no plan recorded is free, and so is one carrying a plan name
// this build has never heard of. Both directions matter: the field does not
// exist yet on any account, and when it does, a rolled-back deploy must not
// silently promote everyone by failing open.
function storageLimitFor(plan) {
  return STORAGE_BYTE_LIMITS[plan] ?? STORAGE_BYTE_LIMITS[DEFAULT_PLAN];
}

function isOverStorageLimit(bytes, plan) {
  return Number(bytes || 0) > storageLimitFor(plan);
}

module.exports = {
  DAILY_BYTE_LIMIT,
  STORAGE_BYTE_LIMITS,
  DEFAULT_PLAN,
  storageLimitFor,
  isOverStorageLimit
};
