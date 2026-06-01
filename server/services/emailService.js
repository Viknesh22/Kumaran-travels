const nodemailer = require('nodemailer');

let transporterCache = null;
let lastSettingsHash = '';

function settingsHash(settings) {
  return JSON.stringify(settings);
}

function buildTransporter(settings) {
  const config = {};
  settings.forEach(s => { config[s.setting_key] = s.setting_value; });

  if (!config.SMTP_HOST || !config.SMTP_PORT) {
    return null;
  }

  const auth = {};
  if (config.SMTP_USER) {
    auth.user = config.SMTP_USER;
  }
  if (config.SMTP_PASS) {
    auth.pass = config.SMTP_PASS;
  }

  return nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: parseInt(config.SMTP_PORT, 10),
    secure: config.SMTP_SECURE === 'true',
    auth: Object.keys(auth).length > 0 ? auth : undefined,
    tls: {
      rejectUnauthorized: config.SMTP_REJECT_UNAUTHORIZED !== 'false',
    },
  });
}

async function getTransporter(db) {
  const settings = await db.prepare('SELECT setting_key, setting_value FROM notification_settings').all();
  const hash = settingsHash(settings);

  if (!transporterCache || hash !== lastSettingsHash) {
    transporterCache = buildTransporter(settings);
    lastSettingsHash = hash;
  }

  return transporterCache;
}

function clearCache() {
  transporterCache = null;
  lastSettingsHash = '';
}

async function sendEmail({ db, to, subject, html, text }) {
  const transporter = await getTransporter(db);

  if (!transporter) {
    throw new Error('SMTP not configured. Please configure SMTP settings in Settings page.');
  }

  const fromSetting = await db.prepare("SELECT setting_value FROM notification_settings WHERE setting_key = 'SMTP_FROM'").get();
  const from = fromSetting?.setting_value || 'noreply@kumaran-travels.com';

  const info = await transporter.sendMail({
    from: `"Kumaran Travels" <${from}>`,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]*>/g, ''),
  });

  return info;
}

async function testConnection(db) {
  const transporter = await getTransporter(db);
  if (!transporter) {
    throw new Error('SMTP not configured. Please configure SMTP settings first.');
  }
  return transporter.verify();
}

module.exports = { sendEmail, testConnection, clearCache };
