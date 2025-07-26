const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  let serviceAccount;
  let useServiceAccount = false;
  
  try {
    serviceAccount = require(path.join(__dirname, 'guard1-dbkey.json'));
    
    // Validate that it's not a mock key
    if (serviceAccount.private_key && !serviceAccount.private_key.includes('MOCK_PRIVATE_KEY_CONTENT')) {
      useServiceAccount = true;
      console.log('✅ Firebase service account key loaded successfully');
    } else {
      console.warn('⚠️ Mock Firebase key detected - Firebase features will be disabled');
      serviceAccount = null;
    }
  } catch (err) {
    console.warn('⚠️ Firebase service account key not found:', err.message);
    console.warn('   Firebase features will be disabled. To enable:');
    console.warn('   1. Go to Firebase Console');
    console.warn('   2. Generate a service account key');
    console.warn('   3. Save it as guard1-dbkey.json in project root');
  }

  try {
    if (useServiceAccount && serviceAccount.project_id) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id
      });
      console.log('🔥 Firebase initialized with service account');
    } else {
      // Try to use environment variable for project ID
      const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'community-guard-bot';
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: projectId
      });
      console.log(`🔥 Firebase initialized with application default credentials (project: ${projectId})`);
    }
  } catch (err) {
    console.error('❌ Firebase initialization failed:', err.message);
    console.warn('   The bot will run with limited functionality');
    
    // Initialize with a mock app to prevent crashes
    admin.initializeApp({
      projectId: 'mock-project'
    });
  }
}

// Export Firestore with error handling
let db;
try {
  db = admin.firestore();
} catch (err) {
  console.error('❌ Firestore initialization failed:', err.message);
  // Mock Firestore methods to prevent crashes
  db = {
    collection: () => ({
      doc: () => ({
        get: () => Promise.resolve({ exists: false }),
        set: () => Promise.resolve(),
        update: () => Promise.resolve(),
        delete: () => Promise.resolve()
      }),
      get: () => Promise.resolve({ empty: true, docs: [] }),
      add: () => Promise.resolve(),
      where: () => ({
        get: () => Promise.resolve({ empty: true, docs: [] })
      })
    })
  };
}

module.exports = db;
