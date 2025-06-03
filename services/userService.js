const admin = require("firebase-admin");
const path = require("path");

// Firebase Admin Initialization
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require(path.join(__dirname, "../guard1-dbkey.json"))),
  });
}

const db = admin.firestore();

/**
 * Add or update user data in the database
 * @param {string} userId - User's WhatsApp ID
 * @param {string} userName - User's display name
 * @param {string} groupId - WhatsApp group ID
 * @param {boolean} isAdmin - Whether the user is an admin
 * @param {boolean} isInGroup - Whether the user is currently in the group
 */
async function addOrUpdateUser(userId, userName, groupId, isAdmin, isInGroup = true) {
  try {
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    const userData = userDoc.exists ? userDoc.data() : {};
    userData.name = userName;
    userData.userId = userId;
    userData.lastSeen = admin.firestore.FieldValue.serverTimestamp();
    userData.isBlacklisted = userData.isBlacklisted || false;
    userData.isWhitelisted = userData.isWhitelisted || false;

    // Initialize or update groups map
    userData.groups = userData.groups || {};
    userData.groups[groupId] = {
      joinedAt: userData.groups[groupId]?.joinedAt || admin.firestore.FieldValue.serverTimestamp(),
      isAdmin: isAdmin,
      isInGroup: isInGroup,
    };

    await userRef.set(userData, { merge: true });
    console.log(`✅ User ${userName} (${userId}) updated for group ${groupId}.`);
  } catch (error) {
    console.error("❌ Error updating user:", error);
  }
}

/**
 * Update user's activity timestamp
 * @param {string} userId - User's WhatsApp ID
 */
async function updateUserActivity(userId) {
  try {
    const userRef = db.collection("users").doc(userId);
    await userRef.update({
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`✅ User activity updated: ${userId}`);
  } catch (error) {
    console.error("❌ Error updating user activity:", error);
  }
}

/**
 * Mark a user as left from a group
 * @param {string} userId - User's WhatsApp ID
 * @param {string} groupId - WhatsApp group ID
 */
async function markUserAsLeft(userId, groupId) {
  try {
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      const userData = userDoc.data();
      if (userData.groups && userData.groups[groupId]) {
        userData.groups[groupId].isInGroup = false;
        await userRef.set(userData, { merge: true });
        console.log(`✅ User ${userId} marked as left from group ${groupId}.`);
      }
    }
  } catch (error) {
    console.error("❌ Error marking user as left:", error);
  }
}

/**
 * Update user's admin status in a group
 * @param {string} userId - User's WhatsApp ID
 * @param {string} groupId - WhatsApp group ID
 * @param {boolean} isAdmin - Admin status
 */
async function updateAdminStatus(userId, groupId, isAdmin) {
  try {
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      const userData = userDoc.data();
      if (userData.groups && userData.groups[groupId]) {
        userData.groups[groupId].isAdmin = isAdmin;
        await userRef.set(userData, { merge: true });
        console.log(`✅ Admin status updated: ${userId} in group ${groupId}`);
      }
    }
  } catch (error) {
    console.error("❌ Error updating admin status:", error);
  }
}

module.exports = {
  addOrUpdateUser,
  updateUserActivity,
  markUserAsLeft,
  updateAdminStatus,
};
