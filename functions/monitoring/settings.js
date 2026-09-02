// Live monitoring settings, read from RTDB at `monitoring/config`.
//
// The values in config.js are the defaults; anything stored under
// monitoring/config overrides them. That indirection exists so the dashboard
// can retune thresholds without a redeploy - changing when you get mailed
// should not require the Firebase CLI.
//
// DAILY_BYTE_LIMIT is deliberately NOT in here. It is enforced by
// database.rules.json and by the quota guard, neither of which can read a
// runtime override, so letting the dashboard "change" it would only produce a
// number that disagrees with what actually happens. It stays in limits.js.

const { logger } = require('firebase-functions');
const { getDatabase } = require('firebase-admin/database');
const defaults = require('./config');

const SETTINGS_PATH = 'monitoring/config';

// Anything outside these bounds is a typo or a mistake, and a mistake here is
// silent: too high and alerts stop, which looks exactly like a quiet week.
const LIMITS = {
  PROJECT_DAILY_BYTE_ALERT: { min: 1024 * 1024, max: 1024 * 1024 * 1024 * 1024 },
  DIGEST_TOP_USERS: { min: 1, max: 50 }
};

function clampNumber(value, fallback, bounds) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (bounds && (n < bounds.min || n > bounds.max)) return fallback;
  return n;
}

function sanitizeSteps(steps, fallback) {
  if (!Array.isArray(steps)) return fallback;
  const cleaned = [...new Set(
    steps.map(Number).filter(n => Number.isFinite(n) && n > 0 && n <= 1000)
  )].sort((a, b) => a - b);
  return cleaned.length ? cleaned : fallback;
}

function isEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Merge stored overrides over the defaults. Never throws and never returns
 * a partial object: a database hiccup must fall back to the shipped defaults
 * rather than take the alerting down with it.
 */
async function loadSettings() {
  const settings = {
    RECIPIENT: defaults.RECIPIENT,
    ALERT_STEPS: defaults.ALERT_STEPS,
    PROJECT_DAILY_BYTE_ALERT: defaults.PROJECT_DAILY_BYTE_ALERT,
    DIGEST_ON_QUIET_DAYS: defaults.DIGEST_ON_QUIET_DAYS,
    DIGEST_TOP_USERS: defaults.DIGEST_TOP_USERS,
    ALERTS_ENABLED: true
  };

  try {
    const snap = await getDatabase().ref(SETTINGS_PATH).get();
    if (!snap.exists()) return settings;
    const stored = snap.val() || {};

    if (isEmail(stored.recipient)) settings.RECIPIENT = stored.recipient.trim();
    settings.ALERT_STEPS = sanitizeSteps(stored.alertSteps, settings.ALERT_STEPS);
    settings.PROJECT_DAILY_BYTE_ALERT = clampNumber(
      stored.projectDailyByteAlert,
      settings.PROJECT_DAILY_BYTE_ALERT,
      LIMITS.PROJECT_DAILY_BYTE_ALERT
    );
    settings.DIGEST_TOP_USERS = clampNumber(
      stored.digestTopUsers, settings.DIGEST_TOP_USERS, LIMITS.DIGEST_TOP_USERS
    );
    if (typeof stored.digestOnQuietDays === 'boolean') {
      settings.DIGEST_ON_QUIET_DAYS = stored.digestOnQuietDays;
    }
    if (typeof stored.alertsEnabled === 'boolean') {
      settings.ALERTS_ENABLED = stored.alertsEnabled;
    }
  } catch (err) {
    logger.warn('monitoring-settings-fallback', { message: err && err.message });
  }

  return settings;
}

module.exports = { loadSettings, SETTINGS_PATH };
