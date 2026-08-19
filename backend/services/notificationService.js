/**
 * Notification Service — Discord Webhook + Nodemailer
 * ====================================================
 * Phụ trách: Đàng Thế Tony
 *
 * - Gửi cảnh báo tức thì qua Discord Webhook và Email (SMTP)
 * - Báo cáo định kỳ cuối ca qua Email (node-cron)
 */

const nodemailer = require('nodemailer');
const cron = require('node-cron');

const mailTransporter = nodemailer.createTransport({
  host:   process.env.EMAIL_HOST || 'smtp.gmail.com',
  port:   parseInt(process.env.EMAIL_PORT, 10) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASS || '',
  },
});

// ───── In-memory stats accumulators for scheduled reports ─────
const shiftStats = {
  totalReadings: 0,
  anomalyCount: 0,
  categoryBreakdown: { Light: 0, Medium: 0, Heavy: 0 },
  lastReset: new Date().toISOString(),
};

function recordReading(category, isAnomaly) {
  shiftStats.totalReadings++;
  if (isAnomaly) shiftStats.anomalyCount++;
  if (category && shiftStats.categoryBreakdown[category] !== undefined) {
    shiftStats.categoryBreakdown[category]++;
  }
}

function getShiftStats() {
  return { ...shiftStats, categoryBreakdown: { ...shiftStats.categoryBreakdown } };
}

function resetShiftStats() {
  shiftStats.totalReadings = 0;
  shiftStats.anomalyCount = 0;
  shiftStats.categoryBreakdown = { Light: 0, Medium: 0, Heavy: 0 };
  shiftStats.lastReset = new Date().toISOString();
}

// ───── Discord Webhook — Instant Alerts ─────

async function sendDiscordAlert(payload, aiResult) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn('[Discord] Webhook not configured — skipping alert');
    return;
  }

  const color = aiResult.is_anomaly ? 0xff0000 : 0x00ff00;

  const embed = {
    title: '\u26A0\uFE0F Warehouse Alert',
    color,
    fields: [
      { name: 'Device', value: payload.deviceId || 'N/A', inline: true },
      { name: 'Weight', value: `${payload.weight_g || 0}g`, inline: true },
      { name: 'Distance', value: `${payload.distance_cm}cm`, inline: true },
      { name: 'Dwell Time', value: `${payload.dwell_time_sec || 0}s`, inline: true },
      { name: 'Category', value: aiResult.category || 'N/A', inline: true },
      { name: 'Action', value: aiResult.recommended_action || 'N/A', inline: true },
    ],
    timestamp: new Date().toISOString(),
  };

  if (aiResult.anomaly_reason) {
    embed.fields.unshift({ name: 'Issue', value: aiResult.anomaly_reason, inline: false });
  }

  try {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
    if (resp.ok) console.log('[Discord] Alert sent');
    else console.error('[Discord] Send failed:', await resp.text());
  } catch (err) {
    console.error('[Discord] Error:', err.message);
  }
}

// ───── Instant Email Alert ─────

async function sendEmailAlert(payload, aiResult) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('[Email] Not configured — skipping alert');
    return;
  }

  try {
    await mailTransporter.sendMail({
      from:    process.env.EMAIL_USER,
      to:      process.env.EMAIL_TO || process.env.EMAIL_USER,
      subject: `[Warehouse Alert] ${aiResult.anomaly_reason}`,
      html:
        '<h2>\u26A0\uFE0F Warehouse Anomaly Detected</h2>' +
        '<table border="0" cellpadding="8">' +
        `<tr><td><b>Device</b></td><td>${payload.deviceId || 'N/A'}</td></tr>` +
        `<tr><td><b>Issue</b></td><td>${aiResult.anomaly_reason}</td></tr>` +
        `<tr><td><b>Weight</b></td><td>${payload.weight_g || 0} g</td></tr>` +
        `<tr><td><b>Distance</b></td><td>${payload.distance_cm} cm</td></tr>` +
        `<tr><td><b>Dwell Time</b></td><td>${payload.dwell_time_sec || 0} s</td></tr>` +
        `<tr><td><b>Action</b></td><td>${aiResult.recommended_action}</td></tr>` +
        '</table>',
    });
    console.log('[Email] Alert sent');
  } catch (err) {
    console.error('[Email] Error:', err.message);
  }
}

// ───── Scheduled shift reports ─────

async function sendShiftReport() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('[ShiftReport] Email not configured — skipping scheduled report');
    return;
  }

  const stats = getShiftStats();
  const dateStr = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const timeStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const total = stats.totalReadings;
  const anomalyPct = total > 0 ? ((stats.anomalyCount / total) * 100).toFixed(1) : '0.0';

  try {
    await mailTransporter.sendMail({
      from:    process.env.EMAIL_USER,
      to:      process.env.EMAIL_REPORT_TO || process.env.EMAIL_USER,
      subject: `[Warehouse Report] Shift Summary — ${dateStr} ${timeStr}`,
      html:
        '<h2>Warehouse Operations Report</h2>' +
        `<p><b>Time:</b> ${dateStr} ${timeStr}</p>` +
        '<hr/>' +
        '<h3>Overview</h3>' +
        '<table border="0" cellpadding="8">' +
        `<tr><td><b>Total Items Processed</b></td><td>${total}</td></tr>` +
        `<tr><td><b>Anomalies Detected</b></td><td>${stats.anomalyCount} (${anomalyPct}%)</td></tr>` +
        '</table>' +
        '<h3>Classification Breakdown</h3>' +
        '<table border="0" cellpadding="8">' +
        `<tr><td>Light (&lt; 250g)</td><td>${stats.categoryBreakdown.Light}</td></tr>` +
        `<tr><td>Medium (250-750g)</td><td>${stats.categoryBreakdown.Medium}</td></tr>` +
        `<tr><td>Heavy (&gt; 750g)</td><td>${stats.categoryBreakdown.Heavy}</td></tr>` +
        '</table>' +
        '<hr/>' +
        '<p style="color:#888;font-size:12px;">Automated email from Warehouse Monitoring System. Do not reply.</p>',
    });
    console.log(`[ShiftReport] Email report sent — ${total} readings, ${stats.anomalyCount} anomalies`);
    resetShiftStats();
  } catch (err) {
    console.error('[ShiftReport] Error:', err.message);
  }
}

function startScheduledReports(cronExpression) {
  const expr = cronExpression || process.env.REPORT_CRON || '0 */2 * * *';
  cron.schedule(expr, () => {
    console.log('[ShiftReport] Running scheduled report...');
    sendShiftReport();
  });
  console.log(`[ShiftReport] Scheduled reports started (cron: ${expr})`);
}

module.exports = {
  sendDiscordAlert,
  sendEmailAlert,
  sendShiftReport,
  startScheduledReports,
  recordReading,
  getShiftStats,
  resetShiftStats,
};
