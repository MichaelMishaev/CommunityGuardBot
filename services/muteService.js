const db = require('../firebaseConfig');

async function addMutedUser(userId, muteUntil) {
    try {
        await db.collection('muted_users').doc(userId).set({ muteUntil });
        console.log(`✅ Muted user ${userId} until ${new Date(muteUntil).toLocaleString()}`);
        return true;
    } catch (error) {
        console.error('❌ Error saving muted user:', error);
        return false;
    }
}

async function removeMutedUser(userId) {
    try {
        await db.collection('muted_users').doc(userId).delete();
        console.log(`✅ Unmuted user ${userId}`);
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
