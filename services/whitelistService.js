const db = require('../firebaseConfig');
const { jidKey } = require('../utils/jidUtils');

async function addToWhitelist(phoneNumber) {
    const jid = jidKey(phoneNumber);
    if (!jid) return false;
    const docRef = db.collection('whitelist').doc(jid);
    const doc = await docRef.get();
    if (doc.exists) return false;
    await docRef.set({ jid });
    return true;
}

async function removeFromWhitelist(phoneNumber) {
    const jid = jidKey(phoneNumber);
    if (!jid) return false;
    const docRef = db.collection('whitelist').doc(jid);
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
    const jid = jidKey(phoneNumber);
    if (!jid) return false;
    const docRef = db.collection('whitelist').doc(jid);
    const doc = await docRef.get();

    if (doc.exists) return true;

    // 🔙 Legacy support for raw phone ids
    const legacyId = jid.includes('@') ? jid.split('@')[0] : jid;
    if (legacyId !== jid) {
        const legacyDoc = await db.collection('whitelist').doc(legacyId).get();
        return legacyDoc.exists;
    }

    return false;
}

module.exports = { addToWhitelist, removeFromWhitelist, listWhitelist, isWhitelisted };
