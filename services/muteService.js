const db = require('../firebaseConfig');
const { jidKey } = require('../utils/jidUtils');

async function addMutedUser(userId, muteUntil) {
    try {
        const jid = jidKey(userId);
        if (!jid) return false;
        await db.collection('muted_users').doc(jid).set({ muteUntil });
        console.log(`✅ Muted user ${jid} until ${new Date(muteUntil).toLocaleString()}`);
        return true;
    } catch (error) {
        console.error('❌ Error saving muted user:', error);
        return false;
    }
}

async function removeMutedUser(userId) {
    try {
        const jid = jidKey(userId);
        if (!jid) return false;
        await db.collection('muted_users').doc(jid).delete();
        console.log(`✅ Unmuted user ${jid}`);
        return true;
    } catch (error) {
        console.error('❌ Error removing muted user:', error);
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
        console.log('✅ Loaded muted users from Firestore:', Array.from(muted.keys()));
        return muted;
    } catch (error) {
        console.error('❌ Error loading muted users:', error);
        return new Map();
    }
}

module.exports = { addMutedUser, removeMutedUser, loadMutedUsers };
