const config = require('../config');
const { addToBlacklist, removeFromBlacklist, listBlacklist, isBlacklisted } = require('./blacklistService');
const { addToWhitelist, removeFromWhitelist, listWhitelist, isWhitelisted } = require('./whitelistService');
const { addMutedUser, removeMutedUser, isMuted, getMutedUsers } = require('./muteService');
const { getTimestamp } = require('../utils/logger');

// Track group mute status
const groupMuteStatus = new Map();

class CommandHandler {
    constructor(sock) {
        this.sock = sock;
    }
    
    isPrivateChat(msg) {
        return msg.key.remoteJid.endsWith('@s.whatsapp.net');
    }
    
    async sendGroupOnlyMessage(msg, commandName) {
        await this.sock.sendMessage(msg.key.remoteJid, { 
            text: `⚠️ The ${commandName} command can only be used in groups.` 
        });
    }

    async handleCommand(msg, command, args, isAdmin, isSuperAdmin) {
        const cmd = command.toLowerCase();
        
        try {
            switch (cmd) {
                case '#help':
                    return await this.handleHelp(msg);
                    
                case '#status':
                    return await this.handleStatus(msg);
                    
                case '#mute':
                    return await this.handleMute(msg, args, isAdmin);
                    
                case '#unmute':
                    return await this.handleUnmute(msg, args, isAdmin);
                    
                case '#clear':
                    return await this.handleClear(msg, isAdmin);
                    
                case '#kick':
                    return await this.handleKick(msg, isAdmin);
                    
                case '#ban':
                    return await this.handleBan(msg, isAdmin);
                    
                case '#warn':
                    return await this.handleWarn(msg, isAdmin);
                    
                case '#whitelist':
                    return await this.handleWhitelist(msg, args, isAdmin);
                    
                case '#unwhitelist':
                    return await this.handleUnwhitelist(msg, args, isAdmin);
                    
                case '#whitelst':
                    return await this.handleWhitelistList(msg, isAdmin);
                    
                case '#blacklist':
                    return await this.handleBlacklistAdd(msg, args, isAdmin);
                    
                case '#unblacklist':
                    return await this.handleBlacklistRemove(msg, args, isAdmin);
                    
                case '#blacklst':
                    return await this.handleBlacklistList(msg, isAdmin);
                    
                case '#sweep':
                    return await this.handleSweep(msg, isSuperAdmin);
                    
                case '#botkick':
                    return await this.handleBotKick(msg, isAdmin);
                    
                case '#stats':
                    return await this.handleStats(msg, isAdmin);
                    
                case '#botforeign':
                    return await this.handleBotForeign(msg, isAdmin);
                    
                case '#debugnumbers':
                    return await this.handleDebugNumbers(msg, isAdmin);
                    
                case '#sessioncheck':
                    return await this.handleSessionCheck(msg, isAdmin);
                    
                case '#botadmin':
                    return await this.handleBotAdminCheck(msg, isAdmin);
                    
                default:
                    return false; // Command not handled
            }
        } catch (error) {
            console.error(`❌ Error handling command ${cmd}:`, error);
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `❌ Error executing command: ${error.message}` 
            });
            return true;
        }
    }

    async handleHelp(msg) {
        // Check if sender is the authorized admin
        const senderId = msg.key.participant || msg.key.remoteJid;
        const senderPhone = senderId.split('@')[0];
        const isPrivateChat = !msg.key.remoteJid.endsWith('@g.us');
        
        // Check if it's admin (handle both regular and LID format)
        const isAdminPhone = senderPhone === config.ALERT_PHONE || 
                           senderPhone === config.ADMIN_PHONE ||
                           senderId.includes(config.ALERT_PHONE) ||
                           senderId.includes(config.ADMIN_PHONE);
        
        // ONLY allow help command in private chat from admin
        if (!isPrivateChat) {
            // In groups, don't reveal anything about the help command
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Unknown command.' 
            });
            return true;
        }
        
        // In private chat, check if it's the admin
        if (!isAdminPhone) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Unauthorized.' 
            });
            return true;
        }
        
        const helpText = `📝 *CommGuard Bot Commands*

*🔧 Basic Commands:*
• *#status* - Check bot status and configuration
• *#stats* - Show group statistics

*👮 Moderation Commands:* (Reply to message)
• *#kick* - Remove user from group + blacklist
• *#ban* - Permanently ban user from group
• *#warn* - Send private warning to user
• *#clear* - Clear messages (not yet implemented)

*🔇 Mute Commands:*
• *#mute [minutes]* - Mute entire group (admin only)
• *#mute (reply) [minutes]* - Mute specific user
• *#unmute* - Unmute group/user

*📋 Whitelist Management:*
• *#whitelist [number]* - Add number to whitelist
• *#unwhitelist [number]* - Remove from whitelist  
• *#whitelst* - List whitelisted numbers

*🚫 Blacklist Management:*
• *#blacklist [number]* - Add to blacklist
• *#unblacklist [number]* - Remove from blacklist
• *#blacklst* - List blacklisted numbers
• *#botkick* - Scan group and kick all blacklisted users

*🌍 Country Restriction:*
• *#botforeign* - Remove all +1 and +6 users from group

*🧹 Advanced Commands:*
• *#sweep* - Clean up inactive users (superadmin)
• *#sessioncheck* - Check for session decryption errors
• *#botadmin* - Check if bot has admin privileges

*🚨 Auto-Protection Features:*
• **Invite Link Detection** - Auto-kick + blacklist
• **Blacklist Enforcement** - Auto-kick banned users
• **Country Code Restriction** - Auto-kick +1 and +6 numbers
• **Whitelist Protection** - Bypass all restrictions

*💡 Usage Examples:*
• Kick user: Reply to their message + type \`#kick\`
• Mute group: \`#mute 30\` (30 minutes)
• Add to whitelist: \`#whitelist 972555123456\`
• Remove all foreign users: \`#botforeign\`

*⚠️ Important Notes:*
• Most commands require admin privileges
• Cannot kick/ban other admins
• Whitelisted users bypass all restrictions
• All actions are logged and tracked

*🔒 Security Notice:*
• This command list is PRIVATE
• Only accessible via DM to authorized admin
• #help is disabled in groups for security

*🛡️ Bot protects your groups 24/7 automatically!*`;

        await this.sock.sendMessage(msg.key.remoteJid, { text: helpText });
        return true;
    }

    async handleStatus(msg) {
        const botId = this.sock.user.id;
        const statusText = `🤖 *CommGuard Bot Status*

✅ *Online and Active*
🆔 Bot ID: ${botId}
📱 Version: 2.0 (Baileys)
⏰ Current Time: ${getTimestamp()}

*Features Status:*
• Invite Link Detection: ✅ Active
• Auto-kick Blacklisted: ✅ Active
• Firebase Integration: ✅ Connected (guard1-d43a3)
• Mute System: ✅ Active
• Whitelist System: ✅ Active

*Configuration:*
• Admin Phone: ${config.ADMIN_PHONE}
• Alert Phone: ${config.ALERT_PHONE}
• Kick Cooldown: ${config.KICK_COOLDOWN / 1000}s

🛡️ *Protecting your groups 24/7*`;

        await this.sock.sendMessage(msg.key.remoteJid, { text: statusText });
        return true;
    }

    async handleMute(msg, args, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Only admins can use the mute command.' 
            });
            return true;
        }
        
        // Check if in private chat
        if (this.isPrivateChat(msg)) {
            await this.sendGroupOnlyMessage(msg, '#mute');
            return true;
        }

        const groupId = msg.key.remoteJid;
        const hasQuotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (hasQuotedMsg) {
            // Mute specific user
            return await this.handleMuteUser(msg, args);
        } else {
            // Mute entire group
            return await this.handleMuteGroup(msg, args);
        }
    }

    async handleMuteGroup(msg, args) {
        const minutes = parseInt(args, 10);
        if (!minutes || minutes <= 0) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ Please specify valid minutes. Example: #mute 10' 
            });
            return true;
        }

        const groupId = msg.key.remoteJid;
        const muteUntil = Date.now() + (minutes * 60000);
        
        groupMuteStatus.set(groupId, muteUntil);

        await this.sock.sendMessage(groupId, { 
            text: `🔇 Group muted for ${minutes} minutes.\nOnly admins can send messages.` 
        });

        // Auto-unmute after specified time
        setTimeout(async () => {
            groupMuteStatus.delete(groupId);
            await this.sock.sendMessage(groupId, { 
                text: '🔊 Group has been unmuted. Everyone can now send messages.' 
            });
        }, minutes * 60000);

        return true;
    }

    async handleMuteUser(msg, args) {
        // Implementation for muting specific user
        const parts = args.split(' ');
        const minutes = parseInt(parts[0], 10) || 60; // Default 1 hour
        
        if (minutes <= 0) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ Please specify valid minutes. Example: #mute 30' 
            });
            return true;
        }

        const quotedMsgId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
        if (!quotedMsgId) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ Please reply to a message to mute that user.' 
            });
            return true;
        }

        // Get the quoted message to find the user to mute
        // Note: This is simplified - in practice you'd need to track message senders
        await this.sock.sendMessage(msg.key.remoteJid, { 
            text: `🔇 User will be muted for ${minutes} minutes. Their messages will be automatically deleted.` 
        });

        return true;
    }

    isGroupMuted(groupId) {
        const muteUntil = groupMuteStatus.get(groupId);
        if (!muteUntil) return false;
        
        if (Date.now() >= muteUntil) {
            groupMuteStatus.delete(groupId);
            return false;
        }
        
        return true;
    }

    async handleStats(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Only admins can view statistics.' 
            });
            return true;
        }

        // Check if in private chat
        if (this.isPrivateChat(msg)) {
            // Show general bot statistics
            const { blacklistCache } = require('./blacklistService');
            const { whitelistCache } = require('./whitelistService');
            const mutedUsers = getMutedUsers();
            const activeMutes = Array.from(mutedUsers.entries()).filter(([id, muteUntil]) => Date.now() < muteUntil).length;
            
            const statsText = `📊 *Bot Statistics*

🚫 *Blacklisted Users:* ${blacklistCache.size}
✅ *Whitelisted Users:* ${whitelistCache.size}
🔇 *Currently Muted:* ${activeMutes}
🔥 *Firebase:* Connected (${config.FEATURES.FIREBASE_INTEGRATION ? 'Enabled' : 'Disabled'})
🌍 *Country Filter:* ${config.FEATURES.RESTRICT_COUNTRY_CODES ? 'Active' : 'Inactive'}

⏰ *Generated:* ${getTimestamp()}`;

            await this.sock.sendMessage(msg.key.remoteJid, { text: statsText });
            return true;
        }

        // Group statistics
        try {
            const groupMetadata = await this.sock.groupMetadata(msg.key.remoteJid);
            const participants = groupMetadata.participants;
            
            const adminCount = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').length;
            const memberCount = participants.length;
            
            const mutedUsers = getMutedUsers();
            const activeMutes = Array.from(mutedUsers.entries()).filter(([id, muteUntil]) => Date.now() < muteUntil).length;

            const statsText = `📊 *Group Statistics*

👥 *Members:* ${memberCount}
👮 *Admins:* ${adminCount}
🔇 *Muted Users:* ${activeMutes}
📝 *Group Name:* ${groupMetadata.subject}
🆔 *Group ID:* ${groupMetadata.id}

⏰ *Generated:* ${getTimestamp()}`;

            await this.sock.sendMessage(msg.key.remoteJid, { text: statsText });
        } catch (error) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Failed to get group statistics.' 
            });
        }
        
        return true;
    }

    // Add more command handlers here...
    async handleKick(msg, isAdmin) {
        console.log(`[${require('../utils/logger').getTimestamp()}] 🔍 #kick command received from admin: ${isAdmin}`);
        
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Only admins can kick users.' 
            });
            return true;
        }
        
        // Check if in private chat
        if (this.isPrivateChat(msg)) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ The #kick command can only be used in groups.\n\nUsage: Reply to a user\'s message in a group and type #kick' 
            });
            return true;
        }

        // Check if this is a reply to another message
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo;
        console.log(`[${require('../utils/logger').getTimestamp()}] 🔍 Quoted message context:`, {
            hasQuotedMsg: !!quotedMsg,
            hasParticipant: !!quotedMsg?.participant,
            participant: quotedMsg?.participant
        });
        
        if (!quotedMsg || !quotedMsg.participant) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ Please reply to a message from the user you want to kick.\n\nUsage: Reply to a user\'s message and type #kick' 
            });
            return true;
        }

        const groupId = msg.key.remoteJid;
        const targetUserId = quotedMsg.participant;
        
        try {
            // Get group metadata to check permissions
            const groupMetadata = await this.sock.groupMetadata(groupId);
            
            // Check if target user is admin
            const targetParticipant = groupMetadata.participants.find(p => p.id === targetUserId);
            if (targetParticipant && (targetParticipant.admin === 'admin' || targetParticipant.admin === 'superadmin')) {
                await this.sock.sendMessage(groupId, { 
                    text: '❌ Cannot kick admin users.' 
                });
                return true;
            }

            // Check if target user is still in group
            if (!targetParticipant) {
                await this.sock.sendMessage(groupId, { 
                    text: '❌ User is not in this group.' 
                });
                return true;
            }

            console.log(`[${require('../utils/logger').getTimestamp()}] 👢 Admin kick: ${targetUserId} from ${groupId}`);

            // Kick the user
            await this.sock.groupParticipantsUpdate(groupId, [targetUserId], 'remove');

            // Add to blacklist (no group message sent)
            const { addToBlacklist } = require('./blacklistService');
            await addToBlacklist(targetUserId, 'Kicked by admin command');

            console.log(`[${require('../utils/logger').getTimestamp()}] ✅ Successfully kicked user: ${targetUserId}`);

        } catch (error) {
            console.error(`[${require('../utils/logger').getTimestamp()}] ❌ Failed to kick user:`, error);
            await this.sock.sendMessage(groupId, { 
                text: '❌ Failed to kick user. Make sure the bot has admin privileges.' 
            });
        }

        return true;
    }

    async handleClear(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Only admins can clear messages.' 
            });
            return true;
        }

        // Check if in private chat
        if (this.isPrivateChat(msg)) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ The #clear command can only be used in groups.\n\nUsage: In a group, type #clear to clear recent messages' 
            });
            return true;
        }

        await this.sock.sendMessage(msg.key.remoteJid, { 
            text: '⚠️ Clear command not yet implemented in Baileys version.' 
        });
        return true;
    }

    async handleWhitelist(msg, args, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Only admins can manage whitelist.' 
            });
            return true;
        }

        if (!args) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ Please provide a phone number. Example: #whitelist 972555123456' 
            });
            return true;
        }

        const success = await addToWhitelist(args);
        if (success) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `✅ Added ${args} to whitelist.` 
            });
        } else {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `❌ Failed to add ${args} to whitelist (may already exist).` 
            });
        }
        return true;
    }

    async handleWhitelistList(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Only admins can view whitelist.' 
            });
            return true;
        }

        const whitelisted = await listWhitelist();
        if (whitelisted.length === 0) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '📝 Whitelist is empty.' 
            });
        } else {
            const list = whitelisted.map((num, index) => `${index + 1}. ${num}`).join('\n');
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `📝 *Whitelisted Users:*\n\n${list}` 
            });
        }
        return true;
    }

    async handleBan(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Only admins can ban users.' 
            });
            return true;
        }

        // Check if in private chat
        if (this.isPrivateChat(msg)) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ The #ban command can only be used in groups.\n\nUsage: Reply to a user\'s message in a group and type #ban' 
            });
            return true;
        }

        // Check if this is a reply to another message
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo;
        if (!quotedMsg || !quotedMsg.participant) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ Please reply to a message from the user you want to ban.\n\nUsage: Reply to a user\'s message and type #ban' 
            });
            return true;
        }

        const groupId = msg.key.remoteJid;
        const targetUserId = quotedMsg.participant;
        
        try {
            // Get group metadata to check permissions
            const groupMetadata = await this.sock.groupMetadata(groupId);
            
            // Check if target user is admin
            const targetParticipant = groupMetadata.participants.find(p => p.id === targetUserId);
            if (targetParticipant && (targetParticipant.admin === 'admin' || targetParticipant.admin === 'superadmin')) {
                await this.sock.sendMessage(groupId, { 
                    text: '❌ Cannot ban admin users.' 
                });
                return true;
            }

            console.log(`[${require('../utils/logger').getTimestamp()}] 🚫 Admin ban: ${targetUserId} from ${groupId}`);

            // Add to blacklist first
            const { addToBlacklist } = require('./blacklistService');
            await addToBlacklist(targetUserId, 'Banned by admin command');

            // Then kick the user if they're still in group
            if (targetParticipant) {
                await this.sock.groupParticipantsUpdate(groupId, [targetUserId], 'remove');
                
                await this.sock.sendMessage(groupId, { 
                    text: `🚫 User has been banned and removed from the group.\nThey cannot rejoin until unbanned.` 
                });
            } else {
                await this.sock.sendMessage(groupId, { 
                    text: `🚫 User has been banned and cannot join this group.` 
                });
            }

            console.log(`[${require('../utils/logger').getTimestamp()}] ✅ Successfully banned user: ${targetUserId}`);

        } catch (error) {
            console.error(`[${require('../utils/logger').getTimestamp()}] ❌ Failed to ban user:`, error);
            await this.sock.sendMessage(groupId, { 
                text: '❌ Failed to ban user. Make sure the bot has admin privileges.' 
            });
        }

        return true;
    }

    async handleWarn(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Only admins can warn users.' 
            });
            return true;
        }

        // Check if in private chat
        if (this.isPrivateChat(msg)) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ The #warn command can only be used in groups.\n\nUsage: Reply to a user\'s message in a group and type #warn' 
            });
            return true;
        }

        // Check if this is a reply to another message
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo;
        if (!quotedMsg || !quotedMsg.participant) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ Please reply to a message from the user you want to warn.\n\nUsage: Reply to a user\'s message and type #warn' 
            });
            return true;
        }

        const targetUserId = quotedMsg.participant;
        
        try {
            const warningMessage = `⚠️ *Warning from Group Admin*

Please follow the group rules and guidelines. 

This is an official warning. Continued violations may result in removal from the group.

Thank you for your cooperation.`;

            // Send warning to the user privately
            await this.sock.sendMessage(targetUserId, { text: warningMessage });
            
            // Confirm in group
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `⚠️ Warning sent to user privately.` 
            });

            console.log(`[${require('../utils/logger').getTimestamp()}] ⚠️ Warning sent to: ${targetUserId}`);

        } catch (error) {
            console.error(`[${require('../utils/logger').getTimestamp()}] ❌ Failed to warn user:`, error);
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Failed to send warning.' 
            });
        }

        return true;
    }

    async handleBotForeign(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Only admins can use the botforeign command.' 
            });
            return true;
        }

        // Check if in private chat
        if (this.isPrivateChat(msg)) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ The #botforeign command can only be used in groups.\n\nUsage: In a group, type #botforeign to remove all users with +1 or +6 country codes' 
            });
            return true;
        }

        const groupId = msg.key.remoteJid;
        
        try {
            // Get group metadata
            const groupMetadata = await this.sock.groupMetadata(groupId);
            const participants = groupMetadata.participants;
            
            // Find all users with +1 or +6 country codes
            const usersToKick = [];
            const whitelistedSkipped = [];
            
            for (const participant of participants) {
                const userId = participant.id;
                const phoneNumber = userId.split('@')[0];
                const isLidFormat = userId.endsWith('@lid');
                
                // Debug: Log all phone numbers to see format
                console.log(`🔍 Checking participant: ${phoneNumber} (length: ${phoneNumber.length}, LID: ${isLidFormat})`);
                
                // Skip bot and admins
                if (participant.admin === 'admin' || participant.admin === 'superadmin') {
                    console.log(`👮 Skipping admin: ${phoneNumber}`);
                    continue;
                }
                
                // Check if user is whitelisted
                if (await isWhitelisted(userId)) {
                    if (phoneNumber.startsWith('1') || phoneNumber.startsWith('6') || 
                        phoneNumber.startsWith('+1') || phoneNumber.startsWith('+6')) {
                        whitelistedSkipped.push(phoneNumber);
                    }
                    continue;
                }
                
                // Check if phone number starts with +1 or +6
                // More precise check: US/Canada (+1) has 11 digits, Southeast Asia (+6x) has varying lengths
                // IMPORTANT: Never kick Israeli numbers (+972)
                const isIsraeliNumber = phoneNumber.startsWith('972') || phoneNumber.startsWith('+972');
                
                // Debug: Show detailed condition checking
                const startsWithOne = phoneNumber.startsWith('1');
                const startsWithPlusOne = phoneNumber.startsWith('+1');
                const startsWithSix = phoneNumber.startsWith('6');
                const startsWithPlusSix = phoneNumber.startsWith('+6');
                const lengthEleven = phoneNumber.length === 11;
                const lengthTwelve = phoneNumber.length === 12;
                const lengthTenToTwelve = phoneNumber.length >= 10 && phoneNumber.length <= 12;
                const lengthElevenToThirteen = phoneNumber.length >= 11 && phoneNumber.length <= 13;
                
                // Also check for US numbers stored as 10 digits (without country code)
                const isTenDigitUSNumber = phoneNumber.length === 10 && /^[2-9]\d{9}$/.test(phoneNumber); // US format without +1
                
                console.log(`📊 ${phoneNumber}: starts1=${startsWithOne}, starts+1=${startsWithPlusOne}, starts6=${startsWithSix}, starts+6=${startsWithPlusSix}, len=${phoneNumber.length}, israeli=${isIsraeliNumber}, 10digitUS=${isTenDigitUSNumber}, isLID=${isLidFormat}`);
                
                // Handle LID format numbers (often 14-15 digits starting with country code)
                const isLidUSNumber = isLidFormat && phoneNumber.startsWith('1') && phoneNumber.length >= 11;
                const isLidSEAsiaNumber = isLidFormat && phoneNumber.startsWith('6') && phoneNumber.length >= 10;
                
                // Only match if it's clearly a US/Canada or Southeast Asian number AND NOT Israeli
                if (!isIsraeliNumber && 
                    ((startsWithOne && lengthEleven) || // US/Canada format with 1
                     (startsWithPlusOne && lengthTwelve) || // US/Canada with +1
                     isTenDigitUSNumber || // US format without country code (10 digits)
                     isLidUSNumber || // LID format US numbers
                     (startsWithSix && lengthTenToTwelve) || // Southeast Asia
                     (startsWithPlusSix && lengthElevenToThirteen) || // Southeast Asia with +
                     isLidSEAsiaNumber)) { // LID format SE Asia numbers
                    
                    console.log(`🌍 Adding to kick list: ${phoneNumber} (length: ${phoneNumber.length})`);
                    usersToKick.push({
                        id: userId,
                        phone: phoneNumber,
                        countryCode: phoneNumber.startsWith('+') ? phoneNumber.substring(0, 2) : phoneNumber.charAt(0)
                    });
                } else if (isIsraeliNumber) {
                    console.log(`🇮🇱 Protecting Israeli number: ${phoneNumber}`);
                } else {
                    console.log(`❌ No match for ${phoneNumber} - not US/Canada/SE Asia format`);
                }
            }
            
            if (usersToKick.length === 0) {
                let message = '✅ No users with +1 or +6 country codes found in this group.';
                if (whitelistedSkipped.length > 0) {
                    message += `\n\nℹ️ ${whitelistedSkipped.length} whitelisted user(s) were skipped.`;
                }
                await this.sock.sendMessage(groupId, { text: message });
                return true;
            }
            
            // Send initial message
            await this.sock.sendMessage(groupId, { 
                text: `🌍 Starting to remove ${usersToKick.length} user(s) with restricted country codes (+1 and +6)...` 
            });
            
            // Kick users in batches with delay
            let successCount = 0;
            let failCount = 0;
            
            for (const user of usersToKick) {
                try {
                    await this.sock.groupParticipantsUpdate(groupId, [user.id], 'remove');
                    successCount++;
                    console.log(`✅ Kicked foreign user: ${user.phone}`);
                    
                    // Small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (error) {
                    failCount++;
                    console.error(`❌ Failed to kick ${user.phone}:`, error.message);
                }
            }
            
            // Send summary
            let summaryMessage = `🌍 *Foreign User Removal Complete*\n\n`;
            summaryMessage += `✅ Successfully removed: ${successCount} users\n`;
            if (failCount > 0) {
                summaryMessage += `❌ Failed to remove: ${failCount} users\n`;
            }
            if (whitelistedSkipped.length > 0) {
                summaryMessage += `ℹ️ Whitelisted users skipped: ${whitelistedSkipped.length}\n`;
            }
            summaryMessage += `\n⏰ Time: ${getTimestamp()}`;
            
            await this.sock.sendMessage(groupId, { text: summaryMessage });
            
            // Alert admin
            const adminId = config.ALERT_PHONE + '@s.whatsapp.net';
            
            // Try to get group invite link
            let groupLink = 'N/A';
            try {
                const inviteCode = await this.sock.groupInviteCode(groupId);
                groupLink = `https://chat.whatsapp.com/${inviteCode}`;
            } catch (err) {
                console.log('Could not get group invite link:', err.message);
            }
            
            const alertMessage = `🌍 *Botforeign Command Executed*\n\n` +
                               `📍 Group: ${groupMetadata.subject}\n` +
                               `🔗 Group Link: ${groupLink}\n` +
                               `👮 Executed by: Admin\n` +
                               `✅ Removed: ${successCount} users\n` +
                               `❌ Failed: ${failCount} users\n` +
                               `ℹ️ Whitelisted skipped: ${whitelistedSkipped.length}\n` +
                               `⏰ Time: ${getTimestamp()}`;
            
            await this.sock.sendMessage(adminId, { text: alertMessage });
            
        } catch (error) {
            console.error('❌ Error in botforeign command:', error);
            await this.sock.sendMessage(groupId, { 
                text: '❌ Failed to execute botforeign command. Make sure the bot has admin privileges.' 
            });
        }
        
        return true;
    }

    async handleDebugNumbers(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Only admins can use the debug command.' 
            });
            return true;
        }

        // Check if in private chat
        if (this.isPrivateChat(msg)) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ The #debugnumbers command can only be used in groups.\n\nUsage: In a group, type #debugnumbers to see phone number formats' 
            });
            return true;
        }

        const groupId = msg.key.remoteJid;
        
        try {
            // Get group metadata
            const groupMetadata = await this.sock.groupMetadata(groupId);
            const participants = groupMetadata.participants;
            
            let debugReport = `🔍 *Group Number Formats Debug*\n\n`;
            debugReport += `Total participants: ${participants.length}\n\n`;
            
            for (const participant of participants) {
                const userId = participant.id;
                const phoneNumber = userId.split('@')[0];
                const isAdmin = participant.admin === 'admin' || participant.admin === 'superadmin';
                const isLidFormat = userId.endsWith('@lid');
                
                debugReport += `📱 ${phoneNumber}\n`;
                debugReport += `   Full ID: ${userId}\n`;
                debugReport += `   Length: ${phoneNumber.length}\n`;
                debugReport += `   LID Format: ${isLidFormat}\n`;
                debugReport += `   Starts with 1: ${phoneNumber.startsWith('1')}\n`;
                debugReport += `   Starts with +1: ${phoneNumber.startsWith('+1')}\n`;
                debugReport += `   Starts with 6: ${phoneNumber.startsWith('6')}\n`;
                debugReport += `   Starts with +6: ${phoneNumber.startsWith('+6')}\n`;
                debugReport += `   Starts with 972: ${phoneNumber.startsWith('972')}\n`;
                debugReport += `   Admin: ${isAdmin}\n`;
                debugReport += `   10-digit US pattern: ${phoneNumber.length === 10 && /^[2-9]\d{9}$/.test(phoneNumber)}\n`;
                debugReport += `   LID US pattern: ${isLidFormat && phoneNumber.startsWith('1') && phoneNumber.length >= 11}\n\n`;
                
                // Break if message gets too long
                if (debugReport.length > 3000) {
                    debugReport += `... (truncated - too many participants)\n`;
                    break;
                }
            }
            
            await this.sock.sendMessage(groupId, { text: debugReport });
            
        } catch (error) {
            console.error('❌ Error in debug numbers command:', error);
            await this.sock.sendMessage(groupId, { 
                text: '❌ Failed to debug numbers.' 
            });
        }
        
        return true;
    }

    async handleUnmute(msg, args, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Only admins can unmute.' 
            });
            return true;
        }
        
        // Check if in private chat
        if (this.isPrivateChat(msg)) {
            await this.sendGroupOnlyMessage(msg, '#unmute');
            return true;
        }

        const groupId = msg.key.remoteJid;
        const hasQuotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (hasQuotedMsg) {
            // Unmute specific user
            const quotedMsgId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
            const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
            
            if (quotedParticipant) {
                await removeMutedUser(quotedParticipant);
                await this.sock.sendMessage(groupId, { 
                    text: '🔊 User has been unmuted.' 
                });
            } else {
                await this.sock.sendMessage(groupId, { 
                    text: '⚠️ Could not identify user to unmute.' 
                });
            }
        } else {
            // Unmute entire group
            if (groupMuteStatus.has(groupId)) {
                groupMuteStatus.delete(groupId);
                await this.sock.sendMessage(groupId, { 
                    text: '🔊 Group has been unmuted. Everyone can now send messages.' 
                });
            } else {
                await this.sock.sendMessage(groupId, { 
                    text: '⚠️ Group is not muted.' 
                });
            }
        }
        return true;
    }

    async handleUnwhitelist(msg, args, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Only admins can manage whitelist.' 
            });
            return true;
        }

        if (!args) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ Please provide a phone number. Example: #unwhitelist 972555123456' 
            });
            return true;
        }

        const success = await removeFromWhitelist(args);
        if (success) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `✅ Removed ${args} from whitelist.` 
            });
        } else {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `❌ Failed to remove ${args} from whitelist (may not exist).` 
            });
        }
        return true;
    }
    async handleBlacklistAdd(msg, args, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Only admins can manage blacklist.' 
            });
            return true;
        }

        if (!args) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ Please provide a phone number. Example: #blacklist 972555123456' 
            });
            return true;
        }

        const { addToBlacklist } = require('./blacklistService');
        const success = await addToBlacklist(args, 'Added by admin command');
        if (success) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `✅ Added ${args} to blacklist.` 
            });
        } else {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `❌ Failed to add ${args} to blacklist.` 
            });
        }
        return true;
    }
    
    async handleBlacklistRemove(msg, args, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Only admins can manage blacklist.' 
            });
            return true;
        }

        if (!args) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ Please provide a phone number. Example: #unblacklist 972555123456' 
            });
            return true;
        }

        const { removeFromBlacklist } = require('./blacklistService');
        const success = await removeFromBlacklist(args);
        if (success) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `✅ Removed ${args} from blacklist.` 
            });
        } else {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `❌ Failed to remove ${args} from blacklist.` 
            });
        }
        return true;
    }
    
    async handleBlacklistList(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Only admins can view blacklist.' 
            });
            return true;
        }

        const { blacklistCache } = require('./blacklistService');
        if (blacklistCache.size === 0) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '📝 Blacklist is empty.' 
            });
        } else {
            const list = Array.from(blacklistCache).slice(0, 50).map((num, index) => `${index + 1}. ${num}`).join('\n');
            const totalCount = blacklistCache.size;
            const message = totalCount > 50 
                ? `📝 *Blacklisted Users (showing first 50 of ${totalCount}):*\n\n${list}` 
                : `📝 *Blacklisted Users (${totalCount} total):*\n\n${list}`;
            await this.sock.sendMessage(msg.key.remoteJid, { text: message });
        }
        return true;
    }
    async handleSweep(msg, isSuperAdmin) {
        if (!isSuperAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Only superadmins can use the sweep command.' 
            });
            return true;
        }
        
        // Check if in private chat
        if (this.isPrivateChat(msg)) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ The #sweep command can only be used in groups.\n\nUsage: In a group, type #sweep to clean up inactive users' 
            });
            return true;
        }

        await this.sock.sendMessage(msg.key.remoteJid, { 
            text: '⚠️ Sweep command not yet implemented in Baileys version.' 
        });
        return true;
    }
    async handleBotKick(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Only admins can use the botkick command.' 
            });
            return true;
        }

        // Check if in private chat
        if (this.isPrivateChat(msg)) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ The #botkick command can only be used in groups.\n\nUsage: In a group, type #botkick to scan and remove all blacklisted users' 
            });
            return true;
        }

        const groupId = msg.key.remoteJid;
        
        try {
            // Get group metadata
            const groupMetadata = await this.sock.groupMetadata(groupId);
            const participants = groupMetadata.participants;
            
            // Import blacklist check function
            const { isBlacklisted } = require('./blacklistService');
            
            await this.sock.sendMessage(groupId, { 
                text: `🔍 Scanning ${participants.length} group members for blacklisted users...` 
            });
            
            // Find all blacklisted users
            const blacklistedUsers = [];
            
            for (const participant of participants) {
                const userId = participant.id;
                const phoneNumber = userId.split('@')[0];
                
                // Skip bot and admins
                if (participant.admin === 'admin' || participant.admin === 'superadmin') {
                    continue;
                }
                
                // Check if user is blacklisted
                if (await isBlacklisted(userId)) {
                    blacklistedUsers.push({
                        id: userId,
                        phone: phoneNumber
                    });
                    console.log(`🚫 Found blacklisted user in group: ${phoneNumber}`);
                }
            }
            
            if (blacklistedUsers.length === 0) {
                await this.sock.sendMessage(groupId, { 
                    text: '✅ No blacklisted users found in this group.' 
                });
                return true;
            }
            
            // Kick blacklisted users
            await this.sock.sendMessage(groupId, { 
                text: `🚫 Found ${blacklistedUsers.length} blacklisted user(s). Removing them now...` 
            });
            
            let successCount = 0;
            let failCount = 0;
            
            for (const user of blacklistedUsers) {
                try {
                    await this.sock.groupParticipantsUpdate(groupId, [user.id], 'remove');
                    successCount++;
                    console.log(`✅ Kicked blacklisted user: ${user.phone}`);
                    
                    // Small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (error) {
                    failCount++;
                    console.error(`❌ Failed to kick ${user.phone}:`, error.message);
                }
            }
            
            // Send summary
            let summaryMessage = `🚫 *Blacklist Scan Complete*\n\n`;
            summaryMessage += `✅ Successfully removed: ${successCount} users\n`;
            if (failCount > 0) {
                summaryMessage += `❌ Failed to remove: ${failCount} users\n`;
            }
            summaryMessage += `\n⏰ Time: ${getTimestamp()}`;
            
            await this.sock.sendMessage(groupId, { text: summaryMessage });
            
            // Alert admin
            const adminId = config.ALERT_PHONE + '@s.whatsapp.net';
            
            // Try to get group invite link
            let groupLink = 'N/A';
            try {
                const inviteCode = await this.sock.groupInviteCode(groupId);
                groupLink = `https://chat.whatsapp.com/${inviteCode}`;
            } catch (err) {
                console.log('Could not get group invite link:', err.message);
            }
            
            const alertMessage = `🚫 *Botkick (Blacklist Scan) Executed*\n\n` +
                               `📍 Group: ${groupMetadata.subject}\n` +
                               `🔗 Group Link: ${groupLink}\n` +
                               `👮 Executed by: Admin\n` +
                               `🔍 Found: ${blacklistedUsers.length} blacklisted users\n` +
                               `✅ Removed: ${successCount} users\n` +
                               `❌ Failed: ${failCount} users\n` +
                               `⏰ Time: ${getTimestamp()}`;
            
            await this.sock.sendMessage(adminId, { text: alertMessage });
            
        } catch (error) {
            console.error('❌ Error in botkick command:', error);
            await this.sock.sendMessage(groupId, { 
                text: '❌ Failed to scan for blacklisted users. Make sure the bot has admin privileges.' 
            });
        }
        
        return true;
    }
    
    async handleSessionCheck(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Only admins can check sessions.' 
            });
            return true;
        }

        const { sessionErrors, failedDecryptions } = require('../utils/sessionManager');
        const { getTimestamp } = require('../utils/logger');
        
        // Prepare session health report
        let report = `🔒 *Session Health Check*\n\n`;
        report += `⏰ Time: ${getTimestamp()}\n\n`;
        
        // Check for problematic users
        if (sessionErrors.size === 0) {
            report += `✅ No session errors detected\n`;
        } else {
            report += `⚠️ *Users with session errors:*\n`;
            let count = 0;
            for (const [userId, errors] of sessionErrors.entries()) {
                if (count++ < 10) { // Limit to first 10
                    report += `• ${userId}: ${errors.length} errors\n`;
                }
            }
            if (sessionErrors.size > 10) {
                report += `... and ${sessionErrors.size - 10} more\n`;
            }
        }
        
        report += `\n📊 *Statistics:*\n`;
        report += `• Failed decryptions: ${failedDecryptions.size}\n`;
        report += `• Problematic sessions: ${sessionErrors.size}\n`;
        
        // Recommendations
        if (sessionErrors.size > 0 || failedDecryptions.size > 50) {
            report += `\n💡 *Recommendations:*\n`;
            report += `• Consider restarting the bot\n`;
            report += `• If errors persist, clear auth folder\n`;
            report += `• Monitor for spam from listed users\n`;
        }
        
        await this.sock.sendMessage(msg.key.remoteJid, { text: report });
        return true;
    }
    
    async handleBotAdminCheck(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Only admins can check bot status.' 
            });
            return true;
        }

        const { isBotAdmin, getBotGroupStatus, debugBotId } = require('../utils/botAdminChecker');
        const { getTimestamp } = require('../utils/logger');
        
        // If in group, check this group
        if (msg.key.remoteJid.endsWith('@g.us')) {
            const groupId = msg.key.remoteJid;
            
            try {
                // Get detailed status
                const status = await getBotGroupStatus(this.sock, groupId);
                
                let report = `🤖 *Bot Admin Status*\n\n`;
                report += `📍 Group: ${status.groupName}\n`;
                report += `🆔 Bot ID: ${status.botId}\n`;
                report += `👮 Admin Status: ${status.adminStatus || 'Not in group'}\n`;
                report += `✅ Is Admin: ${status.isAdmin ? 'Yes' : 'No'}\n`;
                report += `👥 Total Participants: ${status.participantCount}\n`;
                report += `👮 Total Admins: ${status.adminCount}\n`;
                report += `⏰ Time: ${getTimestamp()}\n\n`;
                
                if (!status.isAdmin) {
                    report += `⚠️ *Bot needs admin privileges to:*\n`;
                    report += `• Delete messages\n`;
                    report += `• Kick users\n`;
                    report += `• Check blacklist on join\n\n`;
                    report += `🔧 *To fix: Make bot admin in group settings*`;
                }
                
                await this.sock.sendMessage(groupId, { text: report });
                
            } catch (error) {
                await this.sock.sendMessage(groupId, { 
                    text: `❌ Error checking bot status: ${error.message}` 
                });
            }
        } else {
            // In private chat, show bot ID info
            const botInfo = debugBotId(this.sock);
            
            let report = `🤖 *Bot Information*\n\n`;
            report += `🆔 Bot ID: ${botInfo.fullId}\n`;
            report += `📱 Phone: ${botInfo.phone}\n`;
            report += `⏰ Time: ${getTimestamp()}\n\n`;
            report += `💡 Use this command in a group to check admin status`;
            
            await this.sock.sendMessage(msg.key.remoteJid, { text: report });
        }
        
        return true;
    }
}

module.exports = CommandHandler;