const admin = require('firebase-admin');
const path = require('path');

/**
 * Initialise Firebase Admin SDK using a service-account key file
 * and the Realtime Database URL supplied via environment variables.
 *
 * The service-account JSON should NOT be committed to version control.
 */
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  ? path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
  : path.join(__dirname, 'serviceAccountKey.json');

let db = null;

try {
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL:
      process.env.FIREBASE_DATABASE_URL ||
      'https://your-project.firebaseio.com',
  });

  db = admin.database();
  console.log('[Firebase] Admin SDK initialised');
} catch (err) {
  console.error(
    '[Firebase] Failed to initialise Admin SDK — sensor persistence disabled. ' +
      'Make sure serviceAccountKey.json exists in backend/config/',
    err.message,
  );
}

module.exports = { admin, db };
