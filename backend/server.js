/**
 * Smart Warehouse — Backend API Server (Modularised)
 * ====================================================
 * Main orchestrator: Express + Socket.io + MQTT + Auth.
 *
 * Services / Modules:
 *   services/firebaseService.js      — Nguyễn Hồ Nam
 *   controllers/sensorController.js  — Nguyễn Hồ Nam
 *   services/aiService.js            — Trần Hoàng Minh Khang
 *   services/mqttService.js          — Đàng Thế Tony
 *   services/notificationService.js  — Đàng Thế Tony
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const http                       = require('http');
const express                    = require('express');
const cors                       = require('cors');
const { Server: SocketIOServer } = require('socket.io');

const { pool }                   = require('./config/database');
const { register, login, verify } = require('./controllers/authController');
const { authenticate }            = require('./middleware/authMiddleware');
const { initMQTT, onSensorData, publishActuator }
                                  = require('./services/mqttService');
const { setIO, handleSensorData } = require('./controllers/sensorController');
const { getHistory }              = require('./services/firebaseService');
const { getForecast }             = require('./services/aiService');

/* ───── Configuration ───── */
const PORT        = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

/* ───── Express & HTTP ───── */
const app    = express();
const server = http.createServer(app);

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

/* ───── Socket.io ───── */
const io = new SocketIOServer(server, {
  cors: { origin: CORS_ORIGIN, methods: ['GET', 'POST'] },
});

/* ───── REST API Routes ───── */
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', uptime: process.uptime() }));

app.post('/api/auth/register', register);
app.post('/api/auth/login',    login);
app.post('/api/auth/verify',   authenticate, verify);

app.post('/api/actuators', authenticate, (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: 'command is required' });
  publishActuator(command, req.body);
  res.json({ success: true, command });
});

/* ───── PostgreSQL check ───── */
pool.query('SELECT NOW()')
  .then(({ rows }) => console.log('[PG] Connected — server time:', rows[0].now))
  .catch(err => console.error('[PG] Connection failed:', err.message));

/* ───── MQTT + Sensor Pipeline ───── */
initMQTT();
setIO(io);
onSensorData(handleSensorData);

/* ───── Forecast Interval (every 30s) ───── */
setInterval(async () => {
  try {
    const f = await getForecast();
    io.emit('forecast-update', f);
  } catch (_) { /* AI may not be running */ }
}, 30_000);

/* ───── Socket.io Events ───── */
io.on('connection', (socket) => {
  console.log(`[Socket.io] Client connected: ${socket.id}`);

  socket.on('request-history', async (limit = 50) => {
    const data = await getHistory(limit);
    socket.emit('history-data', data);
  });

  socket.on('actuator-command', ({ command, ...extra }) => {
    if (!command) return;
    publishActuator(command, extra);
  });

  socket.on('emergency-stop', () => {
    publishActuator('gate_close');
    publishActuator('alarm_on');
  });

  socket.on('gate-trigger', (action) => {
    publishActuator(action === 'close' ? 'gate_close' : 'gate_open');
  });

  socket.on('alarm-toggle', (activate) => {
    publishActuator(activate ? 'alarm_on' : 'alarm_off');
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.io] Client disconnected: ${socket.id}`);
  });
});

/* ───── Start ───── */
server.listen(PORT, () => {
  console.log(`[Server] Warehouse backend listening on http://localhost:${PORT}`);
});
