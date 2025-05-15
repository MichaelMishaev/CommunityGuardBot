const db = require('../firebaseConfig');

async function addToWhitelist(phoneNumber) {
    const docRef = db.collection('whitelist').doc(phoneNumber);
    const doc = await docRef.get();
    if (doc.exists) return false;
    await docRef.set({ phone: phoneNumber });
    return true;
}

async function removeFromWhitelist(phoneNumber) {
    const docRef = db.collection('whitelist').doc(phoneNumber);
    const doc = await docRef.get();
    if (!doc.exists) return false;
    await docRef.delete();
    return true;
}

async function listWhitelist() {
    const snapshot = await db.collection('whitelist').get();
    return snapshot.docs.map(doc => doc.id);
}

async function isWhitelisted(phoneNumber) {
    const docRef = db.collection('whitelist').doc(phoneNumber);
    const doc = await docRef.get();
    return doc.exists;
}

module.exports = { addToWhitelist, removeFromWhitelist, listWhitelist, isWhitelisted };
