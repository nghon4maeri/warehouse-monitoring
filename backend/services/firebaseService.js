/**
 * Firebase Realtime Database Service
 * ====================================
 * Phụ trách: Nguyễn Hồ Nam
 *
 * Lưu trữ dữ liệu cảm biến (time-series) vào Firebase RTDB
 * và truy xuất lịch sử dữ liệu cho frontend.
 */

const { db: firebaseDb } = require('../config/firebase');

function saveSensorReading(payload) {
  if (!firebaseDb) return;

  const timestamp = payload.timestamp || new Date().toISOString();
  const deviceId  = payload.deviceId || 'esp32';
  const safeKey   = timestamp.replace(/[.#$/[\]]/g, '_');

  firebaseDb.ref(`sensors/${deviceId}/${safeKey}`).set({
    deviceId,
    distance_cm:   payload.distance_cm ?? null,
    weight_g:      payload.weight_g ?? null,
    dwell_time_sec: payload.dwell_time_sec ?? 0,
    timestamp,
  }).catch(err => console.error('[Firebase] Save error:', err.message));
}

async function getHistory(limit = 50) {
  if (!firebaseDb) return {};
  try {
    const snapshot = await firebaseDb.ref('sensors').limitToLast(limit).once('value');
    return snapshot.val() || {};
  } catch (err) {
    console.error('[Firebase] Get history error:', err.message);
    return {};
  }
}

module.exports = { saveSensorReading, getHistory };