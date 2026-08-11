/**
 * MQTT Broker Service
 * ====================
 * Phụ trách: Đàng Thế Tony
 *
 * Khởi tạo kết nối MQTT đến broker (HiveMQ), subscribe
 * warehouse/sensors và publish lệnh điều khiển lên warehouse/actuators.
 */
const mqtt = require('mqtt');

const TOPICS = { SENSORS: 'warehouse/sensors', ACTUATORS: 'warehouse/actuators' };

let client = null;
let onSensorDataCb = null;

const log = (...a) => console.log('[MQTT]', ...a);
const err = (...a) => console.error('[MQTT]', ...a);

function initMQTT() {
  client = mqtt.connect(process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com', {
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    clean: true,
    connectTimeout: 10_000,
    reconnectPeriod: 5_000,
  });

  client
    .on('connect', () => {
      log('Connected to broker');
      client.subscribe(TOPICS.SENSORS, { qos: 1 }, (e) =>
        e ? err('Subscribe error:', e.message) : log(`Subscribed to ${TOPICS.SENSORS}`),
      );
    })
    .on('message', (topic, buf) => {
      if (topic !== TOPICS.SENSORS || !onSensorDataCb) return;
      try {
        onSensorDataCb(JSON.parse(buf.toString()));
      } catch (e) {
        err('Failed to parse sensor payload:', e.message);
      }
    })
    .on('error', (e) => err('Client error:', e.message))
    .on('reconnect', () => log('Reconnecting...'))
    .on('close', () => log('Connection closed'));

  return client;
}

const onSensorData = (cb) => { onSensorDataCb = cb; };

function publishActuator(command, extra = {}) {
  if (!client) return;
  const msg = JSON.stringify({ command, ...extra, timestamp: new Date().toISOString() });
  client.publish(TOPICS.ACTUATORS, msg, { qos: 1 }, (e) =>
    e ? err('Actuator publish error:', e.message) : log(`Published -> ${TOPICS.ACTUATORS}:`, msg),
  );
}

module.exports = {
  initMQTT,
  onSensorData,
  publishActuator,
  MQTT_TOPIC_SENSORS: TOPICS.SENSORS,
  MQTT_TOPIC_ACTUATORS: TOPICS.ACTUATORS,
};