const db = require('../firebaseConfig');
const { jidKey } = require('../utils/jidUtils');

async function addToBlacklist(identifier) {
    const jid = jidKey(identifier);
    if (!jid) return false;
    const docRef = db.collection('blacklist').doc(jid);
    const doc = await docRef.get();
    if (doc.exists) return false;
    await docRef.set({ jid });
    return true;
}

async function removeFromBlacklist(identifier) {
    const jid = jidKey(identifier);
    if (!jid) return false;
    const docRef = db.collection('blacklist').doc(jid);
    const doc = await docRef.get();
    if (!doc.exists) return false;
    await docRef.delete();
    return true;
}

async function listBlacklist() {
    const snapshot = await db.collection('blacklist').get();
    return snapshot.docs.map(doc => doc.id);
}

async function isBlacklisted(identifier) {
    const jid = jidKey(identifier);
    if (!jid) return false;
    const docRef = db.collection('blacklist').doc(jid);
    const doc = await docRef.get();

    if (doc.exists) return true;

    // 🔙 Legacy support: some entries were stored as raw phone numbers (no @c.us)
    const legacyId = jid.includes('@') ? jid.split('@')[0] : jid;
    if (legacyId !== jid) {
        const legacyDoc = await db.collection('blacklist').doc(legacyId).get();
        return legacyDoc.exists;
    }

    return false;
}

module.exports = { addToBlacklist, removeFromBlacklist, listBlacklist, isBlacklisted };
