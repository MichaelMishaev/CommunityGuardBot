// inviteMonitor.js
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { addToWhitelist, removeFromWhitelist, listWhitelist } = require('./services/whitelistService');
const { addToBlacklist, removeFromBlacklist, listBlacklist, isBlacklisted } = require('./services/blacklistService');
const { addMutedUser, removeMutedUser, loadMutedUsers } = require('./services/muteService');
const { jidKey } = require('./utils/jidUtils');

// Add timestamp helper function
function getTimestamp() {
  return new Date().toLocaleString('en-GB', { timeZone: 'Asia/Jerusalem' });
}

console.log(`[${getTimestamp()}] 🚀 Bot starting... initializing WhatsApp Web`);

const { translate } = require('@vitalets/google-translate-api');

// ─────────── Firestore & Command Cache Setup ───────────
// Firestore configuration
const db = require('./firebaseConfig');

//for mute logic
let mutedUsers = new Map();
const mutedMsgCounts  = new Map();


// Firestore reference and in-memory cache
let cachedCommands = {};
const startTime = Date.now();
// load all commands from Firestore into cache
async function loadCommands() {
  try {
    const snapshot = await db.collection('commands').get();
    cachedCommands = {};
    snapshot.forEach(doc => {
      const cmd = doc.data().cmd.trim().toLowerCase();
      cachedCommands[cmd] = doc.data();
    });
    console.log(`[${getTimestamp()}] 📥 Commands loaded:`, Object.keys(cachedCommands));
  } catch (e) {
    console.error(`[${getTimestamp()}] ❌ failed to load commands:`, e);
  }
}
// ───────────────────────────────────────────────────────



/* ───────────────── BOT CLIENT ───────────────── */
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer'
    ]
  }
});

/* ───────────── ONE-TIME LOGIN HELPERS ───────────── */
client.on('qr', qr => {
  console.log(`[${getTimestamp()}] [DEBUG] QR code received, generating…`);
  qrcode.generate(qr, { small: true });
  console.log(`[${getTimestamp()}] 📱  Scan the QR code above to log in.`);
});

client.on('authenticated', () => console.log(`[${getTimestamp()}] ✅  Authenticated!`));
client.on('ready', async () => {
  console.log(`[${getTimestamp()}] ✅  Bot is ready and logged in!`);
  console.log(`
   ██████╗░░█████╗░███╗░░░███╗░█████╗░██╗░░░██╗██╗░░░░░███████╗
  ██╔════╝░██╔══██╗████╗░████║██╔══██╗██║░░░██║██║░░░░░██╔════╝
  ██║░░██╗░██║░░██║██╔████╔██║███████║██║░░░██║██║░░░░░█████╗░░
  ██║░░╚██╗██║░░██║██║╚██╔╝██║██╔══██║██║░░░██║██║░░░░░██╔══╝░░
  ╚██████╔╝╚█████╔╝██║░╚═╝░██║██║░░██║╚██████╔╝███████╗███████╗
  ░╚═════╝░░╚════╝░╚═╝░░░░░╚═╝╚═╝░░╚═╝░╚═════╝░╚══════╝╚══════╝
    🤖 CommunityGuard is now watching for group invite links…
  `);
    // first load commands from Firestore
    await loadCommands();
    
   mutedUsers = await loadMutedUsers();
   console.log(`[${getTimestamp()}] ✅ Mute list loaded`);

   console.log(`[${getTimestamp()}] Version 1.0.9 - LID Support Update`);
   console.log(`[${getTimestamp()}] ✅  Bot is ready, commands cache populated!`);
});
client.on('auth_failure', e => console.error(`[${getTimestamp()}] ❌  AUTH FAILED`, e));

/* ───────────── CONFIGURATION ───────────── */
const ADMIN_PHONE = '972555020829';
const ADMIN_LID = '972555020829';
const ALERT_PHONE = '972544345287';
// Store whitelist as JIDs so it also matches new @lid accounts
const WHITELIST   = new Set([ jidKey(ADMIN_PHONE), jidKey(ALERT_PHONE) ]);

// Helper to produce a user‐readable label (number if available, otherwise JID)
function describeContact(contact) {
  if (!contact) return '[unknown]';
  // Prefer the full JID (works for both legacy and LID accounts)
  const jid = contact.id?._serialized || contact._serialized;
  // Fallback to legacy phone‐based number if still present
  return jid || contact.number || '[unknown]';
}

// Enhanced helper to get participant JID with LID support
function getParticipantJid(participant) {
  // For LID users, the JID might be in different formats
  if (participant.id?._serialized) {
    return participant.id._serialized;
  }
  if (participant._serialized) {
    return participant._serialized;
  }
  if (participant.id?.user) {
    // Handle LID format (e.g., "123456@lid")
    const server = participant.id.server || 'c.us';
    return `${participant.id.user}@${server}`;
  }
  return null;
}

// Enhanced helper to get message author with LID support
function getMessageAuthor(msg) {
  // Try multiple ways to get the author
  // For group messages, author contains the sender's JID
  if (msg.author) return msg.author;
  
  // For direct messages or when author is not set
  if (msg.from) {
    // If it's a group message, extract participant
    if (msg.from.includes('@g.us') && msg.id?.participant) {
      return msg.id.participant;
    }
    return msg.from;
  }
  
  // Fallback to participant if available
  if (msg.id?.participant) return msg.id.participant;
  
  // Last resort - check if message has _data with author
  if (msg._data?.author) return msg._data.author;
  
  return null;
}

/* ───────────── UNIFIED message_create HANDLER ───────────── */

function cleanPhoneNumber(phone) {
  // Remove any Unicode invisible characters (LRM, RLM, etc.)
  const normalized = phone.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');
  // Remove plus, spaces, dashes, and any other formatting characters
  return normalized.replace(/[+\s-]/g, '');
}

