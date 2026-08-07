/**
 * Sensor Data Controller
 * =======================
 * Phụ trách: Nguyễn Hồ Nam
 *
 * Nhận dữ liệu cảm biến từ MQTT, lưu vào Firebase,
 * gọi AI Service phân loại, phát lệnh actuator và
 * broadcast real-time qua Socket.io đến frontend.
 */

const { saveSensorReading }            = require('../services/firebaseService');
const { predictCargo, logReading }     = require('../services/aiService');
const { publishActuator }              = require('../services/mqttService');
const { sendTelegramAlert, sendEmailAlert }
                                       = require('../services/notificationService');

let io             = null;
let objectDetected = false;

function setIO(socketIO) {
  io = socketIO;
}

async function handleSensorData(payload) {
  saveSensorReading(payload);
  logReading(payload);   // log mọi reading cho forecast

  if (io) io.emit('sensor-data', payload);

  const dist = parseFloat(payload.distance_cm);
  if (!isNaN(dist) && dist < 15.0 && !objectDetected) {
    objectDetected = true;
    await processAI(payload);
  } else if (!isNaN(dist) && dist >= 15.0) {
    objectDetected = false;
  }
}

async function processAI(sensorPayload) {
  try {
    const aiResult = await predictCargo(sensorPayload);
    console.log('[AI] Prediction:', JSON.stringify(aiResult));

    if (io) {
      io.emit('sensor-ai-update', {
        ...sensorPayload,
        category:           aiResult.category,
        is_anomaly:         aiResult.is_anomaly,
        anomaly_reason:     aiResult.anomaly_reason,
        recommended_action: aiResult.recommended_action,
      });
    }

    if (aiResult.is_anomaly) {
      publishActuator('alarm_on');
      await Promise.allSettled([
        sendTelegramAlert(sensorPayload, aiResult),
        sendEmailAlert(sensorPayload, aiResult),
      ]);
    } else {
      publishActuator(`gate_${aiResult.category.toLowerCase()}`);
    }
  } catch (err) {
    console.error('[AI] Request failed:', err.message);
  }
}

module.exports = { setIO, handleSensorData };
