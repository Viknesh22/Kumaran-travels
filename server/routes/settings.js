const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { sendEmail, testConnection, clearCache } = require('../services/emailService');

const DEFAULT_SETTINGS = [
  { setting_key: 'SMTP_HOST', setting_value: '' },
  { setting_key: 'SMTP_PORT', setting_value: '587' },
  { setting_key: 'SMTP_SECURE', setting_value: 'false' },
  { setting_key: 'SMTP_USER', setting_value: '' },
  { setting_key: 'SMTP_PASS', setting_value: '' },
  { setting_key: 'SMTP_FROM', setting_value: '' },
  { setting_key: 'SMTP_REJECT_UNAUTHORIZED', setting_value: 'true' },
  { setting_key: 'DIESEL_RATE', setting_value: '90' },
];

// Only owner can manage settings
function requireOwner(req, res, next) {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Only the owner can manage notification settings' });
  }
  next();
}

// Get all settings (owner only — contains sensitive SMTP data)
router.get('/', authenticateToken, requireOwner, async (req, res) => {
  try {
    const db = req.db;
    let settings = await db.prepare('SELECT setting_key, setting_value FROM notification_settings ORDER BY setting_key').all();

    // Merge with defaults for any missing keys
    for (const def of DEFAULT_SETTINGS) {
      if (!settings.find(s => s.setting_key === def.setting_key)) {
        settings.push(def);
      }
    }

    // Mask SMTP_PASS
    const masked = settings.map(s => ({
      ...s,
      setting_value: s.setting_key === 'SMTP_PASS' && s.setting_value ? '••••••••' : s.setting_value,
    }));

    res.json(masked);
  } catch (err) {
    console.error('Settings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update settings
router.put('/', authenticateToken, requireOwner, async (req, res) => {
  try {
    const db = req.db;
    const { settings } = req.body;

    if (!settings || !Array.isArray(settings)) {
      return res.status(400).json({ error: 'Settings array is required' });
    }

    const upsert = db.prepare(`
      INSERT INTO notification_settings (setting_key, setting_value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP
    `);

    const transaction = db.transaction(async (items) => {
      for (const item of items) {
        // Skip if value is masked placeholder (user didn't change it)
        if (item.setting_key === 'SMTP_PASS' && item.setting_value === '••••••••') continue;
        await upsert.run(item.setting_key, item.setting_value);
      }
    });

    await transaction(settings);

    // Clear transporter cache so next send picks up new settings
    clearCache();

    // Fetch updated settings
    let updated = await db.prepare('SELECT setting_key, setting_value FROM notification_settings ORDER BY setting_key').all();
    for (const def of DEFAULT_SETTINGS) {
      if (!updated.find(s => s.setting_key === def.setting_key)) {
        updated.push(def);
      }
    }

    const masked = updated.map(s => ({
      ...s,
      setting_value: s.setting_key === 'SMTP_PASS' && s.setting_value ? '••••••••' : s.setting_value,
    }));

    res.json(masked);
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Test email connection
router.post('/test-email', authenticateToken, requireOwner, async (req, res) => {
  try {
    const db = req.db;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Recipient email is required' });
    }

    // Test SMTP connection first
    await testConnection(db);

    // Send test email
    await sendEmail({
      db,
      to: email,
      subject: '✅ Kumaran Travels — Test Email Successful',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px; text-align: center;">
          <div style="width: 64px; height: 64px; background: #d1fae5; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
            <span style="font-size: 28px;">✅</span>
          </div>
          <h1 style="color: #065f46; font-size: 20px; margin: 0 0 8px;">SMTP Configuration Works!</h1>
          <p style="color: #6b7280; font-size: 14px; margin: 0 0 20px;">Your email notifications are configured correctly. Trip confirmations and other notifications will now be delivered.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="color: #9ca3af; font-size: 12px;">Kumaran Travels • Trichy, Tamil Nadu</p>
        </div>
      `,
    });

    // Log the test
    try {
      await db.prepare(`
        INSERT INTO notifications_log (recipient_type, recipient_email, notification_type, subject, status)
        VALUES ('owner', ?, 'test', 'Test email', 'sent')
      `).run(email);
    } catch (e) { /* non-critical */ }

    res.json({ message: 'Test email sent successfully' });
  } catch (err) {
    console.error('Test email error:', err);
    res.status(500).json({ error: err.message || 'Failed to send test email' });
  }
});

// Get notification log
router.get('/log', authenticateToken, requireOwner, async (req, res) => {
  try {
    const db = req.db;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const total = await db.prepare('SELECT COUNT(*) as count FROM notifications_log').get();
    const logs = await db.prepare(`
      SELECT nl.*, t.title as trip_title
      FROM notifications_log nl
      LEFT JOIN trips t ON nl.trip_id = t.id
      ORDER BY nl.sent_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    res.json({
      logs,
      total: total.count,
      page,
      totalPages: Math.ceil(total.count / limit),
    });
  } catch (err) {
    console.error('Notification log error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get public settings (no owner check — safe for all authenticated users)
router.get('/public', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    let settings = await db.prepare("SELECT setting_key, setting_value FROM notification_settings WHERE setting_key = 'DIESEL_RATE'").all();

    // Merge default if missing
    let dieselRate = settings.find(s => s.setting_key === 'DIESEL_RATE');
    if (!dieselRate) {
      dieselRate = { setting_key: 'DIESEL_RATE', setting_value: '90' };
    }

    res.json({ diesel_rate: parseFloat(dieselRate.setting_value) || 90 });
  } catch (err) {
    console.error('Public settings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
