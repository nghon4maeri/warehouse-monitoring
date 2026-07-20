const admin = require('firebase-admin');

/**
 * Initialise Firebase Admin SDK using a service-account key file
 * and the Realtime Database URL supplied via environment variables.
 *
 * The service-account JSON should NOT be committed to version control.
 */
const serviceAccountPath =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './config/serviceAccountKey.json';

try {
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL:
      process.env.FIREBASE_DATABASE_URL ||
      'https://your-project.firebaseio.com',
  });

  console.log('[Firebase] Admin SDK initialised');
} catch (err) {
  console.error(
    '[Firebase] Failed to initialise Admin SDK. ' +
      'Make sure serviceAccountKey.json exists in backend/config/',
    err.message,
  );
}

const db = admin.database();

module.exports = { admin, db };
