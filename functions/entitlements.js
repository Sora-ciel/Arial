// What plan an account should be on, given what its subscription is doing.
//
// Provider-agnostic on purpose. Paddle, Lemon Squeezy and Polar all describe
// the same handful of situations in different words, and the part worth
// getting right is not the parsing — it is deciding what a person is owed when
// their card fails, when they cancel, when they are refunded, and when a
// webhook arrives twice. That belongs somewhere Node can run it in a
// millisecond, not behind an HTTPS endpoint that has to be poked with a
// signed payload to answer a question.
//
// A provider adapter turns its own vocabulary into the statuses below, and
// nothing else here has to know which company is sending the money.

const { DEFAULT_PLAN, STORAGE_BYTE_LIMITS } = require('./limits');

// The paid tier. One tier, deliberately: a second one is a pricing page, a
// migration path and twice the support, and there is nobody to sell it to yet.
const PAID_PLAN = 'pro';

// A card that fails is usually a card that expired, not a person who left.
// Cutting them off the same hour turns an administrative hiccup into a lost
// customer and an angry email; two weeks is long enough for a renewal to be
// fixed and short enough not to be free storage.
const GRACE_PERIOD_MS = 14 * 24 * 60 * 60 * 1000;

// Every status a provider can mean, reduced to what changes the answer.
const STATUS = {
  ACTIVE: 'active', // paid and current
  PAST_DUE: 'past_due', // payment failed, still inside grace
  CANCELED: 'canceled', // will not renew; paid up until periodEndsAt
  REFUNDED: 'refunded', // money returned, or charged back
  NONE: 'none' // never subscribed, or long gone
};

/**
 * The plan an account should hold right now.
 *
 * `basePlan` is what the account falls back to, and it is not always `free`.
 * An account grandfathered onto `legacy` that subscribes and later cancels is
 * owed its 5 GB back, not dropped to 100 MB — it had that room before it ever
 * paid, and taking it away because someone once gave you money would be a
 * strange way to thank them.
 */
function resolvePlan({
  status,
  basePlan = DEFAULT_PLAN,
  periodEndsAt = 0,
  gracePeriodEndsAt = 0,
  now = Date.now()
} = {}) {
  const fallback = STORAGE_BYTE_LIMITS[basePlan] ? basePlan : DEFAULT_PLAN;

  switch (status) {
    case STATUS.ACTIVE:
      return PAID_PLAN;

    // Cancelled is not the same as over. They paid for the period, so they
    // keep it; the plan lapses when the period does.
    case STATUS.CANCELED:
      return Number(periodEndsAt) > now ? PAID_PLAN : fallback;

    // A failed payment keeps the plan while the grace window is open.
    case STATUS.PAST_DUE:
      return Number(gracePeriodEndsAt) > now ? PAID_PLAN : fallback;

    // Money returned means access returned, immediately and without grace.
    // Anything else is a free subscription for anyone willing to ask for a
    // refund.
    case STATUS.REFUNDED:
      return fallback;

    case STATUS.NONE:
      return fallback;

    // A status this build has never heard of is not a reason to guess. Guessing
    // upward gives away the product; guessing downward cuts off somebody who
    // is paying. Leaving the plan alone is the only answer that cannot be
    // wrong on its own, and it shows up in the logs to be looked at.
    default:
      return null;
  }
}

/** When a grace period should end, given the moment a payment failed. */
function graceEndsAt(failedAt, gracePeriodMs = GRACE_PERIOD_MS) {
  return Number(failedAt || 0) + gracePeriodMs;
}

/**
 * Whether this webhook has already been dealt with.
 *
 * Providers retry until they get a 200, and a retry after a timeout is the
 * normal case rather than the rare one. Every handler has to be safe to run
 * twice — resolvePlan is, since it computes an absolute answer rather than
 * applying a change, but the record of what was seen still has to be kept or
 * a refund could be undone by a redelivered renewal.
 */
function isAlreadyProcessed(seenEventIds, eventId) {
  if (!eventId) return false;
  return Boolean(seenEventIds && seenEventIds[eventId]);
}

/**
 * Whether a plan change is worth writing.
 *
 * Webhooks arrive in bursts and most of them say nothing new. Writing anyway
 * costs a database round trip and, because the plan is mirrored onto the auth
 * token, invalidates the user's credentials for no reason.
 */
function planChanged(current, next) {
  if (next === null || next === undefined) return false;
  return (current || DEFAULT_PLAN) !== next;
}

module.exports = {
  STATUS,
  PAID_PLAN,
  GRACE_PERIOD_MS,
  resolvePlan,
  graceEndsAt,
  isAlreadyProcessed,
  planChanged
};
