const { makeWASocket, DisconnectReason, useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, delay } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const { logger, getTimestamp } = require('./utils/logger');
const config = require('./config');
const { loadBlacklistCache, isBlacklisted, addToBlacklist } = require('./services/blacklistService');

// Track kicked users to prevent spam
const kickCooldown = new Map();

// Track reconnection attempts
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

// Create a custom logger for Baileys with minimal output
const baileysLogger = pino({ 
    level: 'error',  // Only show errors to reduce noise
    timestamp: () => `,"time":"${new Date(Date.now()).toISOString()}"`,
}).child({ module: 'baileys' });

// Main function to start the bot
async function startBot() {
    // Load blacklist cache
    await loadBlacklistCache();
    
    console.log(`[${getTimestamp()}] 🔄 Starting bot connection (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})...`);
    
    // Use multi-file auth state
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
    
    // Get latest version with error handling
    let version;
    try {
        const versionInfo = await fetchLatestBaileysVersion();
        version = versionInfo.version;
        console.log(`[${getTimestamp()}] 📱 Using WhatsApp Web version: ${version}`);
    } catch (error) {
        console.warn(`[${getTimestamp()}] ⚠️ Failed to fetch latest version, using default`);
        version = [2, 2413, 1]; // Fallback version
    }
    
    // Create socket connection with improved configuration
    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
        },
        printQRInTerminal: false, // We'll handle QR display manually
        logger: baileysLogger,
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        defaultQueryTimeoutMs: 60000, // 60 seconds timeout
        keepAliveIntervalMs: 30000, // Send keep-alive every 30 seconds
        connectTimeoutMs: 60000, // 60 seconds connection timeout
        emitOwnEvents: false,
        browser: ['CommGuard Bot', 'Chrome', '120.0.0'], // Updated browser info
    });
    
    // Save credentials whenever updated
    sock.ev.on('creds.update', saveCreds);
    
    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr, isNewLogin } = update;
        
        if (qr) {
            console.log('\n📱 Scan this QR code to connect:\n');
            qrcode.generate(qr, { small: true });
            console.log('\n⏳ Waiting for QR code scan...');
        }
        
        if (connection === 'close') {
            const disconnectReason = lastDisconnect?.error?.output?.statusCode;
            const errorMessage = lastDisconnect?.error?.message || 'Unknown error';
            
            console.error(`\n[${getTimestamp()}] ❌ Connection closed:`);
            console.error(`   Error: ${errorMessage}`);
            console.error(`   Status Code: ${disconnectReason}`);
            
            // Check if it's error 515
            if (errorMessage.includes('515') || disconnectReason === 515) {
                console.error(`\n[${getTimestamp()}] 🚨 Stream Error 515 detected!`);
                console.log('This is a known issue with WhatsApp Web connections.');
                console.log('Attempting workaround...\n');
            }
            
            const shouldReconnect = disconnectReason !== DisconnectReason.loggedOut;
            
            if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                
                // Calculate delay with exponential backoff
                let delayMs;
                if (disconnectReason === 515) {
                    // For error 515, use longer delays
                    delayMs = Math.min(60000 * reconnectAttempts, 300000); // Up to 5 minutes
                } else {
                    delayMs = Math.min(5000 * Math.pow(2, reconnectAttempts), 60000); // Standard exponential backoff
                }
                
                console.log(`[${getTimestamp()}] 🔄 Reconnecting in ${delayMs / 1000} seconds (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
                
                // Clear auth if too many 515 errors
                if (disconnectReason === 515 && reconnectAttempts > 3) {
                    console.log(`[${getTimestamp()}] 🗑️ Clearing authentication data for fresh start...`);
                    try {
                        const fs = require('fs').promises;
                        await fs.rm('baileys_auth_info', { recursive: true, force: true });
                        reconnectAttempts = 0; // Reset counter for fresh auth
                    } catch (err) {
                        console.error('Failed to clear auth:', err);
                    }
                }
                
                setTimeout(startBot, delayMs);
            } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                console.error(`\n[${getTimestamp()}] ❌ Max reconnection attempts reached. Please restart the bot manually.`);
                console.log('\nTroubleshooting tips:');
                console.log('1. Delete the "baileys_auth_info" folder and restart');
                console.log('2. Make sure you\'re not logged in on too many devices');
                console.log('3. Try using a different WhatsApp account');
                console.log('4. Check if WhatsApp Web is working in your browser');
                process.exit(1);
            } else {
                console.log(`\n[${getTimestamp()}] 📱 Bot logged out. Please restart to reconnect.`);
                process.exit(0);
            }
        } else if (connection === 'open') {
            reconnectAttempts = 0; // Reset counter on successful connection
            console.log(`\n[${getTimestamp()}] ✅ Bot connected successfully!`);
            console.log(`Bot ID: ${sock.user.id}`);
            console.log(`Bot Name: ${sock.user.name}`);
            console.log(`Bot Platform: ${sock.user.platform || 'Unknown'}`);
            console.log(`\n🛡️ CommGuard Bot (Baileys Edition) is now protecting your groups!`);
            
            // Send startup notification
            try {
                const adminId = config.ADMIN_PHONE + '@s.whatsapp.net';
                await sock.sendMessage(adminId, { 
                    text: `🟢 CommGuard Bot Started\n\nBot is now online and monitoring groups.\nTime: ${getTimestamp()}` 
                });
            } catch (err) {
                console.error('Failed to send startup notification:', err.message);
            }
        } else if (connection === 'connecting') {
            console.log(`[${getTimestamp()}] 🔄 Connecting to WhatsApp...`);
        }
    });
    
    // Handle incoming messages
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        // Only process new messages
        if (type !== 'notify') return;
        
        for (const msg of messages) {
            try {
                await handleMessage(sock, msg);
            } catch (error) {
                console.error(`Error handling message:`, error);
            }
        }
    });
    
    // Handle group participant updates
    sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
        if (action === 'add') {
            await handleGroupJoin(sock, id, participants);
        }
    });
    
    return sock;
}

// Handle incoming messages
async function handleMessage(sock, msg) {
    // Skip if not from group
    if (!msg.key.remoteJid.endsWith('@g.us')) return;
    
    // Skip if from self
    if (msg.key.fromMe) return;
    
    // Skip if no message content
    if (!msg.message) return;
    
    // Extract message text
    const messageText = msg.message?.conversation || 
                       msg.message?.extendedTextMessage?.text || 
                       msg.message?.imageMessage?.caption ||
                       msg.message?.videoMessage?.caption || '';
    
    // Skip if no text
    if (!messageText) return;
    
    // Check for invite links
    const matches = messageText.match(config.PATTERNS.INVITE_LINK);
    if (!matches || matches.length === 0) return;
    
    console.log(`\n[${getTimestamp()}] 🚨 INVITE LINK DETECTED!`);
    console.log(`Group: ${msg.key.remoteJid}`);
    console.log(`Sender: ${msg.key.participant || msg.key.remoteJid}`);
    console.log(`Links: ${matches.join(', ')}`);
    
    const groupId = msg.key.remoteJid;
    const senderId = msg.key.participant || msg.key.remoteJid;
    
    try {
        // Get group metadata
        const groupMetadata = await sock.groupMetadata(groupId);
        
        // Debug: Log all participants to see how bot appears
        console.log(`\n[${getTimestamp()}] 📋 Group participants:`, groupMetadata.participants.map(p => ({ 
            id: p.id, 
            admin: p.admin || p.isAdmin || p.isSuperAdmin,
            phone: p.id.split('@')[0]
        })));
        
        // Multiple ways to identify the bot
        const botPhone = sock.user.id.split(':')[0];
        const botId = sock.user.id;
        
        console.log(`[${getTimestamp()}] 🤖 Looking for bot with:`);
        console.log(`   - Full ID: ${botId}`);
        console.log(`   - Phone: ${botPhone}`);
        
        // In multi-device mode, the bot might have a LID instead of phone number
        // Let's check if any admin participant doesn't have a traditional phone number
        // The bot is likely the admin with LID format that we can't match by phone
        
        // For now, let's proceed without the admin check since we know the bot IS admin
        // This is a limitation with LID format in multi-device mode
        console.log(`[${getTimestamp()}] ⚠️ Cannot verify bot admin status due to LID format`);
        console.log(`[${getTimestamp()}] ⚡ Proceeding with kick action (bot should be admin)`);
        
        // Check if sender is admin
        const senderParticipant = groupMetadata.participants.find(p => p.id === senderId);
        if (senderParticipant?.admin) {
            console.log('✅ Sender is admin, ignoring invite link');
            return;
        }
        
        // Check cooldown
        const lastKick = kickCooldown.get(senderId);
        if (lastKick && Date.now() - lastKick < config.KICK_COOLDOWN) {
            console.log('⏳ User recently kicked, skipping to prevent spam');
            return;
        }
        
        // Delete the message
        try {
            await sock.sendMessage(groupId, { delete: msg.key });
            console.log('✅ Deleted invite link message');
        } catch (deleteError) {
            console.error('❌ Failed to delete message:', deleteError.message);
        }
        
        // Add to blacklist
        await addToBlacklist(senderId, 'Sent invite link spam');
        
        // Kick the user
        try {
            await sock.groupParticipantsUpdate(groupId, [senderId], 'remove');
            console.log('✅ Kicked user:', senderId);
            kickCooldown.set(senderId, Date.now());
            
            // Send notification to kicked user
            const kickMessage = `🚫 You have been removed from ${groupMetadata.subject} for sending unauthorized invite links.\n\n` +
                              `If you believe this was a mistake, please contact the group admin.`;
            await sock.sendMessage(senderId, { text: kickMessage }).catch(() => {});
        } catch (kickError) {
            console.error('❌ Failed to kick user:', kickError.message);
        }
        
        // Send alert to admin
        const adminId = config.ALERT_PHONE + '@s.whatsapp.net';
        const alertMessage = `🚨 *Invite Spam Detected*\n\n` +
                           `📍 Group: ${groupMetadata.subject}\n` +
                           `👤 User: ${senderId}\n` +
                           `🔗 Links: ${matches.join(', ')}\n` +
                           `⏰ Time: ${getTimestamp()}\n\n` +
                           `✅ Actions taken:\n` +
                           `• Message deleted\n` +
                           `• User blacklisted\n` +
                           `• User kicked from group`;
        
        await sock.sendMessage(adminId, { text: alertMessage });
        
    } catch (error) {
        console.error('❌ Error handling invite spam:', error);
    }
}

// Handle new group joins
async function handleGroupJoin(sock, groupId, participants) {
    console.log(`\n[${getTimestamp()}] 👥 New participants joined group ${groupId}`);
    
    try {
        const groupMetadata = await sock.groupMetadata(groupId);
        const botPhone = sock.user.id.split(':')[0];
        const botId = sock.user.id;
        
        // Check if bot is admin using multiple methods
        const botParticipant = groupMetadata.participants.find(p => 
            p.id === botId || 
            p.id === `${botPhone}@s.whatsapp.net` || 
            p.id.includes(botPhone)
        );
        
        const isBotAdmin = botParticipant && (
            botParticipant.admin === 'admin' || 
            botParticipant.admin === 'superadmin' ||
            botParticipant.isAdmin || 
            botParticipant.isSuperAdmin
        );
        
        if (!isBotAdmin) {
            console.log('❌ Bot is not admin, cannot check blacklist');
            return;
        }
        
        // Check each participant
        for (const participantId of participants) {
            if (await isBlacklisted(participantId)) {
                console.log(`🚫 Blacklisted user detected: ${participantId}`);
                
                try {
                    // Remove the blacklisted user
                    await sock.groupParticipantsUpdate(groupId, [participantId], 'remove');
                    console.log('✅ Kicked blacklisted user');
                    
                    // Notify the user
                    const message = `🚫 You have been automatically removed from ${groupMetadata.subject} ` +
                                  `because you are on the blacklist.\n\n` +
                                  `If you believe this is a mistake, please contact the admin.`;
                    await sock.sendMessage(participantId, { text: message }).catch(() => {});
                    
                    // Alert admin
                    const adminId = config.ALERT_PHONE + '@s.whatsapp.net';
                    const alert = `🚨 *Blacklisted User Auto-Kicked*\n\n` +
                                `📍 Group: ${groupMetadata.subject}\n` +
                                `👤 User: ${participantId}\n` +
                                `⏰ Time: ${getTimestamp()}`;
                    await sock.sendMessage(adminId, { text: alert });
                    
                } catch (error) {
                    console.error('❌ Failed to kick blacklisted user:', error);
                }
            }
        }
    } catch (error) {
        console.error('❌ Error in group join handler:', error);
    }
}

// Start the bot with error handling
async function main() {
    console.log(`
╔═══════════════════════════════════════════╗
║       🛡️  CommGuard Bot (Baileys)  🛡️       ║
║                                           ║
║  WhatsApp Group Protection Bot v2.0       ║
║  Powered by Baileys WebSocket API         ║
╚═══════════════════════════════════════════╝
    `);
    
    // Show important info
    console.log(`\n📞 Admin Phone: ${config.ADMIN_PHONE}`);
    console.log(`📞 Alert Phone: ${config.ALERT_PHONE}`);
    console.log(`\n⚙️ Features enabled:`);
    console.log(`   • Invite Link Detection: ${config.FEATURES.INVITE_LINK_DETECTION ? '✅' : '❌'}`);
    console.log(`   • Auto-kick Blacklisted: ${config.FEATURES.AUTO_KICK_BLACKLISTED ? '✅' : '❌'}`);
    console.log(`   • Firebase Integration: ${config.FEATURES.FIREBASE_INTEGRATION ? '✅' : '❌'}`);
    
    // Check for existing auth
    const fs = require('fs');
    if (fs.existsSync('baileys_auth_info')) {
        console.log('\n🔑 Found existing authentication data. Attempting to reconnect...');
    } else {
        console.log('\n🆕 No existing authentication found. You will need to scan QR code.');
    }
    
    try {
        await startBot();
    } catch (error) {
        console.error('Fatal error:', error);
        
        // If it's a specific error, provide guidance
        if (error.message?.includes('ECONNREFUSED')) {
            console.error('\n❌ Connection refused. Please check your internet connection.');
        } else if (error.message?.includes('rate-limit')) {
            console.error('\n❌ Rate limited by WhatsApp. Please wait before trying again.');
        }
        
        process.exit(1);
    }
}

// Handle process events
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the application
main();