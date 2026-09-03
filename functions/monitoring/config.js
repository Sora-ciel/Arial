// Ostava bandwidth monitoring - tunables.
//
// This is Ostava's own monitoring and is deliberately unrelated to any other
// project's: it is threshold-driven and continuous, because a sync backend has
// no "finished" moment to report on. Nothing here is shared outside Ostava.

const { DAILY_BYTE_LIMIT } = require('../limits');

module.exports = {
  RECIPIENT: 'toyane.tb@gmail.com',
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: 465,
  SMTP_USER: 'toyane.tb@gmail.com',

  DAILY_BYTE_LIMIT,

  // Percentages of DAILY_BYTE_LIMIT that raise a mail, each at most once per
  // user per day. 100 is the point where database.rules.json starts refusing
  // writes, so the earlier steps are the ones that actually give you warning.
  ALERT_STEPS: [50, 80, 100],

  // Project-wide daily total that raises a mail on its own, independent of any
  // single user's share of it. Ten users at 40% each trip no per-user step but
  // still mean a real traffic day.
  PROJECT_DAILY_BYTE_ALERT: 1024 * 1024 * 1024, // 1 GB/day across all users

  // Send the end-of-day summary even on a completely quiet day.
  DIGEST_ON_QUIET_DAYS: false,

  // How many top consumers the digest lists.
  DIGEST_TOP_USERS: 5,

  REGION: 'us-central1'
};
