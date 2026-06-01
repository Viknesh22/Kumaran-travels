const { sendEmail } = require('./emailService');

function buildTripConfirmationHtml(trip, driverName, partnerName, vehicleName) {
  const startDate = new Date(trip.start_date).toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const endDate = new Date(trip.end_date).toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08);">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #2563eb, #1e40af); padding: 32px 24px; text-align: center;">
        <div style="width: 56px; height: 56px; background: rgba(255,255,255,0.15); border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px;">
          <span style="color: white; font-size: 24px; font-weight: 800;">KT</span>
        </div>
        <h1 style="color: #ffffff; font-size: 22px; margin: 0; font-weight: 700;">Trip Confirmed! 🎉</h1>
        <p style="color: rgba(255,255,255,0.8); margin: 6px 0 0; font-size: 14px;">Kumaran Travels • New Booking</p>
      </div>

      <!-- Body -->
      <div style="padding: 24px;">
        <p style="font-size: 15px; color: #374151; margin: 0 0 20px;">Hello <strong>${driverName || partnerName}</strong>,</p>
        <p style="font-size: 14px; color: #6b7280; margin: 0 0 20px;">A new trip has been confirmed and you are assigned as the <strong>${driverName && partnerName ? 'crew member' : driverName ? 'driver' : 'partner'}</strong>.</p>

        <!-- Trip Details Card -->
        <div style="background: #f9fafb; border-radius: 10px; padding: 20px; margin-bottom: 20px; border: 1px solid #e5e7eb;">
          <h2 style="font-size: 16px; color: #111827; margin: 0 0 16px; font-weight: 600;">${trip.title}</h2>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 6px 0; color: #6b7280; width: 100px;">Vehicle</td>
              <td style="padding: 6px 0; color: #111827; font-weight: 500;">${vehicleName || 'TBD'}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Start Date</td>
              <td style="padding: 6px 0; color: #111827; font-weight: 500;">${startDate}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">End Date</td>
              <td style="padding: 6px 0; color: #111827; font-weight: 500;">${endDate}</td>
            </tr>
            ${trip.start_location ? `<tr><td style="padding: 6px 0; color: #6b7280;">From</td><td style="padding: 6px 0; color: #111827; font-weight: 500;">${trip.start_location}</td></tr>` : ''}
            ${trip.end_location ? `<tr><td style="padding: 6px 0; color: #6b7280;">To</td><td style="padding: 6px 0; color: #111827; font-weight: 500;">${trip.end_location}</td></tr>` : ''}
            ${trip.total_rent ? `<tr><td style="padding: 6px 0; color: #6b7280;">Total Rent</td><td style="padding: 6px 0; color: #059669; font-weight: 600;">₹${Number(trip.total_rent).toLocaleString('en-IN')}</td></tr>` : ''}
          </table>
        </div>

        <p style="font-size: 13px; color: #9ca3af; margin: 0;">Please log in to the Kumaran Travels portal to view full trip details and updates.</p>
      </div>

      <!-- Footer -->
      <div style="background: #f3f4f6; padding: 16px 24px; text-align: center;">
        <p style="font-size: 12px; color: #9ca3af; margin: 0;">Kumaran Travels • Trichy, Tamil Nadu</p>
        <p style="font-size: 11px; color: #d1d5db; margin: 4px 0 0;">This is an automated notification. Please do not reply to this email.</p>
      </div>
    </div>
  `;
}

async function sendTripConfirmation({ db, trip, driver, partner, vehicleName }) {
  const results = [];

  // Send to driver
  if (driver && driver.email) {
    try {
      const html = buildTripConfirmationHtml(trip, driver.name, partner?.name, vehicleName);
      await sendEmail({
        db,
        to: driver.email,
        subject: `✅ Trip Confirmed: ${trip.title} — Kumaran Travels`,
        html,
      });
      logNotification(db, {
        trip_id: trip.id,
        recipient_type: 'driver',
        recipient_email: driver.email,
        notification_type: 'trip_confirmation',
        subject: `Trip Confirmed: ${trip.title}`,
        status: 'sent',
      });
      results.push({ recipient: driver.name, email: driver.email, status: 'sent' });
    } catch (err) {
      console.error(`Failed to send confirmation to driver ${driver.email}:`, err.message);
      logNotification(db, {
        trip_id: trip.id,
        recipient_type: 'driver',
        recipient_email: driver.email,
        notification_type: 'trip_confirmation',
        subject: `Trip Confirmed: ${trip.title}`,
        status: 'failed',
        error_message: err.message,
      });
      results.push({ recipient: driver.name, email: driver.email, status: 'failed', error: err.message });
    }
  }

  // Send to partner
  if (partner && partner.email) {
    try {
      const html = buildTripConfirmationHtml(trip, partner.name, driver?.name, vehicleName);
      await sendEmail({
        db,
        to: partner.email,
        subject: `✅ Trip Confirmed: ${trip.title} — Kumaran Travels`,
        html,
      });
      logNotification(db, {
        trip_id: trip.id,
        recipient_type: 'partner',
        recipient_email: partner.email,
        notification_type: 'trip_confirmation',
        subject: `Trip Confirmed: ${trip.title}`,
        status: 'sent',
      });
      results.push({ recipient: partner.name, email: partner.email, status: 'sent' });
    } catch (err) {
      console.error(`Failed to send confirmation to partner ${partner.email}:`, err.message);
      logNotification(db, {
        trip_id: trip.id,
        recipient_type: 'partner',
        recipient_email: partner.email,
        notification_type: 'trip_confirmation',
        subject: `Trip Confirmed: ${trip.title}`,
        status: 'failed',
        error_message: err.message,
      });
      results.push({ recipient: partner.name, email: partner.email, status: 'failed', error: err.message });
    }
  }

  return results;
}

async function logNotification(db, { trip_id, recipient_type, recipient_email, notification_type, subject, status, error_message }) {
  try {
    await db.prepare(`
      INSERT INTO notifications_log (trip_id, recipient_type, recipient_email, notification_type, subject, status, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      trip_id || null,
      recipient_type,
      recipient_email,
      notification_type,
      subject || null,
      status,
      error_message || null
    );
  } catch (err) {
    console.error('Failed to log notification:', err.message);
  }
}

module.exports = { sendTripConfirmation, logNotification };
