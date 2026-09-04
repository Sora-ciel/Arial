// Turning what Polar sends into what entitlements.js already understands.
//
// Everything provider-specific lives here and nothing else knows Polar exists,
// so swapping to Paddle later means writing a second file this size rather
// than unpicking the paywall. The decisions about what a person is owed are in
// entitlements.js and are not repeated.
//
// Two jobs: prove the request really came from Polar, and reduce its vocabulary
// to one of our statuses.

const crypto = require('node:crypto');
const { STATUS } = require('./entitlements');

// Polar signs with the Standard Webhooks spec: an id, a timestamp and the raw
// body, joined with dots and HMAC-SHA256'd under the endpoint secret.
// https://www.standardwebhooks.com/
const SIGNED_HEADERS = {
  id: 'webhook-id',
  timestamp: 'webhook-timestamp',
  signature: 'webhook-signature'
};

// Five minutes. A signature stays valid for ever on its own — it is a hash of
// a body that does not change — so without a window an attacker who captures
// one legitimate delivery can replay it whenever they like, and "subscription
// active" replayed after a refund is a free account.
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

// Standard Webhooks secrets are base64 behind a `whsec_` prefix. Signing over
// the printable string instead of the decoded bytes produces a signature that
// is wrong in a way nothing catches until every real delivery is rejected.
function decodeSecret(secret) {
  const raw = String(secret || '').replace(/^whsec_/, '');
  return Buffer.from(raw, 'base64');
}

function expectedSignature(secret, id, timestamp, rawBody) {
  return crypto
    .createHmac('sha256', decodeSecret(secret))
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');
}

// Constant-time, and length-checked first because timingSafeEqual throws on a
// length mismatch rather than returning false. A plain === here leaks how much
// of a guess was right, one byte at a time.
function signaturesMatch(sent, expected) {
  const a = Buffer.from(sent, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Whether a delivery genuinely came from Polar, unmodified and recent.
 *
 * `rawBody` must be the bytes as received. Re-serialising the parsed JSON
 * changes key order and whitespace, and the signature is over the original —
 * which is why the endpoint has to reach for req.rawBody rather than req.body.
 */
function verifyWebhook({ secret, headers = {}, rawBody = '', now = Date.now() }) {
  if (!secret) return { ok: false, reason: 'no-secret' };

  const id = headers[SIGNED_HEADERS.id];
  const timestamp = headers[SIGNED_HEADERS.timestamp];
  const signatureHeader = headers[SIGNED_HEADERS.signature];

  if (!id || !timestamp || !signatureHeader) return { ok: false, reason: 'missing-headers' };

  const sentAt = Number(timestamp) * 1000;
  if (!Number.isFinite(sentAt)) return { ok: false, reason: 'bad-timestamp' };
  if (Math.abs(now - sentAt) > TIMESTAMP_TOLERANCE_MS) return { ok: false, reason: 'stale' };

  const expected = expectedSignature(secret, id, timestamp, rawBody);

  // The header carries one or more space-separated `v1,<signature>` entries,
  // because a secret being rotated means both the old and the new one are
  // valid for a while. Any match is a match.
  const offered = String(signatureHeader)
    .split(' ')
    .map(part => part.split(',')[1] || '')
    .filter(Boolean);

  const ok = offered.some(candidate => signaturesMatch(candidate, expected));
  return ok ? { ok: true, id } : { ok: false, reason: 'bad-signature' };
}

// Polar's own subscription states, reduced to the five that change what
// someone is owed. Read from the payload rather than inferred from the event
// name: `subscription.updated` is a catch-all that fires for cancels, renewals,
// pauses and resumptions alike, so the name says a subscription changed and
// only the status says how.
function statusFromSubscription(data = {}) {
  switch (data.status) {
    // A trial is access. Someone inside one is owed the product.
    case 'active':
    case 'trialing':
      // Cancelled-at-period-end still reports active, because it is: they keep
      // it until the period runs out. Treating it as active would be right
      // today and wrong the moment the period ends, and nothing would fire to
      // correct it — subscription.revoked does that, but only if we recorded
      // the end date now.
      return data.cancel_at_period_end ? STATUS.CANCELED : STATUS.ACTIVE;

    case 'past_due':
      return STATUS.PAST_DUE;

    case 'canceled':
      return STATUS.CANCELED;

    // Dunning gave up, or the subscription never got off the ground.
    case 'unpaid':
    case 'incomplete':
    case 'incomplete_expired':
      return STATUS.NONE;

    default:
      return null;
  }
}

/** What an event means for entitlement, or null if it means nothing. */
function statusFromEvent(event = {}) {
  const type = event.type;
  const data = event.data || {};

  // Money returned, immediately and regardless of what the subscription says.
  if (type === 'order.refunded') return STATUS.REFUNDED;

  // Benefits permanently gone: the end of a cancelled period, or an immediate
  // revocation.
  if (type === 'subscription.revoked') return STATUS.NONE;

  if (typeof type === 'string' && type.startsWith('subscription.')) {
    return statusFromSubscription(data);
  }

  // Checkouts, benefit grants, everything else. Not an entitlement change, and
  // silence is the correct answer rather than a guess.
  return null;
}

/**
 * The Firebase account a payment belongs to.
 *
 * Carried as checkout metadata rather than matched on email, because the
 * address someone types at a checkout is very often not the one on their
 * Google account — and matching on it would hand one person's subscription to
 * somebody else. Metadata follows the checkout onto the subscription and its
 * orders, so it is read from several places depending on which event arrived.
 */
function uidFromEvent(event = {}) {
  const data = event.data || {};

  const candidates = [
    data.metadata && data.metadata.uid,
    data.subscription && data.subscription.metadata && data.subscription.metadata.uid,
    data.checkout && data.checkout.metadata && data.checkout.metadata.uid,
    data.customer && data.customer.metadata && data.customer.metadata.uid
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  }

  return null;
}

/** When the paid-for period runs out, as a timestamp. */
function periodEndsAt(event = {}) {
  const data = event.data || {};
  const raw =
    data.current_period_end
    || (data.subscription && data.subscription.current_period_end)
    || null;

  if (!raw) return 0;

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

module.exports = {
  SIGNED_HEADERS,
  TIMESTAMP_TOLERANCE_MS,
  expectedSignature,
  verifyWebhook,
  statusFromSubscription,
  statusFromEvent,
  uidFromEvent,
  periodEndsAt
};
