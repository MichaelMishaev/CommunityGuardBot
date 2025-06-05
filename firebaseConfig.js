const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  let serviceAccount;
  try {
    serviceAccount = require(path.join(__dirname, 'guard1-dbkey.json'));
  } catch (err) {
    console.warn('⚠️ Firebase service account key not found:', err.message);
  }

  admin.initializeApp({
    credential: serviceAccount
      ? admin.credential.cert(serviceAccount)
      : admin.credential.applicationDefault(),
  });
}

module.exports = admin.firestore();
