/**
 * Notification Service — Telegram Bot + Nodemailer
 * =================================================
 * Phụ trách: Đàng Thế Tony
 *
 * Gửi cảnh báo tức thì khi phát hiện anomaly (kẹt hàng/quá tải)
 * qua Telegram Bot API và Email (SMTP).
 */

const nodemailer = require('nodemailer');

const mailTransporter = nodemailer.createTransport({
  host:   process.env.EMAIL_HOST || 'smtp.gmail.com',
  port:   parseInt(process.env.EMAIL_PORT, 10) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASS || '',
  },
});

async function sendTelegramAlert(payload, aiResult) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId   = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.warn('[Telegram] Not configured — skipping alert');
    return;
  }

  const message =
    '\u26A0\uFE0F <b>WAREHOUSE ALERT</b>\n' +
    `<b>Device:</b>       ${payload.deviceId || 'N/A'}\n` +
    `<b>Issue:</b>        ${aiResult.anomaly_reason}\n` +
    `<b>Weight:</b>       ${payload.weight_g || 0}g\n` +
    `<b>Distance:</b>     ${payload.distance_cm}cm\n` +
    `<b>Dwell Time:</b>   ${payload.dwell_time_sec || 0}s\n` +
    `<b>Action:</b>       ${aiResult.recommended_action}`;

  try {
    const resp = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
      },
    );
    if (resp.ok) console.log('[Telegram] Alert sent');
    else         console.error('[Telegram] Send failed:', await resp.text());
  } catch (err) {
    console.error('[Telegram] Error:', err.message);
  }
}

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

module.exports = { sendTelegramAlert, sendEmailAlert };
