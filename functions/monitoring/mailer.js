// SMTP transport for Ostava's bandwidth alerts.
//
// The password is a Gmail app password held in Secret Manager as
// ARIAL_SMTP_PASS, never in source and never in the deployed config:
//   firebase functions:secrets:set ARIAL_SMTP_PASS
// Every function that mails must list smtpPassword in its `secrets` array or
// the value is simply absent at runtime.

const nodemailer = require('nodemailer');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const { getDatabase } = require('firebase-admin/database');
const { RECIPIENT, SMTP_HOST, SMTP_PORT, SMTP_USER } = require('./config');

const smtpPassword = defineSecret('ARIAL_SMTP_PASS');

// Where the dashboard looks to answer "is this thing actually working?".
// Without it, a wrong app password is invisible until the day you needed an
// alert and never got one.
const STATUS_PATH = 'monitoring/status';

async function recordStatus(fields) {
  try {
    await getDatabase().ref(STATUS_PATH).update({ ...fields, at: Date.now() });
  } catch (err) {
    // Status is diagnostics; failing to write it must not fail the alert.
    logger.warn('alert-status-write-failed', { message: err && err.message });
  }
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 2 : 1)} ${units[unit]}`;
}

async function sendAlert(subject, textBody, recipient) {
  const to = recipient || RECIPIENT;
  const password = smtpPassword.value();
  if (!password) {
    // Missing credentials must not turn a monitoring gap into a broken
    // function: log loudly, record it for the dashboard, let the caller carry on.
    logger.error('alert-mail-unconfigured', {
      reason: 'ARIAL_SMTP_PASS is empty - set it in Secret Manager'
    });
    await recordStatus({ ok: false, error: 'No SMTP password configured', subject });
    return false;
  }

  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // 465 implicit TLS, otherwise STARTTLS
    auth: { user: SMTP_USER, pass: password }
  });

  try {
    await transport.sendMail({
      from: `Ostava monitoring <${SMTP_USER}>`,
      to,
      subject,
      text: textBody
    });
    logger.info('alert-mail-sent', { subject, to });
    await recordStatus({ ok: true, error: null, subject, to });
    return true;
  } catch (err) {
    const message = (err && err.message) || 'unknown SMTP error';
    logger.error('alert-mail-failed', { subject, message });
    await recordStatus({ ok: false, error: message, subject, to });
    return false;
  }
}

module.exports = { sendAlert, formatBytes, smtpPassword };
