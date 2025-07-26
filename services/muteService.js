const db = require('../firebaseConfig');
const { jidKey } = require('../utils/jidUtils');

async function addMutedUser(userId, muteUntil) {
    try {
        const jid = jidKey(userId);
        if (!jid) return false;
        await db.collection('muted_users').doc(jid).set({ muteUntil });
        return true;
    } catch (error) {
        return false;
    }
}

async function removeMutedUser(userId) {
    try {
        const jid = jidKey(userId);
        if (!jid) return false;
        await db.collection('muted_users').doc(jid).delete();
        return true;
    } catch (error) {
        return false;
    }
}

async function loadMutedUsers() {
    try {
        const snapshot = await db.collection('muted_users').get();
        const muted = new Map();
        snapshot.forEach(doc => {
            const data = doc.data();
            muted.set(doc.id, data.muteUntil);
        });
        return muted;
    } catch (error) {
        return new Map();
    }
}

module.exports = { addMutedUser, removeMutedUser, loadMutedUsers };
