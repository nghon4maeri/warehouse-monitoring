const { saveSensorReading }            = require('../services/firebaseService');
const { predictCargo }                = require('../services/aiService');
const { publishActuator }              = require('../services/mqttService');
const { sendDiscordAlert, sendEmailAlert, recordReading }
                                       = require('../services/notificationService');
const { setLatestSensorData }         = require('../services/discordBotService');

let io             = null;
let objectDetected = false;

function setIO(socketIO) {
  io = socketIO;
}

async function handleSensorData(payload) {
  saveSensorReading(payload);

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

    setLatestSensorData(sensorPayload, aiResult);

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
      recordReading(aiResult.category, true);
      await Promise.allSettled([
        sendDiscordAlert(sensorPayload, aiResult),
        sendEmailAlert(sensorPayload, aiResult),
      ]);
    } else {
      publishActuator(`gate_${aiResult.category.toLowerCase()}`);
      recordReading(aiResult.category, false);
    }
  } catch (err) {
    console.error('[AI] Request failed:', err.message);
  }
}

module.exports = { setIO, handleSensorData };
