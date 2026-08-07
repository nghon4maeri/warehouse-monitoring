/**
 * AI Prediction Service
 * ======================
 * Phụ trách: Trần Hoàng Minh Khang
 *
 * Gọi API Python FastAPI:
 *   - POST /predict   — classify + anomaly detection
 *   - POST /log       — log data for forecast
 *   - GET  /forecast  — predict throughput
 */

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

async function predictCargo(sensorPayload) {
  const response = await fetch(`${AI_SERVICE_URL}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      weight_g:       sensorPayload.weight_g || 0,
      distance_cm:    sensorPayload.distance_cm,
      dwell_time_sec: sensorPayload.dwell_time_sec || 0,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI service responded with ${response.status}`);
  }

  return response.json();
}

async function logReading(payload) {
  try {
    await fetch(`${AI_SERVICE_URL}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weight_g:       payload.weight_g || 0,
        distance_cm:    payload.distance_cm,
        dwell_time_sec: payload.dwell_time_sec || 0,
      }),
    });
  } catch (_) { /* silently skip if AI is down */ }
}

async function getForecast() {
  const response = await fetch(`${AI_SERVICE_URL}/forecast`);
  if (!response.ok) {
    throw new Error(`Forecast failed with ${response.status}`);
  }
  return response.json();
}

module.exports = { predictCargo, logReading, getForecast };
