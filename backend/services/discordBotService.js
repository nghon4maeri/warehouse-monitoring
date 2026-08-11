/**
 * Discord Chatbot Service
 * ========================
 * Phụ trách: Đàng Thế Tony
 *
 * Lắng nghe lệnh slash command từ Discord và phản hồi:
 *   /status          — Truy vấn trạng thái hệ thống (cảm biến + AI)
 *   /report          — Gửi báo cáo ca làm việc tức thì
 *   /open_gate       — Mở cổng gạt hàng
 *   /emergency_stop  — Dừng khẩn cấp (đóng cổng + bật còi)
 *
 * Cần cấu hình trong .env:
 *   DISCORD_BOT_TOKEN=xxx       (lấy từ Discord Developer Portal)
 *   DISCORD_CHANNEL_ID=xxx      (ID kênh bot được phép hoạt động)
 */

const { Client, GatewayIntentBits } = require('discord.js');
const { publishActuator } = require('./mqttService');
const { sendShiftReport, getShiftStats } = require('./notificationService');

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const ALLOWED_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

let latestSensorPayload = null;
let latestAIResult = null;

function setLatestSensorData(payload, aiResult) {
  latestSensorPayload = payload;
  latestAIResult = aiResult;
}

function buildStatusEmbed() {
  if (!latestSensorPayload) {
    return { title: 'Status', description: 'No sensor data yet — start the simulator.', color: 0x94a3b8 };
  }

  const s = latestSensorPayload;
  const ai = latestAIResult || {};

  return {
    title: 'System Status',
    color: ai.is_anomaly ? 0xff0000 : 0x22d3ee,
    fields: [
      { name: 'Distance', value: `${s.distance_cm ?? '--'} cm`, inline: true },
      { name: 'Weight', value: `${s.weight_g ?? '--'} g`, inline: true },
      { name: 'Dwell Time', value: `${s.dwell_time_sec ?? '--'} s`, inline: true },
      { name: 'AI Category', value: ai.category || 'N/A', inline: true },
      { name: 'Anomaly', value: ai.is_anomaly ? `YES — ${ai.anomaly_reason || ''}` : 'No', inline: true },
      { name: 'Action', value: ai.recommended_action || 'N/A', inline: true },
    ],
    timestamp: new Date().toISOString(),
  };
}

function buildReportEmbed() {
  const stats = getShiftStats();
  const total = stats.totalReadings;
  const anomalyPct = total > 0 ? ((stats.anomalyCount / total) * 100).toFixed(1) : '0.0';

  return {
    title: 'Shift Report',
    color: 0x34d399,
    fields: [
      { name: 'Total Readings', value: `${total}`, inline: true },
      { name: 'Anomalies', value: `${stats.anomalyCount} (${anomalyPct}%)`, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: 'Light', value: `${stats.categoryBreakdown.Light}`, inline: true },
      { name: 'Medium', value: `${stats.categoryBreakdown.Medium}`, inline: true },
      { name: 'Heavy', value: `${stats.categoryBreakdown.Heavy}`, inline: true },
    ],
    timestamp: new Date().toISOString(),
  };
}

function startChatbot() {
  if (!BOT_TOKEN) {
    console.warn('[DiscordBot] DISCORD_BOT_TOKEN not configured — bot disabled');
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once('ready', () => {
    console.log(`[DiscordBot] Logged in as ${client.user.tag}`);
  });

  client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;
    if (ALLOWED_CHANNEL_ID && msg.channel.id !== ALLOWED_CHANNEL_ID) return;

    const text = msg.content.trim().toLowerCase();

    try {
      if (text === '!status') {
        await msg.reply({ embeds: [buildStatusEmbed()] });

      } else if (text === '!report') {
        await msg.reply({ embeds: [buildReportEmbed()] });

      } else if (text === '!open_gate') {
        publishActuator('gate_open');
        await msg.reply('\u2705 Gate opened.');

      } else if (text === '!emergency_stop') {
        publishActuator('gate_close');
        publishActuator('alarm_on');
        await msg.reply('\u26A0\uFE0F EMERGENCY STOP activated — gate closed, alarm on.');

      } else if (text === '!send_report') {
        await sendShiftReport();
        await msg.reply('\u2705 Shift report email sent.');

      } else if (text === '!help' || text === '!start') {
        await msg.reply({
          embeds: [{
            title: 'Warehouse Bot Commands',
            color: 0x3b82f6,
            fields: [
              { name: '!status', value: 'System status (sensors + AI)' },
              { name: '!report', value: 'Shift report summary' },
              { name: '!open_gate', value: 'Open sorting gate' },
              { name: '!emergency_stop', value: 'Emergency stop (close gate + alarm)' },
              { name: '!send_report', value: 'Send shift report email now' },
            ],
          }],
        });
      }
    } catch (err) {
      console.error('[DiscordBot] Command error:', err.message);
    }
  });

  client.login(BOT_TOKEN).catch((err) => {
    console.error('[DiscordBot] Login failed — check DISCORD_BOT_TOKEN in .env');
    console.error('[DiscordBot]', err.message);
  });
  console.log('[DiscordBot] Connecting...');
}

module.exports = { startChatbot, setLatestSensorData };
