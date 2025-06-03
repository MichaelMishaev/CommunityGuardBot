const db = require('../firebaseConfig');

async function testConnection() {
  try {
    await db.collection('test').add({ message: "Hello from guard1!" });
    console.log("✅ Successfully connected to Firebase!");
  } catch (error) {
    console.error("❌ Failed to connect to Firebase:", error);
  }
}

testConnection();
