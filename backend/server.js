require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server: SocketIOServer } = require('socket.io');
const mqtt = require('mqtt');

const { pool } = require('./config/database');
const { db: firebaseDb } = require('./config/firebase');
const { register, login, verify } = require('./controllers/authController');
const { authenticate } = require('./middleware/authMiddleware');

/* ───── Configuration ───── */
const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

const MQTT_TOPIC_SENSORS = 'warehouse/sensors';     // ESP32 publishes here
const MQTT_TOPIC_ACTUATORS = 'warehouse/actuators'; // server publishes here

/* ───── Express & HTTP ───── */
const app = express();
const server = http.createServer(app);

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

/* ───── Socket.io ───── */
const io = new SocketIOServer(server, {
  cors: { origin: CORS_ORIGIN, methods: ['GET', 'POST'] },
});

/* ───── REST API Routes ───── */
app.get('/api/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

app.post('/api/auth/register', register);
app.post('/api/auth/login', login);
app.post('/api/auth/verify', authenticate, verify);

/* ───── PostgreSQL connection check ───── */
pool.query('SELECT NOW()')
  .then(({ rows }) => console.log('[PG] Connected — server time:', rows[0].now))
  .catch(err => console.error('[PG] Connection failed:', err.message));

/* ───── MQTT Client ───── */
const mqttClient = mqtt.connect(
  process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com',
  {
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    clean: true,
    connectTimeout: 10_000,
    reconnectPeriod: 5_000,
  },
);

mqttClient.on('connect', () => {
  console.log('[MQTT] Connected to broker');
  mqttClient.subscribe(MQTT_TOPIC_SENSORS, { qos: 1 }, (err) => {
    if (err) console.error('[MQTT] Subscribe error:', err.message);
    else console.log(`[MQTT] Subscribed to ${MQTT_TOPIC_SENSORS}`);
  });
});

/**
 * Handle incoming sensor data from ESP32 / Wokwi.
 * Expected JSON payload shape:
 *   { deviceId, timestamp, distance_cm, color, temperature, humidity }
 */
mqttClient.on('message', (topic, messageBuffer) => {
  if (topic !== MQTT_TOPIC_SENSORS) return;

  try {
    const payload = JSON.parse(messageBuffer.toString());

    if (firebaseDb) {
      const timestamp = payload.timestamp || new Date().toISOString();
      const sensorRef = firebaseDb.ref(`sensors/${payload.deviceId || 'esp32'}/${timestamp.replace(/[.#$/[\]]/g, '_')}`);
      sensorRef.set({
        distance_cm: payload.distance_cm ?? null,
        color: payload.color ?? 'unknown',
        temperature: payload.temperature ?? null,
        humidity: payload.humidity ?? null,
        timestamp,
      });
    }

    // Broadcast to all connected frontend clients
    io.emit('sensor-data', payload);
  } catch (err) {
    console.error('[MQTT] Failed to parse sensor payload:', err.message);
  }
});

mqttClient.on('error', (err) => console.error('[MQTT] Client error:', err.message));
mqttClient.on('reconnect', () => console.log('[MQTT] Reconnecting…'));
mqttClient.on('close', () => console.log('[MQTT] Connection closed'));

/**
 * Publish a command to the actuators topic.
 * @param {'emergency_stop'|'gate_open'|'gate_close'} command
 * @param {object} [extra] — additional fields
 */
const publishActuator = (command, extra = {}) => {
  const msg = JSON.stringify({ command, ...extra, timestamp: new Date().toISOString() });
  mqttClient.publish(MQTT_TOPIC_ACTUATORS, msg, { qos: 1 }, (err) => {
    if (err) console.error('[MQTT] Actuator publish error:', err.message);
    else console.log(`[MQTT] Published → ${MQTT_TOPIC_ACTUATORS}:`, msg);
  });
};

/* ───── Socket.io Events ───── */
io.on('connection', (socket) => {
  console.log(`[Socket.io] Client connected: ${socket.id}`);

  // Historical sensor log request (last 50 records from Firebase)
  socket.on('request-history', async (limit = 50) => {
    if (!firebaseDb) {
      socket.emit('history-data', {});
      return;
    }
    try {
      const snapshot = await firebaseDb.ref('sensors').limitToLast(limit).once('value');
      const data = snapshot.val() || {};
      socket.emit('history-data', data);
    } catch (err) {
      console.error('[Socket.io] History fetch error:', err.message);
    }
  });

  // Actuator commands forwarded from the frontend
  socket.on('actuator-command', ({ command, ...extra }) => {
    if (!command) return;
    publishActuator(command, extra);
  });

  // Emergency stop shortcut
  socket.on('emergency-stop', () => publishActuator('emergency_stop'));

  // Manual gate trigger (open / close)
  socket.on('gate-trigger', (action) => {
    publishActuator(action === 'close' ? 'gate_close' : 'gate_open');
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.io] Client disconnected: ${socket.id}`);
  });
});

/* ───── REST endpoint for actuator commands (fallback / non-ws clients) ───── */
app.post('/api/actuators', authenticate, (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: 'command is required' });

  publishActuator(command, req.body);
  res.json({ success: true, command });
});

/* ───── Start ───── */
server.listen(PORT, () => {
  console.log(`[Server] Warehouse backend listening on http://localhost:${PORT}`);
});
