/**
 * AI Prediction Service
 * ======================
 * Phụ trách: Trần Hoàng Minh Khang
 *
 * Gọi API Python FastAPI (/predict) để phân loại hàng hóa
 * và phát hiện bất thường (kẹt hàng, quá tải).
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

module.exports = { predictCargo };