client.on('message_create', async msg => {
  // strip bidi chars & normalise
  const cleaned  = msg.body.replace(/\u200e/g, '').trim();
  const lowered  = cleaned.toLowerCase();
  // split into all parts, shift off the command, then re-join the rest:
  const parts = lowered.split(/\s+/);
  const cmd   = parts.shift();
  const arg   = parts.join(' ');

    if (cmd === '#mute' && !msg.hasQuotedMsg) {
    // Check if the message is from an admin
    console.log(`[${getTimestamp()}] 🔊 Mute command received`);
    const chat = await msg.getChat();
    const sender = await msg.getContact();

    if (!chat.isGroup) {
      await msg.reply('⚠️ This command can only be used in groups.');
      return;
    }

    const senderJid = getParticipantJid(sender);
    const isAdmin = chat.participants.some(p => {
      const pJid = getParticipantJid(p);
      return pJid === senderJid && p.isAdmin;
    });
    
    if (!isAdmin) {
      await msg.reply('🚫 You must be an admin to mute the group.');
      return;
    }

    // Validate the mute duration
 
    if (!arg || isNaN(parseInt(arg, 10)) || parseInt(arg, 10) <= 0) {
      await msg.reply('⚠️ Please specify a valid number of minutes. Example: #mute 10');
      return;
    }

    // Mute the group (admin-only messages)
    try {
      await chat.sendMessage(`🔇 הקבוצה הושתקה למשך ${arg} דקות.`);

      await chat.setMessagesAdminsOnly(true);

      console.log(`[${getTimestamp()}] ✅ Group muted for ${arg} minutes by ${sender.pushname}`);

      // Set a timeout to unmute after the specified duration
      setTimeout(async () => {
        await chat.setMessagesAdminsOnly(false);
        //await chat.sendMessage('🔊 Group has been unmuted.');
        console.log(`[${getTimestamp()}] ✅ Group unmuted automatically after timeout.`);
      }, parseInt(arg, 10) * 60000); // Convert minutes to milliseconds
    } catch (err) {
      await msg.reply('❌ Failed to mute the group.');
      console.error(`[${getTimestamp()}] Mute error:`, err.message);
    }
    return;
  }

  // ─────── Mute Specific User via Reply (#mute [minutes]) ───────

// Mute Specific User via Reply (#mute [minutes])
if (msg.hasQuotedMsg && cmd === '#mute') {
    try {
        const chat = await msg.getChat();
        const sender = await msg.getContact();
        let quotedMsg;
              try {
                  quotedMsg = await msg.getQuotedMessage();
                  if (!quotedMsg) throw new Error('Quoted message not found');
              } catch (err) {
                  console.error('❌ Could not retrieve quoted message:', err.message);
                  await msg.reply('⚠️ Unable to retrieve the quoted message. Please try again.');
                  return;
              }

        // Check if the message is from a group and the sender is an admin
        if (!chat.isGroup) {
            await msg.reply('⚠️ This command can only be used in groups.');
            return;
        }

        const senderJid = getParticipantJid(sender);
        const isAdmin = chat.participants.some(p => {
            const pJid = getParticipantJid(p);
            return pJid === senderJid && p.isAdmin;
        });

        if (!isAdmin) {
            await msg.reply('🚫 You must be an admin to mute a user.');
            return;
        }

        // Validate mute duration (minutes or days)
        let muteDurationMs;
        if (!isNaN(arg)) {
            // Only minutes provided
            muteDurationMs = parseInt(arg, 10) * 60000;
        } else {
            const [mm, dd] = arg.split(' ');
            const minutes = parseInt(mm, 10);
            const days = parseInt(dd, 10) || 0;
            muteDurationMs = (minutes * 60000) + (days * 86400000); // Convert to ms
        }

        if (isNaN(muteDurationMs) || muteDurationMs <= 0) {
            await msg.reply('⚠️ Please specify a valid number of minutes or days. Example: #mute 10 or #mute 10 2');
            return;
        }

        // Get the target user from the replied-to message
        const target = getMessageAuthor(quotedMsg);
        if (!target) {
            await msg.reply('⚠️ Unable to identify the user to mute.');
            return;
        }

        // Ensure the bot is an admin - find bot by checking isMe property
        let botParticipant = null;
        let botJid = null;
        
        // Method 1: Find participant with isMe property
        for (const p of chat.participants) {
            try {
                const contact = await client.getContactById(getParticipantJid(p));
                if (contact.isMe) {
                    botParticipant = p;
                    botJid = getParticipantJid(p);
                    console.log(`[${getTimestamp()}] Found bot via isMe: ${botJid}`);
                    break;
                }
            } catch (e) {
                // Continue checking other participants
            }
        }
        
        // Method 2: If not found, try using client.info
        if (!botParticipant && client.info && client.info.wid) {
            const testJid = client.info.wid._serialized || client.info.wid;
            botParticipant = chat.participants.find(p => {
                const pJid = getParticipantJid(p);
                return pJid === testJid || pJid === jidKey(testJid);
            });
            if (botParticipant) {
                botJid = getParticipantJid(botParticipant);
                console.log(`[${getTimestamp()}] Found bot via client.info: ${botJid}`);
            }
        }
        
        if (!botParticipant || !botParticipant.isAdmin) {
            console.log(`[${getTimestamp()}] Bot admin check failed.`);
            console.log(`[${getTimestamp()}] Bot found: ${botParticipant ? 'Yes' : 'No'}`);
            console.log(`[${getTimestamp()}] Bot JID: ${botJid || 'Not found'}`);
            console.log(`[${getTimestamp()}] Bot is admin: ${botParticipant ? botParticipant.isAdmin : 'N/A'}`);
            await msg.reply('⚠️ The bot must be an admin to mute users.');
            return;
        }

        // Calculate mute expiration time
        const muteUntil = Date.now() + muteDurationMs;

        // Save to in-memory map and Firestore
        mutedUsers.set(target, muteUntil);
        await addMutedUser(target, muteUntil);

        // Send confirmation message
        try {
          await client.sendMessage(
            msg.from,
            `🔇 @${target.split('@')[0]} 🔒 ⛔ ⏳`
          );
        } catch (e) {
          console.error('⚠️ Failed to send mute confirmation:', e.message);
        }

        console.log(`✅ User @${target.split('@')[0]} muted for ${arg}`);

        const parts = arg.split(' ');
        let durationText;
        if (parts.length === 1) {
          const mins = parseInt(parts[0], 10);
          durationText = `${mins} minute${mins !== 1 ? 's' : ''}`;
        } else {
          const mins = parseInt(parts[0], 10);
          const days = parseInt(parts[1], 10);
          durationText = `${days} day${days !== 1 ? 's' : ''} and ${mins} minute${mins !== 1 ? 's' : ''}`;
        }

        const warningMessage = [
          `❗ הינך חסום לשליחת הודעות למשך ${durationText}. המשך שליחת הודעות במהלך תקופת ההגבלה עשוי להוביל לחסימה.`,
          `🕰️ תקבל הודעה כאשר המגבלה תוסר.`,
          `------------------------------`,
          `🔇 You have been restricted from sending messages for ${durationText}.`,
          `🚫 Continuing to send messages during the restriction period may result in a ban.`,
          `🕰️ You will receive a notification once the restriction is lifted.`,
          `------------------------------`,

          `❗ Вы ограничены в отправке сообщений на ${durationText}. Продолжение отправки сообщений во время действия ограничения может привести к блокировке.`,
          `🕰️ Вы получите уведомление, когда ограничение будет снято.`,
          `------------------------------`,
          `❗ Vous êtes restreint d'envoyer des messages pendant ${durationText}. Continuer à envoyer des messages pendant la période de restriction peut entraîner une interdiction.`,
          `🕰️ Vous recevrez une notification une fois la restriction levée.`,
          `------------------------------`
      ].join('\n');
      

        await client.sendMessage(target, warningMessage);
        console.log(`📩 Private mute warning sent to ${target} for ${durationText}`);

              // ─── schedule auto-unmute ────────────
              setTimeout(async () => {
                try {
                    // Remove from in-memory map
                    mutedUsers.delete(target);
            
                    // Remove from Firestore
                    await removeMutedUser(target);
            
                    // Log unmute action
                    console.log(`✅ User @${target.split('@')[0]} automatically unmuted after timeout.`);
            
                    // Send a message to the user informing that the restriction has been lifted
                    const unmuteMessage = [
                        `✅ המגבלה על שליחת הודעות הוסרה.`,
                        `💬 כעת באפשרותך להמשיך להשתתף בקבוצה.`,
                        `------------------------------`,
                         `🔓 Your restriction from sending messages has been lifted.`,
                        `💬 You may now continue participating in the group.`,
                        `------------------------------`,
                        `✅ Ограничение на отправку сообщений снято.`,
                        `💬 Вы можете продолжить участие в группе.`,
                        `------------------------------`,
                        `✅ La restriction d'envoi de messages a été levée.`,
                        `💬 Vous pouvez maintenant continuer à participer au groupe.`,
                        `------------------------------`
                    ].join('\n');
            
                    // Send the unmute message to the user
                    await client.sendMessage(target, unmuteMessage);
                    console.log(`📩 Unmute notification sent to @${target.split('@')[0]}`);
                } catch (err) {
                    console.error(`❌ Failed to send unmute message: ${err.message}`);
                }
            }, muteDurationMs);
            

    } catch (err) {
        console.error('❌ Mute error:', err.message);
        await msg.reply('❌ Failed to mute the user.');
    }
    return;
}

// ───────────── #botkick COMMAND (Fixed for LID) ─────────────

if (cmd === '#botkick') {
  try {
      const chat = await msg.getChat();
      if (!chat.isGroup) {
          await msg.reply('⚠️ This command can only be used in groups.');
          return;
      }

      // Check if the user who sent the command is an admin
      const sender = await msg.getContact();
      const senderJid = getParticipantJid(sender);

      const isAdmin = chat.participants.some(p => {
          const pJid = getParticipantJid(p);
          return pJid === senderJid && p.isAdmin;
      });
    
      if (!isAdmin) {
          await msg.reply('🚫 You must be an admin to execute this command.');
          return;
      }

      // Check if bot is admin - find bot by checking isMe property
      let botIsAdmin = false;
      for (const p of chat.participants) {
          try {
              const contact = await client.getContactById(getParticipantJid(p));
              if (contact.isMe && p.isAdmin) {
                  botIsAdmin = true;
                  break;
              }
          } catch (e) {
              // Continue checking
          }
      }

      if (!botIsAdmin) {
          await msg.reply('⚠️ The bot must be an admin to kick users.');
          return;
      }

      let kickedUsers = [];
      for (const participant of chat.participants) {
        const participantJid = getParticipantJid(participant);
        if (!participantJid) continue;
        
        const contact = await client.getContactById(participantJid).catch(() => null);
        const userLabel = describeContact(contact);

        if (!await isBlacklisted(participantJid)) continue;

        // don't kick other admins
        if (participant.isAdmin) {
          console.log(`[${getTimestamp()}] ⚠️ Cannot kick admin user: ${userLabel}`);
          await client.sendMessage(
            `${ALERT_PHONE}@c.us`,
            `⚠️ Cannot kick blacklisted user ${userLabel}: user is an admin.`
          );
          continue;
        }

        try {
          // remove them
          await chat.removeParticipants([participantJid]);

          // assume success if no exception
          kickedUsers.push(userLabel);

          // DM them the kick notice
          const kickMessage = [
            '🚫 הוסרת מהקבוצה מכיוון שמזהה המשתמש שלך מופיע ברשימה השחורה.',
            '❗ אם אתה חושב שמדובר בטעות, נא לשלוח הודעת תגובה על הודעה זו.',
            '🔓 המנהל יבדוק את בקשתך.'
          ].join('\n');
          await client.sendMessage(participantJid, kickMessage);

          console.log(`[${getTimestamp()}] ✅ Kicked blacklisted user: ${userLabel}`);
        } catch (err) {
          console.error(`[${getTimestamp()}] ❌ Failed to kick ${userLabel}:`, err.message);
          await client.sendMessage(
            `${ALERT_PHONE}@c.us`,
            `❌ Failed to kick blacklisted user ${userLabel}: ${err.message}`
          );
        }
      }
      

      // Prepare and send the summary message to the ALERT_PHONE
      const alertMessage = kickedUsers.length > 0
          ? [
              '🚨 *Spam Kick Report:*',
              `✅ Removed ${kickedUsers.length} blacklisted users from group: ${chat.name}`,
              `📌 Kicked Users:`,
              ...kickedUsers.map(label => `- ${label}`)
          ].join('\n')
          : [
              '🚨 *Spam Kick Report:*',
              `✅ No blacklisted users found in the group: ${chat.name}`
          ].join('\n');

      await client.sendMessage(`${ALERT_PHONE}@c.us`, alertMessage);
      
      // If users were kicked, send unblacklist info
      if (kickedUsers.length > 0) {
          await client.sendMessage(`${ALERT_PHONE}@c.us`, 
              '🔄 To unblacklist any user, use the format:\n#unblacklist [number or JID]');
      }

  } catch (err) {
      console.error('❌ Error executing #botkick:', err.message);
      await msg.reply('🚫 Failed to complete the spam check.');
  }
  return;
}



  if (cleaned === '#commands') {
    try {
      // Check if there are any loaded commands
      if (Object.keys(cachedCommands).length === 0) {
        await msg.reply('📝 No custom commands available.');
        return;
      }

      // Prepare the list of dynamic commands from Firestore
      const dynamicCommands = Object.keys(cachedCommands).map(cmd => 
        `- ${cmd} - ${cachedCommands[cmd].description || 'No description'}`
      ).join('\n');

      const response = [
        '📝 *Custom Commands:*',
        dynamicCommands
      ].join('\n');

      // Reply with the list of loaded commands
      await msg.reply(response);
    } catch (e) {
      console.error(`[${getTimestamp()}] ❌ Error fetching custom commands:`, e);
      await msg.reply('🚫 Failed to retrieve custom commands.');
    }
    return;
  }


//GETS LIST HELP
if (cleaned === '#help') {
  try {
    // Prepare a list of available commands
    const builtInCommands = [
      '📝 *Available Commands:*',
      '',
      '*🔧 Admin Commands:*',
      '1. *#status* - Check the current status of the bot',
      '2. *#reload* - Reload all commands from Firestore',
      '3. *#whitelist [number]* - Add a number to the whitelist\n   (e.g., #whitelist 972555123456)',
      '4. *#unwhitelist [number]* - Remove a number from the whitelist\n   (e.g., #unwhitelist 972555123456)',
      '5. *#whitelst* - List all whitelisted numbers',
      '',
      '*🚫 Blacklist Commands:*',
      '6. *#blacklist [number]* - Manually add a number to the blacklist\n   (e.g., #blacklist 972555123456)',
      '7. *#unblacklist [number]* - Remove a number from the blacklist\n   (e.g., #unblacklist 972555123456)',
      '8. *#blacklst* - List all blacklisted numbers',
      '',
      '*🚨 Group Management Commands:*',
      '9. *#kick* - Kick a user from the group (reply to a message)',
      '10. *#cf* - Check for foreign numbers in the group',
      '11. *#mute [minutes]* - Mute the entire group for the specified number of minutes\n    (admin only)',
      '12. *#mute (reply) [minutes]* - Mute a specific user for the specified number of minutes\n    (admin only), kicked out if they send more than 3 messages while muted',
      '13. *#botkick* - Automatically kick out all blacklisted users from the current group',
      '14. *#warn* - Send a warning to a user (reply to their message, admin only)',
      '15. *#clear* - Delete last 10 messages from a user (reply to their message OR use #clear [JID/number])',
      '16. *#cleartest* - Test bot\'s message deletion capabilities (admin only)',
      '17. *#cleardebug* - Debug message author detection (reply to message)',
      '',
      '*👑 Super Admin Commands:*',
      '18. *#promote* - Promote a user to admin (reply to their message, super admin only)',
      '19. *#demote* - Demote an admin to regular user (reply to their message, super admin only)',
      '',
      '*📢 Communication Commands:*',
      '20. *#announce [message]* - Send an announcement to all group members (admin only)',
      '21. *#pin [days]* - Pin a message (reply to message, default 7 days, admin only)',
      '22. *#translate* - Translate a message to Hebrew (reply to message or provide text)',
      '',
      '*📊 Information Commands:*',
      '23. *#stats* - Show group statistics (member count, admin count, etc.)',
      '24. *#commands* - Display all loaded custom commands from Firestore',
      '25. *#help* - Show this help message',
      '',
      '*🔄 Recovery Commands:*',
      '26. *#unb [number]* - Unban a previously banned number\n    (e.g., #unb 972555123456), must be as a reply to a bot message',
      '',
      '💡 *Note:* Use these commands responsibly to ensure group safety and proper user behavior.',
      '⚠️ *WhatsApp URLs:* When someone posts a WhatsApp group link, they are automatically kicked and blacklisted.',
    ];

    // Add dynamically loaded commands from Firestore
    const dynamicCommands = Object.keys(cachedCommands).map(cmd => `- ${cmd} - ${cachedCommands[cmd].description}`);
    const allCommands = builtInCommands.concat(dynamicCommands);

    // Construct the response message
    const response = [
      '📝 *Available Commands:*',
      ...allCommands
    ].join('\n');

    // Reply with the list of commands
    await msg.reply(response);
  } catch (e) {
    console.error(`[${getTimestamp()}] ❌ Error fetching commands:`, e);
    await msg.reply('🚫 Failed to retrieve the command list.');
  }
  return;
}

// Inside your unified message_create handler
if (msg.from === `${ALERT_PHONE}@c.us` && cleaned === '#status') {
  const uptimeMs = Date.now() - startTime;
  const uptimeHours = Math.floor(uptimeMs / 3600000);
  const uptimeMins = Math.floor((uptimeMs % 3600000) / 60000);
  const cmdsLoaded = Object.keys(cachedCommands).length;
  const autoReload = false;  // We decided not to auto-reload
  const activeGroups = (await client.getChats()).filter(chat => chat.isGroup).length;

  // Get the number of whitelisted numbers
  const whitelistCount = await listWhitelist().then(list => list.length);

  const status = [
      '🤖 Bot Status:',
      `- ⏱️ Uptime: ${uptimeHours} hours ${uptimeMins} minutes`,
      `- 🟢 Active Groups: ${activeGroups}`,
      `- 📋 Commands Loaded: ${cmdsLoaded}`,
      `- 🔄 Auto-reload: ${autoReload ? 'On' : 'Off'}`,
      `- ✅ Whitelisted Numbers: ${whitelistCount}`
  ].join('\n');

  await msg.reply(status);
  return;
}


  /* ------------------------------------------------------------------
     1) ADMIN-ONLY COMMANDS  (must come from ALERT_PHONE chat)
  ------------------------------------------------------------------ */
  if (msg.from === `${ALERT_PHONE}@c.us`) {

      // ─── Manual "unb" via reply ───────────────────────────────
  if (msg.hasQuotedMsg && lowered === '#unb') {
    // 1) fetch the quoted message
    const quoted = await msg.getQuotedMessage();
    // 2) extract the phone number from the alert text
    const m = quoted.body.match(/Number:\s*\+?(\d+)/);
    if (!m) {
      await msg.reply('⚠️ לא מצאתי מספר בטקסט המצוטט כדי להסיר מהרשימה השחורה.');
      return;
    }
    const phone = m[1];  // e.g. "972555123456"
    // 3) remove from blacklist
    if (await removeFromBlacklist(phone)) {
      await msg.reply(`✅ המספר +${phone} הוסר מהרשימה השחורה.`);
    } else {
      await msg.reply(`ℹ️ המספר +${phone} לא נמצא ברשימה השחורה.`);
    }
    return;
  }


  
    switch (cmd) {

      // 🔄 reload Firestore-defined commands
      case '#reload':
        await loadCommands();
        await msg.reply([
          '🔄 Command Reload',
          '✅ Commands reloaded successfully!'
        ].join('\n'));
        return;

      // ✅ add number to whitelist
      case '#whitelist':
        if (!arg) {
          await msg.reply([
            '⚠️ Whitelist Command Error',
            '🚫 Missing phone number.',
            '💡 Usage: #whitelist 972555123456'
          ].join('\n'));
          return;
        }
        const targetJid = jidKey(arg);
        if (!targetJid) {
          await msg.reply('⚠️ Invalid identifier. Please supply a valid JID or phone number.');
          return;
        }

        if (await addToWhitelist(targetJid)) {
          await msg.reply([
            '✅ Whitelist Update',
            `👤 ID: ${targetJid}`,
            '📝 Status: Added to whitelist'
          ].join('\n'));
        } else {
          await msg.reply([
            'ℹ️ Whitelist Info',
            `👤 ID: ${targetJid}`,
            '📝 Status: Already whitelisted'
          ].join('\n'));
        }
        return;

      // ✅ remove number from whitelist
      case '#unwhitelist':
        if (!arg) {
          await msg.reply([
            '⚠️ Unwhitelist Command Error',
            '🚫 Missing phone number.',
            '💡 Usage: #unwhitelist 972555123456'
          ].join('\n'));
          return;
        }
        const targetJidUW = jidKey(arg);
        if (!targetJidUW) {
          await msg.reply('⚠️ Invalid identifier. Please supply a valid JID or phone number.');
          return;
        }

        if (await removeFromWhitelist(targetJidUW)) {
          await msg.reply([
            '✅ Whitelist Update',
            `👤 ID: ${targetJidUW}`,
            '📝 Status: Removed from whitelist'
          ].join('\n'));
        } else {
          await msg.reply([
            '⚠️ Whitelist Info',
            `👤 ID: ${targetJidUW}`,
            '🚫 Status: Not found in whitelist'
          ].join('\n'));
        }
        return;

      // 📋 list all whitelisted numbers
      case '#whitelst':
        const numbers = await listWhitelist();
        await msg.reply(
          numbers.length
            ? ['📝 Whitelisted Numbers:', ...numbers.map(n => `- ${n}`)].join('\n')
            : ['📝 Whitelist Status', '🚫 No numbers are currently whitelisted.'].join('\n')
        );
        return;
      // ✅ add number to blacklist
        case '#blacklist':
          if (!arg) {
            await msg.reply([
              '⚠️ Blacklist Command Error',
              '🚫 Missing phone number.',
              '💡 Usage: #blacklist 972555123456'
            ].join('\n'));
            return;
          }
          const targetJidBL = jidKey(arg);
          if (!targetJidBL) {
            await msg.reply('⚠️ Invalid identifier. Please supply a valid JID or phone number.');
            return;
          }

          if (await addToBlacklist(targetJidBL)) {
            await msg.reply([
              '✅ Blacklist Update',
              `👤 ID: ${targetJidBL}`,
              '🚫 Status: Added to blacklist'
            ].join('\n'));
            console.log(`✅ Manually blacklisted: ${targetJidBL}`);
          } else {
            await msg.reply([
              'ℹ️ Blacklist Info',
              `👤 ID: ${targetJidBL}`,
              '🚫 Status: Already blacklisted'
            ].join('\n'));
          }
          return;

          // ✅ remove number from blacklist
          case '#unblacklist':
            if (!arg) {
              await msg.reply([
                '⚠️ Unblacklist Command Error',
                '🚫 Missing phone number.',
                '💡 Usage: #unblacklist 972555123456'
              ].join('\n'));
              return;
            }
            const targetJidUBL = jidKey(arg);
            if (!targetJidUBL) {
              await msg.reply('⚠️ Invalid identifier. Please supply a valid JID or phone number.');
              return;
            }

            if (await removeFromBlacklist(targetJidUBL)) {
              await msg.reply([
                '✅ Blacklist Update',
                `👤 ID: ${targetJidUBL}`,
                '📝 Status: Removed from blacklist'
              ].join('\n'));
              console.log(`✅ Manually unblacklisted: ${targetJidUBL}`);
            } else {
              await msg.reply([
                '⚠️ Blacklist Info',
                `👤 ID: ${targetJidUBL}`,
                '🚫 Status: Not found in blacklist'
              ].join('\n'));
            }
            return;

            // 📋 list all blacklisted numbers
            case '#blacklst':
              const blacklistedNumbers = await listBlacklist();
              await msg.reply(
                blacklistedNumbers.length
                  ? ['📝 Blacklisted Numbers:', ...blacklistedNumbers.map(n => `- ${n}`)].join('\n')
                  : ['📝 Blacklist Status', '🚫 No numbers are currently blacklisted.'].join('\n')
              );
              return;

            }
  }

  /* ------------------------------------------------------------------
     2) FIRESTORE CUSTOM COMMANDS  (anyone can trigger)
  ------------------------------------------------------------------ */
  if (cachedCommands[lowered]) {
    await msg.reply(`📝 ${cachedCommands[lowered].description}`);
    return;
  }

  /* ------------------------------------------------------------------
     3) FOREIGN-CHECK  (#cf) – typed by the bot account inside group
  ------------------------------------------------------------------ */
  if (msg.fromMe && lowered === '#cf') {
    const chat = await msg.getChat().catch(() => null);
    if (!chat?.isGroup) {
      await msg.reply('⛔ צריך לשלוח את הפקודה בתוך קבוצה.');
      return;
    }
    // Check if bot is admin - find bot by checking isMe property
    let botIsAdmin = false;
    for (const p of chat.participants) {
        try {
            const contact = await client.getContactById(getParticipantJid(p));
            if (contact.isMe && p.isAdmin) {
                botIsAdmin = true;
                break;
            }
        } catch (e) {
            // Continue checking
        }
    }
    if (!botIsAdmin) {
      await msg.reply('⚠️ הבוט לא אדמין בקבוצה הזו.');
      return;
    }

    const foreign = [];
    for (const p of chat.participants) {
      const c = await client.getContactById(getParticipantJid(p)).catch(() => null);
      if (c?.number && !c.number.startsWith('972')) {
        foreign.push(`• ${c.pushname || 'לא ידוע'} (${c.number})`);
      }
    }
    await msg.reply(
      foreign.length
        ? `🌍 זוהו מספרים זרים:\n${foreign.join('\n')}`
        : '✅ לא נמצאו מספרים זרים.'
    );
    return;
  }

  /* ------------------------------------------------------------------
     4) UPGRADED #kick (reply, from bot account) - Fixed for LID
  ------------------------------------------------------------------ */
/* ─────── #kick – delete replied msg, kick user, DM admin with group URL ─────── */
if (msg.fromMe && cmd === '#kick' && msg.hasQuotedMsg) {
  const chat   = await msg.getChat().catch(() => null);
  const quoted = await msg.getQuotedMessage().catch(() => null);
  if (!chat?.isGroup || !quoted) return;

  // 1) Determine the target JID with LID support
  const target = getMessageAuthor(quoted);
  if (!target) {
    console.log(`[${getTimestamp()}] ❌ Could not determine target user for kick`);
    return;
  }

  // 2) Delete only the replied-to message
  try { await quoted.delete(true); } catch { /* ignore */ }

  // 3) Kick the user
  try { 
    await chat.removeParticipants([target]); 
    console.log(`[${getTimestamp()}] ✅ Kicked user: ${target}`);
  } catch (err) { 
    console.error(`[${getTimestamp()}] ❌ Failed to kick user:`, err.message);
  }

  // 4) Build Group URL
  const inviteCode = await chat.getInviteCode().catch(() => null);
  const groupURL = inviteCode
    ? `https://chat.whatsapp.com/${inviteCode}`
    : '[URL unavailable]';

  // 5) Send alert *only* to ALERT_PHONE
  const alert = [
    '🚨 User Kicked',
    `👤 Number: ${target}`,
    `📍 Group: ${chat.name}`,
    `🔗 Group URL: ${groupURL}`,
    '🗑️ Message Deleted: 1',
    '🚫 User was removed.'
  ].join('\n');

  await client.sendMessage(`${ALERT_PHONE}@c.us`, alert).catch(() => {});
  return;
}

if (cmd === '#translate') {
  let textToTranslate = '';
  let targetContact = null;
  let detectedLang = 'unknown';

  // Try to get the quoted message if available
  if (msg.hasQuotedMsg) {
      try {
          const quoted = await msg.getQuotedMessage();
          textToTranslate = quoted.body;
          targetContact = getMessageAuthor(quoted);
      } catch (e) {
          await msg.reply('⚠️ Could not retrieve the quoted message for translation.');
          return;
      }
  } else {
      textToTranslate = arg || msg.body.replace(/^#translate/i, '').trim();
      targetContact = getMessageAuthor(msg);
  }

  if (!textToTranslate) {
      await msg.reply('⚠️ No text to translate.');
      return;
  }

  try {
      // Attempt to translate the text
      const translationResult = await translate(textToTranslate, { to: 'he' });
      const translatedText = translationResult.text || 'לא זוהה תרגום';

      // Detect language
      if (translationResult.from?.language?.iso) {
          detectedLang = translationResult.from.language.iso;
      } else if (translationResult.raw?.src) {
          detectedLang = translationResult.raw.src;
      }

      // Only translate if not Hebrew, else still show result
      if (detectedLang !== 'he') {
          await msg.reply(
              `🌍 תרגום מהמשתמש @${(targetContact || '').split('@')[0]} (מ${detectedLang}):\n${translatedText}`
          );
      } else {
          await msg.reply(`🌍 הטקסט כבר בעברית:\n${translatedText}`);
      }
      console.log(`[${getTimestamp()}] ✅ Translated from ${detectedLang}: ${translatedText}`);
  } catch (err) {
      console.error('❌ Translation failed:', err.message);
      await msg.reply('🚫 Translation error: Unable to process the message.');
  }
  return;
}

// ─────── #warn – Send warning to user (reply to message) ───────
if (msg.hasQuotedMsg && cmd === '#warn') {
    try {
        const chat = await msg.getChat();
        const sender = await msg.getContact();
        
        if (!chat.isGroup) {
            await msg.reply('⚠️ This command can only be used in groups.');
            return;
        }
        
        const senderJid = getParticipantJid(sender);
        const isAdmin = chat.participants.some(p => {
            const pJid = getParticipantJid(p);
            return pJid === senderJid && p.isAdmin;
        });
        
        if (!isAdmin) {
            await msg.reply('🚫 You must be an admin to warn users.');
            return;
        }
        
        const quotedMsg = await msg.getQuotedMessage();
        const target = getMessageAuthor(quotedMsg);
        
        if (!target) {
            await msg.reply('⚠️ Unable to identify the user to warn.');
            return;
        }
        
        const warningMessage = [
            '⚠️ *WARNING*',
            'Your behavior violates group rules. Please follow the group guidelines.',
            'Further violations may result in mute or removal from the group.',
            '------------------------------',
            '⚠️ *אזהרה*',
            'ההתנהגות שלך מפרה את כללי הקבוצה. אנא עקוב אחר ההנחיות.',
            'הפרות נוספות עלולות לגרום להשתקה או הסרה מהקבוצה.'
        ].join('\n');
        
        await client.sendMessage(target, warningMessage);
        await msg.reply(`⚠️ Warning sent to @${target.split('@')[0]}`);
        console.log(`[${getTimestamp()}] ⚠️ Warning sent to ${target}`);
    } catch (err) {
        console.error('❌ Warning error:', err.message);
        await msg.reply('❌ Failed to send warning.');
    }
    return;
}

// ─────── #stats – Show group statistics ───────
if (cmd === '#stats') {
    try {
        const chat = await msg.getChat();
        if (!chat.isGroup) {
            await msg.reply('⚠️ This command can only be used in groups.');
            return;
        }
        
        const totalMembers = chat.participants.length;
        const adminCount = chat.participants.filter(p => p.isAdmin).length;
        const regularMembers = totalMembers - adminCount;
        
        const stats = [
            '📊 *Group Statistics*',
            `👥 Total Members: ${totalMembers}`,
            `👑 Admins: ${adminCount}`,
            `👤 Regular Members: ${regularMembers}`,
            `🏷️ Group Name: ${chat.name}`,
            `🆔 Group ID: ${chat.id._serialized}`
        ].join('\n');
        
        await msg.reply(stats);
    } catch (err) {
        console.error('❌ Stats error:', err.message);
        await msg.reply('❌ Failed to get group statistics.');
    }
    return;
}

// ─────── #clear – Clear messages from a specific user (admin only) ───────
if (msg.hasQuotedMsg && cmd === '#clear') {
    const chat = await msg.getChat().catch(() => null);
    const quotedMsg = await msg.getQuotedMessage().catch(() => null);
    
    if (!chat?.isGroup || !quotedMsg) {
        await msg.reply('⚠️ This command requires a group and quoted message.');
        return;
    }
    
    // Check if sender is admin
    const sender = await msg.getContact();
    const senderJid = getParticipantJid(sender);
    const isAdmin = chat.participants.some(p => {
        const pJid = getParticipantJid(p);
        return pJid === senderJid && p.isAdmin;
    });
    
    if (!isAdmin) {
        await msg.reply('🚫 You must be an admin to clear messages.');
        return;
    }
    
    // Check if bot is admin (same logic as other commands)
    let botIsAdmin = false;
    for (const p of chat.participants) {
        try {
            const contact = await client.getContactById(getParticipantJid(p));
            if (contact.isMe && p.isAdmin) {
                botIsAdmin = true;
                break;
            }
        } catch (e) {
            // Continue
        }
    }
    
    if (!botIsAdmin) {
        await msg.reply('⚠️ The bot must be an admin to delete messages.');
        return;
    }
    
    // Get target using SAME logic as #kick command
    const target = getMessageAuthor(quotedMsg);
    if (!target) {
        await msg.reply('⚠️ Could not determine target user.');
        return;
    }
    
    console.log(`[${getTimestamp()}] #clear target: ${target}`);
    
    try {
        // Step 1: Delete the quoted message (we know this works)
        console.log(`[${getTimestamp()}] Deleting quoted message...`);
        try {
            await quotedMsg.delete(true);
            console.log(`[${getTimestamp()}] ✅ Quoted message deleted`);
        } catch (e) {
            console.log(`[${getTimestamp()}] ❌ Failed to delete quoted message: ${e.message}`);
        }
        
        // Step 2: Find and delete recent messages (last 20 messages only for better success rate)
        console.log(`[${getTimestamp()}] Finding recent messages...`);
        const messages = await chat.fetchMessages({ limit: 20 }); // Only recent messages
        
        let deletedCount = 1; // Count the quoted message
        let foundCount = 0;
        
        // Process messages in reverse order (newest first)
        for (let i = 0; i < messages.length; i++) {
            const message = messages[i];
            const messageAuthor = getMessageAuthor(message);
            
            // Skip if not from target, is command, or is already deleted quoted message
            if (messageAuthor !== target || 
                message.id.id === msg.id.id || 
                message.id.id === quotedMsg.id.id) {
                continue;
            }
            
            foundCount++;
            
            // Only try to delete the most recent messages (better chance of success)
            if (foundCount <= 9) { // Plus the quoted message = 10 total
                try {
                    console.log(`[${getTimestamp()}] Deleting recent message ${foundCount}: ${message.body?.substring(0, 30) || '[media]'}`);
                    
                    // Check message age (only delete recent messages)
                    const messageAge = Date.now() - (message.timestamp * 1000);
                    const oneHour = 60 * 60 * 1000;
                    
                    if (messageAge < oneHour) {
                        // Recent message - should delete successfully
                        await message.delete(true);
                        deletedCount++;
                        console.log(`[${getTimestamp()}] ✅ Deleted recent message ${foundCount}`);
                    } else {
                        // Old message - try but might not work
                        console.log(`[${getTimestamp()}] ⚠️ Message is ${Math.round(messageAge / (1000 * 60))} minutes old`);
                        await message.delete(true);
                        deletedCount++;
                        console.log(`[${getTimestamp()}] ✅ Deleted old message ${foundCount}`);
                    }
                    
                    // Delay between deletions
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                } catch (e) {
                    console.error(`[${getTimestamp()}] ❌ Failed to delete message ${foundCount}: ${e.message}`);
                }
            }
        }
        
        console.log(`[${getTimestamp()}] Clear completed: ${deletedCount} messages processed, ${foundCount} found`);
        
        if (deletedCount > 0) {
        //    await msg.reply(`🧹 Deleted ${deletedCount} messages from @${target.split('@')[0]}`);
        } else {
        //    await msg.reply(`⚠️ No messages found to delete from @${target.split('@')[0]}`);
        }
        
    } catch (err) {
        console.error(`[${getTimestamp()}] ❌ Clear error:`, err.message);
        await msg.reply('❌ Failed to clear messages.');
    }
    
    return;
}

// ─────── #promote – Promote user to admin (super admin only) ───────
if (msg.hasQuotedMsg && cmd === '#promote') {
    try {
        const chat = await msg.getChat();
        const sender = await msg.getContact();
        
        if (!chat.isGroup) {
            await msg.reply('⚠️ This command can only be used in groups.');
            return;
        }
        
        // Only ADMIN_PHONE can promote
        if (sender.number !== ADMIN_PHONE) {
            await msg.reply('🚫 Only the super admin can promote users.');
            return;
        }
        
        const quotedMsg = await msg.getQuotedMessage();
        const target = getMessageAuthor(quotedMsg);
        
        if (!target) {
            await msg.reply('⚠️ Unable to identify the user to promote.');
            return;
        }
        
        await chat.promoteParticipants([target]);
        await msg.reply(`✅ @${target.split('@')[0]} has been promoted to admin.`);
        console.log(`[${getTimestamp()}] 👑 Promoted ${target} to admin`);
    } catch (err) {
        console.error('❌ Promote error:', err.message);
        await msg.reply('❌ Failed to promote user.');
    }
    return;
}

// ─────── #demote – Demote admin to regular user (super admin only) ───────
if (msg.hasQuotedMsg && cmd === '#demote') {
    try {
        const chat = await msg.getChat();
        const sender = await msg.getContact();
        
        if (!chat.isGroup) {
            await msg.reply('⚠️ This command can only be used in groups.');
            return;
        }
        
        // Only ADMIN_PHONE can demote
        if (sender.number !== ADMIN_PHONE) {
            await msg.reply('🚫 Only the super admin can demote users.');
            return;
        }
        
        const quotedMsg = await msg.getQuotedMessage();
        const target = getMessageAuthor(quotedMsg);
        
        if (!target) {
            await msg.reply('⚠️ Unable to identify the user to demote.');
            return;
        }
        
        await chat.demoteParticipants([target]);
        await msg.reply(`✅ @${target.split('@')[0]} has been demoted from admin.`);
        console.log(`[${getTimestamp()}] 👤 Demoted ${target} from admin`);
    } catch (err) {
        console.error('❌ Demote error:', err.message);
        await msg.reply('❌ Failed to demote user.');
    }
    return;
}

// ─────── #announce – Send announcement to all members ───────
if (cmd === '#announce') {
    try {
        const chat = await msg.getChat();
        const sender = await msg.getContact();
        
        if (!chat.isGroup) {
            await msg.reply('⚠️ This command can only be used in groups.');
            return;
        }
        
        const senderJid = getParticipantJid(sender);
        const isAdmin = chat.participants.some(p => {
            const pJid = getParticipantJid(p);
            return pJid === senderJid && p.isAdmin;
        });
        
        if (!isAdmin) {
            await msg.reply('🚫 You must be an admin to send announcements.');
            return;
        }
        
        if (!arg) {
            await msg.reply('⚠️ Please provide an announcement message.');
            return;
        }
        
        const announcement = [
            '📢 *GROUP ANNOUNCEMENT*',
            '━━━━━━━━━━━━━━━━━━━━━',
            arg,
            '━━━━━━━━━━━━━━━━━━━━━',
            `From: @${sender.number}`
        ].join('\n');
        
        await chat.sendMessage(announcement, { mentions: [sender] });
        console.log(`[${getTimestamp()}] 📢 Announcement sent by ${sender.pushname}`);
    } catch (err) {
        console.error('❌ Announce error:', err.message);
        await msg.reply('❌ Failed to send announcement.');
    }
    return;
}

// ─────── #pin – Pin message (admin only) ───────
// ─────── #cleardebug – Debug message authors ───────
if (msg.hasQuotedMsg && cmd === '#cleardebug') {
    try {
        const chat = await msg.getChat();
        const quotedMsg = await msg.getQuotedMessage();
        
        // Get target from quoted message
        const target = getMessageAuthor(quotedMsg);
        const targetJid = jidKey(target);
        
        console.log(`[${getTimestamp()}] === CLEAR DEBUG ===`);
        console.log(`[${getTimestamp()}] Quoted message author: ${target}`);
        console.log(`[${getTimestamp()}] Normalized target JID: ${targetJid}`);
        
        // Fetch recent messages
        const messages = await chat.fetchMessages({ limit: 20 });
        
        let debugInfo = '🔍 *Clear Debug Info*\n\n';
        debugInfo += `Target: ${target}\n`;
        debugInfo += `Normalized: ${targetJid}\n\n`;
        
        let matchCount = 0;
        const matchedMessages = [];
        
        // First pass: count all matches
        for (let i = 0; i < messages.length; i++) {
            const message = messages[i];
            const author = getMessageAuthor(message);
            const authorJid = jidKey(author);
            const isMatch = authorJid === targetJid;
            
            if (isMatch) {
                matchCount++;
                matchedMessages.push({ index: i + 1, message, author, authorJid });
            }
        }
        
        debugInfo += `*Total Matches: ${matchCount}*\n\n`;
        
        // Show matched messages
        if (matchedMessages.length > 0) {
            debugInfo += '*Matched Messages:*\n';
            matchedMessages.slice(0, 10).forEach((match, idx) => {
                debugInfo += `${idx + 1}. Message #${match.index}\n`;
                debugInfo += `   Author: ${match.author}\n`;
                debugInfo += `   Body: ${match.message.body?.substring(0, 30) || '[media]'}...\n\n`;
            });
            if (matchedMessages.length > 10) {
                debugInfo += `... and ${matchedMessages.length - 10} more\n\n`;
            }
        }
        
        debugInfo += '*First 10 Messages (for reference):*\n';
        for (let i = 0; i < Math.min(10, messages.length); i++) {
            const message = messages[i];
            const author = getMessageAuthor(message);
            const authorJid = jidKey(author);
            const isMatch = authorJid === targetJid;
            
            debugInfo += `${i + 1}. Author: ${author}\n`;
            debugInfo += `   Match: ${isMatch ? '✅' : '❌'}\n`;
            debugInfo += `   Body: ${message.body?.substring(0, 20) || '[media]'}...\n\n`;
        }
        
        await msg.reply(debugInfo);
        console.log(`[${getTimestamp()}] Debug info sent`);
        
    } catch (err) {
        console.error('❌ Clear debug error:', err.message);
        await msg.reply('❌ Failed to debug clear command.');
    }
    return;
}


// ─────── #cleartest – Test message deletion capabilities ───────
if (cmd === '#cleartest') {
    try {
        const chat = await msg.getChat();
        const sender = await msg.getContact();
        
        if (!chat.isGroup) {
            await msg.reply('⚠️ This command can only be used in groups.');
            return;
        }
        
        // Only allow admins to run this test
        const senderJid = getParticipantJid(sender);
        const isAdmin = chat.participants.some(p => {
            const pJid = getParticipantJid(p);
            return pJid === senderJid && p.isAdmin;
        });
        
        if (!isAdmin) {
            await msg.reply('🚫 You must be an admin to run clear test.');
            return;
        }
        
        await msg.reply('🧪 Running message deletion capability test...');
        
        // Test 1: Can bot delete its own message?
        const testMsg = await chat.sendMessage('🧪 Test message from bot - will try to delete this');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        let testResults = '📋 *Clear Command Test Results*\n\n';
        
        try {
            await testMsg.delete(true);
            testResults += '✅ Bot can delete its own messages\n';
        } catch (e) {
            testResults += '❌ Bot CANNOT delete its own messages\n';
            testResults += `   Error: ${e.message}\n`;
        }
        
        // Test 2: Check bot admin status
        let botIsAdmin = false;
        for (const p of chat.participants) {
            try {
                const contact = await client.getContactById(getParticipantJid(p));
                if (contact.isMe && p.isAdmin) {
                    botIsAdmin = true;
                    break;
                }
            } catch (e) {
                // Continue
            }
        }
        
        testResults += botIsAdmin ? '✅ Bot is admin in this group\n' : '❌ Bot is NOT admin in this group\n';
        
        // Test 3: Try to delete a recent message from someone else
        const messages = await chat.fetchMessages({ limit: 20 });
        let otherMessage = null;
        
        for (const message of messages) {
            if (!message.fromMe && message.id.id !== msg.id.id) {
                otherMessage = message;
                break;
            }
        }
        
        if (otherMessage) {
            try {
                await otherMessage.delete(true);
                testResults += "✅ Bot can delete others' messages\n";
            } catch (e) {
                testResults += "❌ Bot CANNOT delete others' messages\n";
                testResults += `   Error: ${e.message}\n`;
            }
        } else {
            testResults += "ℹ️ No other messages found to test\n";
        }
        
        // Test 4: Message age check
        testResults += '\n🕒 *Message Age Limits:*\n';
        testResults += '- Admins: Can delete any message\n';
        testResults += '- Non-admins: Only messages < 24 hours\n';
        testResults += '- Own messages: Usually deletable anytime\n';
        
        testResults += '\n💡 *Recommendations:*\n';
        if (!botIsAdmin) {
            testResults += '⚠️ Make the bot an admin for full functionality\n';
        }
        testResults += '- Use #clear on recent messages only\n';
        testResults += '- Bot must be admin to delete all messages\n';
        
        await msg.reply(testResults);
        
    } catch (err) {
        console.error('❌ Clear test error:', err.message);
        await msg.reply('❌ Failed to run clear test.');
    }
    return;
}

if (msg.hasQuotedMsg && cmd === '#pin') {
    try {
        const chat = await msg.getChat();
        const sender = await msg.getContact();
        
        if (!chat.isGroup) {
            await msg.reply('⚠️ This command can only be used in groups.');
            return;
        }
        
        const senderJid = getParticipantJid(sender);
        const isAdmin = chat.participants.some(p => {
            const pJid = getParticipantJid(p);
            return pJid === senderJid && p.isAdmin;
        });
        
        if (!isAdmin) {
            await msg.reply('🚫 You must be an admin to pin messages.');
            return;
        }
        
        const quotedMsg = await msg.getQuotedMessage();
        const duration = parseInt(arg) || 7; // Default 7 days
        
        await quotedMsg.pin(duration * 24 * 60 * 60); // Convert days to seconds
        await msg.reply(`📌 Message pinned for ${duration} days.`);
        console.log(`[${getTimestamp()}] 📌 Message pinned for ${duration} days`);
    } catch (err) {
        console.error('❌ Pin error:', err.message);
        await msg.reply('❌ Failed to pin message.');
    }
    return;
}

});


/* ───────────── INVITE-LINK MODERATION (Fixed for LID) ───────────── */
client.on('message', async msg => {
  if (msg.fromMe) return;        
  
   // Ignore messages sent before the bot was started
   const messageTimestamp = msg.timestamp * 1000; // Convert from seconds to milliseconds
   if (messageTimestamp < startTime) {
     console.log(`[${getTimestamp()}] ⏳ Ignored old message from ${msg.from}`);
     return;
   }
   // skip self-echo
  const chat    = await msg.getChat().catch(() => null);
  const contact = await msg.getContact().catch(() => null);
  if (!chat?.isGroup || !contact) return;

  // Check if user is muted
  const author = getMessageAuthor(msg);
  const muteUntil = mutedUsers.get(author);
  if (muteUntil && Date.now() < muteUntil) {
    // 1) Count this infraction
    const count = (mutedMsgCounts.get(author) || 0) + 1;
    mutedMsgCounts.set(author, count);

    // 2) If over 3 messages while muted → kick
    if (count > 3) {
      try {
        await chat.removeParticipants([author]);
        await chat.sendMessage(
          `🚨 המשתמש @${author.split('@')[0]} הורחק בשל הפרת כללי הקבוצה.`
        );
        console.log(`[${getTimestamp()}] ✅ Kicked @${author.split('@')[0]} after ${count} muted messages.`);
      } catch (e) {
        console.error(`[${getTimestamp()}] ❌ Failed to kick user:`, e.message);
      }
      // clean up their state
      mutedUsers.delete(author);
      mutedMsgCounts.delete(author);
      return;
    }

    // 3) Otherwise still under limit → shadow-delete
    try {
      await msg.delete(true);
      console.log(
        `🗑️ Shadow-deleted message #${count} from @${author.split('@')[0]} (still muted)`
      );
    } catch (err) {
      console.error(`[${getTimestamp()}] ❌ Failed to delete message:`, err.message);
    }
    return;
  }

  
  const body        = msg.body.replace(/\u200e/g, '').trim(); // keep original case!
  // Updated regex to catch more WhatsApp URL variations
  const inviteRegex = /https?:\/\/(chat\.)?whatsapp\.com\/(chat\/)?([A-Za-z0-9]{10,})/gi;
  const matches     = body.match(inviteRegex) || [];
  
  // Debug logging
  if (body.toLowerCase().includes('whatsapp.com')) {
    console.log(`[${getTimestamp()}] 🔍 Detected potential WhatsApp link in message from ${msg.from}`);
    console.log(`[${getTimestamp()}] Message body: ${body}`);
    console.log(`[${getTimestamp()}] Matches found: ${matches.length}`);
  }
  
  if (!matches.length) return;
  
  // Extract group codes from URLs
  const groupCodes = [];
  let match;
  while ((match = inviteRegex.exec(body)) !== null) {
    // Extract the group code (last captured group)
    const groupCode = match[3] || match[2] || match[1];
    if (groupCode && groupCode.length >= 10) {
      groupCodes.push(groupCode);
    }
  }

  const contactJid = jidKey(contact);
  const senderIsAdmin = chat.participants.some(p => {
    const pJid = getParticipantJid(p);
    return pJid === contactJid && p.isAdmin;
  });
  
  console.log(`[${getTimestamp()}] 🔗 WhatsApp invite detected from ${contactJid}`);
  console.log(`[${getTimestamp()}] Sender is admin: ${senderIsAdmin}`);
  console.log(`[${getTimestamp()}] Sender is whitelisted: ${WHITELIST.has(contactJid)}`);
  
  if (senderIsAdmin || WHITELIST.has(contactJid)) {
    console.log(`[${getTimestamp()}] ℹ️ Skipping action - sender is admin or whitelisted`);
    return;
  }

  // Check if bot is admin - find bot by checking isMe property
  let botIsAdmin = false;
  for (const p of chat.participants) {
      try {
          const contact = await client.getContactById(getParticipantJid(p));
          if (contact.isMe && p.isAdmin) {
              botIsAdmin = true;
              break;
          }
      } catch (e) {
          // Continue checking
      }
  }
  
  if (!botIsAdmin) {
    console.log(`[${getTimestamp()}] ⚠️ Bot is not admin - cannot take action on invite link`);
    return;
  }
  
  console.log(`[${getTimestamp()}] ✅ Bot is admin - proceeding with invite link moderation`); 

  await chat.sendSeen().catch(() => {});
  
  const target = author || contactJid;

// 1) Delete the invite message
try {
  console.log(`[${getTimestamp()}] Attempting to delete invite message...`);
  await msg.delete(true);
  console.log(`[${getTimestamp()}] 🗑️ Invite message deleted successfully`);
} catch (e) {
  console.error(`[${getTimestamp()}] ❌ Failed to delete invite message:`, e.message);
  console.error(`[${getTimestamp()}] Error details:`, e);
}

// 2) Blacklist the sender AND the group codes (if not already)
try {
  const userJid = jidKey(contact);
  if (!(await isBlacklisted(userJid))) {
    await addToBlacklist(userJid);
    console.log(`✅ User ${userJid} added to blacklist`);
  } else {
    console.log(`🚫 User ${userJid} is already blacklisted.`);
  }
  
  // Also blacklist each group code as potential LID
  for (const code of groupCodes) {
    const groupLid = `${code}@lid`;
    if (!(await isBlacklisted(groupLid))) {
      await addToBlacklist(groupLid);
      console.log(`✅ Group LID ${groupLid} added to blacklist`);
    }
  }
} catch (err) {
  console.error(`[${getTimestamp()}] ❌ Failed to add to blacklist:`, err.message);
}

// 3) Remove (kick) the sender from group
try {
  await chat.removeParticipants([target]);
  console.log(`[${getTimestamp()}] ✅ Kicked user: ${target}`);
} catch (e) {
  console.error(`[${getTimestamp()}] ❌ Kick failed:`, e.message);
}

// 4) Build and send rich alert with group URL
const inviteCode = await chat.getInviteCode().catch(() => null);
const groupURL = inviteCode
  ? `https://chat.whatsapp.com/${inviteCode}`
  : '[URL unavailable]';

const alert = [
  '🚨 *WhatsApp Invite Detected & User Kicked*',
  `👤 User: ${describeContact(contact)}`,
  `📍 Group: ${chat.name}`,
  `🔗 Group URL: ${groupURL}`,
  '🔗 Posted link(s):',
  ...matches.map(l => `   • ${l}`),
  '🗑️ Message Deleted: 1',
  '🚫 User was removed and blacklisted.',
  '',
  '🔄 *To unblacklist this user, copy the command below:*'
].filter(Boolean).join('\n');

await client.sendMessage(`${ALERT_PHONE}@c.us`, alert).catch(() => {});

// Send unblacklist command as separate message for easy copying
await client.sendMessage(`${ALERT_PHONE}@c.us`, `#unblacklist ${jidKey(contact)}`).catch(() => {});
console.log(`[${getTimestamp()}] ✅ Invite handled, message deleted & user kicked for ${describeContact(contact)}`);
});

/* ───────────── FOREIGN-JOIN RULE (Fixed for LID) ───────────── */
client.on('group_join', async evt => {
  const pid = evt.id?.participant;
  if (!pid) return;

  const { isWhitelisted } = require('./services/whitelistService');
  const chat = await client.getChatById(evt.id.remote).catch(() => null);
  if (!chat?.isGroup) return;

  const contact = await client.getContactById(pid).catch(() => null);
  if (!contact) return;

  const userJid = jidKey(contact);

  if (await isBlacklisted(userJid)) {
    console.log(`🚫 User ${userJid} is blacklisted, attempting to remove...`);
    
    try {
      // Remove the blacklisted user
      await chat.removeParticipants([pid]);
      
      // Notify the kicked user
      const messageToUser = [
        '🚫 הוסרת מהקבוצה מכיוון שמזהה המשתמש שלך מופיע ברשימה השחורה.',
        '❗ אם אתה חושב שמדובר בטעות, נא ליצור קשר עם מנהל הקבוצה.',
        `📱 +${ADMIN_PHONE}`
      ].join('\n');
      await client.sendMessage(pid, messageToUser);
      
      // Get group URL for alert
      const inviteCode = await chat.getInviteCode().catch(() => null);
      const groupURL = inviteCode ? `https://chat.whatsapp.com/${inviteCode}` : '[URL unavailable]';
      
      // Alert the admin with enhanced info
      const alert = [
        '🚨 *Blacklisted User Auto-Kicked on Join*',
        `👤 User: ${describeContact(contact)}`,
        `📍 Group: ${chat.name}`,
        `🔗 Group URL: ${groupURL}`,
        `🕒 Time: ${getTimestamp()}`,
        '🚫 User was auto-removed (blacklisted).',
        '',
        '🔄 *To unblacklist this user, copy the command below:*'
      ].join('\n');
      await client.sendMessage(`${ALERT_PHONE}@c.us`, alert);
      
      // Send unblacklist command as separate message for easy copying
      await client.sendMessage(`${ALERT_PHONE}@c.us`, `#unblacklist ${userJid}`);
      console.log(`[${getTimestamp()}] ✅ Auto-kicked blacklisted user: ${userJid}`);
    } catch (err) {
      console.error(`❌ Failed to auto-kick blacklisted user: ${err.message}`);
      // Alert admin about failure
      await client.sendMessage(`${ALERT_PHONE}@c.us`, 
        `❌ Failed to auto-kick blacklisted user ${describeContact(contact)} from ${chat.name}: ${err.message}`);
    }
    return;
  }
});



/* ───────────── GLOBAL ERROR HANDLERS ───────────── */
process.on('unhandledRejection', async reason => {
  const txt = [
    '❌ *Bot crashed with unhandledRejection*',
    `• When: ${new Date().toLocaleString('en-GB',{timeZone:'Asia/Jerusalem'})}`,
    `• Reason: ${reason}`
  ].join('\n');
  console.error(txt);
  client.sendMessage(`${ALERT_PHONE}@c.us`, txt).catch(() => {});
});

process.on('uncaughtException', async err => {
  const txt = [
    '❌ *Bot crashed with uncaughtException*',
    `• When: ${new Date().toLocaleString('en-GB',{timeZone:'Asia/Jerusalem'})}`,
    `• Error: ${err.message}`
  ].join('\n');
  console.error(txt);
  client.sendMessage(`${ALERT_PHONE}@c.us`, txt).catch(() => {});
});

client.on('disconnected', async reason => {
  const txt = [
    '❌ *WhatsApp client disconnected*',
    `• When: ${new Date().toLocaleString('en-GB',{timeZone:'Asia/Jerusalem'})}`,
    `• Reason: ${reason}`
  ].join('\n');
  console.warn(txt);
  client.sendMessage(`${ALERT_PHONE}@c.us`, txt).catch(() => {});
});

/* ───────────── DEBUG HOOKS ───────────── */
client.on('loading_screen', pct => console.log(`🔄 Loading screen: ${pct}%`));
client.on('change_state', st => console.log('🧭 State changed to:', st));

/* ───────────── START BOT ───────────── */
console.log(`[${getTimestamp()}] 📡 Calling client.initialize()…`);
client.initialize();