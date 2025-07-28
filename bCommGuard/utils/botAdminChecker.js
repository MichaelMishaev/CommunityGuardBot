// Correct bot admin detection for Baileys
const { getTimestamp } = require('./logger');

/**
 * Check if bot is admin in a group
 * @param {Object} sock - Baileys socket instance
 * @param {string} groupId - Group ID to check
 * @returns {Promise<boolean>} - True if bot is admin
 */
async function isBotAdmin(sock, groupId) {
    try {
        // Get group metadata
        const groupMetadata = await sock.groupMetadata(groupId);
        
        // Get bot's ID - this is the correct way in Baileys
        const botId = sock.user.id;
        
        console.log(`[${getTimestamp()}] 🔍 Checking bot admin status:`);
        console.log(`   Bot ID: ${botId}`);
        console.log(`   Group: ${groupMetadata.subject}`);
        
        // Find bot in participants list - try multiple formats
        const botPhone = botId.split(':')[0].split('@')[0];
        const botParticipant = groupMetadata.participants.find(p => {
            // Direct ID match
            if (p.id === botId) return true;
            
            // Extract phone from participant ID
            const participantPhone = p.id.split(':')[0].split('@')[0];
            
            // Phone number match
            if (participantPhone === botPhone) return true;
            
            // Alternative formats
            if (p.id === `${botPhone}@s.whatsapp.net`) return true;
            if (p.id === `${botPhone}@c.us`) return true;
            if (p.id === `${botPhone}@lid`) return true;
            
            return false;
        });
        
        if (!botParticipant) {
            console.log('❌ Bot not found in participants list');
            console.log(`   Looking for bot phone: ${botPhone}`);
            console.log('📋 Participants:', groupMetadata.participants.map(p => ({
                id: p.id,
                phone: p.id.split(':')[0].split('@')[0],
                admin: p.admin
            })));
            return false;
        }
        
        // Check admin status - correct field names for Baileys
        const isAdmin = botParticipant.admin === 'admin' || botParticipant.admin === 'superadmin';
        
        console.log(`   Bot participant found:`, {
            id: botParticipant.id,
            admin: botParticipant.admin,
            isAdmin: isAdmin
        });
        
        return isAdmin;
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Error checking bot admin status:`, error);
        return false;
    }
}

/**
 * Get detailed bot status in group
 * @param {Object} sock - Baileys socket instance
 * @param {string} groupId - Group ID to check
 * @returns {Promise<Object>} - Detailed status object
 */
async function getBotGroupStatus(sock, groupId) {
    try {
        const groupMetadata = await sock.groupMetadata(groupId);
        const botId = sock.user.id;
        
        const botParticipant = groupMetadata.participants.find(p => p.id === botId);
        
        return {
            botId: botId,
            groupName: groupMetadata.subject,
            groupId: groupId,
            isInGroup: !!botParticipant,
            adminStatus: botParticipant?.admin || 'not_member',
            isAdmin: botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin',
            participantCount: groupMetadata.participants.length,
            adminCount: groupMetadata.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').length
        };
    } catch (error) {
        return {
            error: error.message,
            botId: sock.user.id,
            groupId: groupId
        };
    }
}

/**
 * Debug function to show all bot ID formats
 * @param {Object} sock - Baileys socket instance
 */
function debugBotId(sock) {
    const botId = sock.user.id;
    const phone = sock.user.id.split(':')[0];
    
    console.log(`[${getTimestamp()}] 🤖 Bot ID Debug:`);
    console.log(`   Full ID: ${botId}`);
    console.log(`   Phone part: ${phone}`);
    console.log(`   Platform: ${sock.user.platform || 'Unknown'}`);
    console.log(`   Name: ${sock.user.name || 'Unknown'}`);
    
    return {
        fullId: botId,
        phone: phone,
        possibleFormats: [
            botId,
            `${phone}@s.whatsapp.net`,
            `${phone}@c.us`,
            `${phone}@lid`
        ]
    };
}

module.exports = {
    isBotAdmin,
    getBotGroupStatus,
    debugBotId
};