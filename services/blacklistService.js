const db = require('../firebaseConfig');

async function addToBlacklist(phoneNumber) {
    phoneNumber = phoneNumber.startsWith('+') ? phoneNumber.slice(1) : phoneNumber;
    
    const docRef = db.collection('blacklist').doc(phoneNumber);
    const doc = await docRef.get();
    if (doc.exists) return false;
    await docRef.set({ phone: phoneNumber });
    return true;
}

async function removeFromBlacklist(phoneNumber) {
    const docRef = db.collection('blacklist').doc(phoneNumber);
    const doc = await docRef.get();
    if (!doc.exists) return false;
    await docRef.delete();
    return true;
}

async function listBlacklist() {
    const snapshot = await db.collection('blacklist').get();
    return snapshot.docs.map(doc => doc.id);
}

async function isBlacklisted(phoneNumber) {
    const docRef = db.collection('blacklist').doc(phoneNumber);
    const doc = await docRef.get();
    return doc.exists;
}

module.exports = { addToBlacklist, removeFromBlacklist, listBlacklist, isBlacklisted };
