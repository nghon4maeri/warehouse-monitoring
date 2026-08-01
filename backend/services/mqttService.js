/**
 * MQTT Broker Service
 * ====================
 * Phụ trách: Đàng Thế Tony
 *
 * Khởi tạo kết nối MQTT đến broker (HiveMQ), subscribe
 * warehouse/sensors và publish lệnh điều khiển lên warehouse/actuators.
 */

const mqtt = require('mqtt');

const MQTT_TOPIC_SENSORS   = 'warehouse/sensors';
const MQTT_TOPIC_ACTUATORS = 'warehouse/actuators';

let mqttClient       = null;
let sensorDataCallback = null;

function initMQTT() {
  mqttClient = mqtt.connect(
    process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com',
    {
      username:         process.env.MQTT_USERNAME || undefined,
      password:         process.env.MQTT_PASSWORD || undefined,
      clean:            true,
      connectTimeout:   10_000,
      reconnectPeriod:  5_000,
    },
  );

  mqttClient.on('connect', () => {
    console.log('[MQTT] Connected to broker');
    mqttClient.subscribe(MQTT_TOPIC_SENSORS, { qos: 1 }, (err) => {
      if (err) console.error('[MQTT] Subscribe error:', err.message);
      else     console.log(`[MQTT] Subscribed to ${MQTT_TOPIC_SENSORS}`);
    });
  });

  mqttClient.on('message', (topic, messageBuffer) => {
    if (topic !== MQTT_TOPIC_SENSORS) return;
    try {
      const payload = JSON.parse(messageBuffer.toString());
      if (sensorDataCallback) sensorDataCallback(payload);
    } catch (err) {
      console.error('[MQTT] Failed to parse sensor payload:', err.message);
    }
  });

  mqttClient.on('error',     (err) => console.error('[MQTT] Client error:', err.message));
  mqttClient.on('reconnect', ()    => console.log('[MQTT] Reconnecting...'));
  mqttClient.on('close',     ()    => console.log('[MQTT] Connection closed'));

  return mqttClient;
}

function onSensorData(callback) {
  sensorDataCallback = callback;
}

function publishActuator(command, extra = {}) {
  if (!mqttClient) return;
  const msg = JSON.stringify({ command, ...extra, timestamp: new Date().toISOString() });
  mqttClient.publish(MQTT_TOPIC_ACTUATORS, msg, { qos: 1 }, (err) => {
    if (err) console.error('[MQTT] Actuator publish error:', err.message);
    else     console.log(`[MQTT] Published -> ${MQTT_TOPIC_ACTUATORS}:`, msg);
  });
}

module.exports = { initMQTT, onSensorData, publishActuator, MQTT_TOPIC_SENSORS, MQTT_TOPIC_ACTUATORS };
