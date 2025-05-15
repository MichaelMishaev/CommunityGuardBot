// inviteMonitor.js
console.log('🚀 Bot starting... initializing WhatsApp Web');

const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { addToWhitelist, removeFromWhitelist, listWhitelist } = require('./services/whitelistService');
const { addToBlacklist, removeFromBlacklist, listBlacklist, isBlacklisted } = require('./services/blacklistService');
const { addMutedUser, removeMutedUser, loadMutedUsers } = require('./services/muteService');


const { translate } = require('@vitalets/google-translate-api');

// ─────────── Firestore & Command Cache Setup ───────────
const admin     = require('firebase-admin');
const path      = require('path');

// load your service account key
const serviceAccount = require(path.join(__dirname, 'guard1-dbkey.json'));

//for mute logic
let mutedUsers = new Map();
const mutedMsgCounts  = new Map();


// Firestore reference and in-memory cache
const db = admin.firestore();
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
    console.log('📥 Commands loaded:', Object.keys(cachedCommands));
  } catch (e) {
    console.error('❌ failed to load commands:', e);
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
  console.log('[DEBUG] QR code received, generating…');
  qrcode.generate(qr, { small: true });
  console.log('📱  Scan the QR code above to log in.');
});

client.on('authenticated', () => console.log('✅  Authenticated!'));
client.on('ready', async () => {
  console.log('✅  Bot is ready and logged in!');
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
     console.log('✅ Mute list loaded');

     console.log('Version 1.0.3');
     console.log('✅  Bot is ready, commands cache populated!');
});
client.on('auth_failure', e => console.error('❌  AUTH FAILED', e));

/* ───────────── CONFIGURATION ───────────── */
const ADMIN_PHONE = '972555020829';
const ALERT_PHONE = '972544345287';
const WHITELIST   = new Set([ADMIN_PHONE, ALERT_PHONE]);

/* ───────────── #cf COMMAND ───────────── */
/*
client.on('message_create', async msg => {
  const cleaned = msg.body.replace(/\u200e/g, '').trim().toLowerCase();

    // manual reload
  if (msg.fromMe && cleaned === '#reload') {
    await loadCommands();
    msg.reply('🔄 Commands reloaded successfully!');
    return;
  }

  // Firestore-defined commands
  if (cachedCommands[cleaned]) {
    return msg.reply(`📝 ${cachedCommands[cleaned].description}`);
  }

  if (!msg.fromMe || cleaned !== '#cf') return;

  const chat = await msg.getChat().catch(() => null);
  if (!chat?.isGroup) return msg.reply('⛔ צריך לשלוח את הפקודה בתוך קבוצה.');

  const botIsAdmin = chat.participants.some(p =>
    p.id.user === client.info.wid.user && p.isAdmin
  );
  if (!botIsAdmin) return msg.reply('⚠️ הבוט לא אדמין בקבוצה הזו.');

  const foreign = [];
  for (const p of chat.participants) {
    const c = await client.getContactById(p.id._serialized).catch(() => null);
    if (c?.number && !c.number.startsWith('972')) {
      foreign.push(`• ${c.pushname || 'לא ידוע'} (${c.number})`);
    }
  }
  const reply = foreign.length
    ? `🌍 זוהו מספרים זרים:\n${foreign.join('\n')}`
    : '✅ לא נמצאו מספרים זרים.';
  msg.reply(reply);
});
*.

/* ───────────── UNIFIED message_create HANDLER ───────────── */
client.on('message_create', async msg => {
  // strip bidi chars & normalise
  const cleaned  = msg.body.replace(/\u200e/g, '').trim();
  const lowered  = cleaned.toLowerCase();
  const [cmd, arg] = lowered.split(/\s+/, 2);

    if (cmd === '#mute' && !msg.hasQuotedMsg) {
    // Check if the message is from an admin
    console.log('🔊 Mute command received');
    const chat = await msg.getChat();
    const sender = await msg.getContact();

    if (!chat.isGroup) {
      await msg.reply('⚠️ This command can only be used in groups.');
      return;
    }

    const isAdmin = chat.participants.some(p => p.id._serialized === sender.id._serialized && p.isAdmin);
    if (!isAdmin) {
      await msg.reply('🚫 You must be an admin to mute the group.');
      return;
    }

    // Validate the mute duration
    const muteDuration = parseInt(arg, 10);
    if (isNaN(muteDuration) || muteDuration <= 0) {
      await msg.reply('⚠️ Please specify a valid number of minutes. Example: #mute 10');
      return;
    }

    // Mute the group (admin-only messages)
    try {
      await chat.sendMessage(`🔇 הקבוצה הושתקה למשך ${muteDuration} דקות.`);

      await chat.setMessagesAdminsOnly(true);

      console.log(`✅ Group muted for ${muteDuration} minutes by ${sender.pushname}`);

      // Set a timeout to unmute after the specified duration
      setTimeout(async () => {
        await chat.setMessagesAdminsOnly(false);
        //await chat.sendMessage('🔊 Group has been unmuted.');
        console.log('✅ Group unmuted automatically after timeout.');
      }, muteDuration * 60000); // Convert minutes to milliseconds
    } catch (err) {
      await msg.reply('❌ Failed to mute the group.');
      console.error('Mute error:', err.message);
    }
    return;
  }

  // ─────── Mute Specific User via Reply (#mute [minutes]) ───────

// Mute Specific User via Reply (#mute [minutes])
if (msg.hasQuotedMsg && cmd === '#mute') {
    try {
        const chat = await msg.getChat();
        const sender = await msg.getContact();
        const quotedMsg = await msg.getQuotedMessage();

        // Check if the message is from a group and the sender is an admin
        if (!chat.isGroup) {
            await msg.reply('⚠️ This command can only be used in groups.');
            return;
        }

        const isAdmin = chat.participants.some(p => 
            p.id._serialized === sender.id._serialized && p.isAdmin
        );

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
        const target = quotedMsg.author || quotedMsg.from;

        // Ensure the bot is an admin
        const botIsAdmin = chat.participants.some(p =>
            p.id.user === client.info.wid.user && p.isAdmin
        );
        if (!botIsAdmin) {
            await msg.reply('⚠️ The bot must be an admin to mute users.');
            return;
        }

        // Calculate mute expiration time
        const muteUntil = Date.now() + muteDurationMs;

        // Save to in-memory map and Firestore
        mutedUsers.set(target, muteUntil);
        await addMutedUser(target, muteUntil);

        // Send confirmation message
        await msg.reply(`🔇 @${target.split('@')[0]} 🔒 ⛔ ⏳`);

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
      console.error('❌ Error fetching custom commands:', e);
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
      '1. *#status* - Check bot status',
      '2. *#reload* - Reload commands from Firestore',
      '3. *#whitelist* - Add a number to the whitelist\n   (e.g., #whitelist 972555123456)',
      '4. *#unwhitelist* - Remove a number from the whitelist\n   (e.g., #unwhitelist 972555123456)',
      '5. *#whitelst* - List all whitelisted numbers',
      '',
      '*🚫 Blacklist Commands:*',
      '6. *#blacklist* - Manually add a number to the blacklist\n   (e.g., #blacklist 972555123456)',
      '7. *#unblacklist* - Remove a number from the blacklist\n   (e.g., #unblacklist 972555123456)',
      '8. *#blacklst* - List all blacklisted numbers',
      '',
      '*🚨 Group Management Commands:*',
      '9. *#kick* - Kick a user from the group (reply to a message)',
      '10. *#cf* - Check for foreign numbers in the group',
      '11. *#mute [minutes]* - Mute the entire group for the specified number of minutes\n    (admin only)',
      '12. *#mute (reply) [minutes]* - Mute a specific user for the specified number of minutes\n    (admin only), kicked out if they send more than 3 messages while muted',
      '',
      '*⚙️ General Commands:*',
      '13. *#commands* - Show all loaded custom commands from Firestore',
      '14. *#help* - Show this help message',
      '15. *#unb* - Unban a previously banned number\n   (e.g., #unb 972555123456), must be as a reply on bot message',
      '',
      '💡 *Note:* Use these commands responsibly to manage group safety and user behavior.',
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
    console.error('❌ Error fetching commands:', e);
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

      // ─── Manual “unb” via reply ───────────────────────────────
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
        if (await addToWhitelist(arg)) {
          await msg.reply([
            '✅ Whitelist Update',
            `👤 Number: +${arg}`,
            '📝 Status: Added to whitelist'
          ].join('\n'));
        } else {
          await msg.reply([
            'ℹ️ Whitelist Info',
            `👤 Number: +${arg}`,
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
        if (await removeFromWhitelist(arg)) {
          await msg.reply([
            '✅ Whitelist Update',
            `👤 Number: +${arg}`,
            '📝 Status: Removed from whitelist'
          ].join('\n'));
        } else {
          await msg.reply([
            '⚠️ Whitelist Info',
            `👤 Number: +${arg}`,
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
          if (await addToBlacklist(arg)) {
            await msg.reply([
              '✅ Blacklist Update',
              `👤 Number: +${arg}`,
              '🚫 Status: Added to blacklist'
            ].join('\n'));
            console.log(`✅ Manually blacklisted: +${arg}`);
          } else {
            await msg.reply([
              'ℹ️ Blacklist Info',
              `👤 Number: +${arg}`,
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
            if (await removeFromBlacklist(arg)) {
              await msg.reply([
                '✅ Blacklist Update',
                `👤 Number: +${arg}`,
                '📝 Status: Removed from blacklist'
              ].join('\n'));
              console.log(`✅ Manually unblacklisted: +${arg}`);
            } else {
              await msg.reply([
                '⚠️ Blacklist Info',
                `👤 Number: +${arg}`,
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
    const botIsAdmin = chat.participants.some(
      p => p.id.user === client.info.wid.user && p.isAdmin
    );
    if (!botIsAdmin) {
      await msg.reply('⚠️ הבוט לא אדמין בקבוצה הזו.');
      return;
    }

    const foreign = [];
    for (const p of chat.participants) {
      const c = await client.getContactById(p.id._serialized).catch(() => null);
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
     4) UPGRADED #kick (reply, from bot account)
        – deletes recent msgs (≤100, ≤24 h) then kicks user
  ------------------------------------------------------------------ */
/* ─────── #kick – delete replied msg, kick user, DM admin with group URL ─────── */
if (msg.fromMe && cmd === '#kick' && msg.hasQuotedMsg) {
  const chat   = await msg.getChat().catch(() => null);
  const quoted = await msg.getQuotedMessage().catch(() => null);
  if (!chat?.isGroup || !quoted) return;

  // 1) Determine the target JID
  const target = quoted.author || quoted.from || quoted.id.participant;

  // 2) Delete only the replied-to message
  try { await quoted.delete(true); } catch { /* ignore */ }

  // 3) Kick the user
  try { await chat.removeParticipants([target]); } catch { /* ignore */ }

  // 4) Build Group URL
  const inviteCode = await chat.getInviteCode().catch(() => null);
  const groupURL = inviteCode
    ? `https://chat.whatsapp.com/${inviteCode}`
    : '[URL unavailable]';

  // 5) Send alert *only* to ALERT_PHONE
  const alert = [
    '🚨 User Kicked',
    `👤 Number: +${target.split('@')[0]}`,
    `📍 Group: ${chat.name}`,
    `🔗 Group URL: ${groupURL}`,
    '🗑️ Message Deleted: 1',
    '🚫 User was removed.'
  ].join('\n');

  await client.sendMessage(`${ALERT_PHONE}@c.us`, alert).catch(() => {});
  return;
}

});


// ─── ADMIN REPLY-TO-KICK VIA message_create ─────────────────
/*
client.on('message_create', async msg => {
  // 1) Only process commands typed by the bot account itself
  if (!msg.fromMe) return;

  // 2) Must be exactly "#kick" (case‐insensitive) and a reply
  const text = msg.body.trim().toLowerCase();
  if (text !== '#kick' || !msg.hasQuotedMsg) return;

  // 3) Fetch the group and verify it's a real group
  const chat = await msg.getChat().catch(() => null);
  if (!chat?.isGroup) return;

  // 4) Delete the quoted message
  const quoted = await msg.getQuotedMessage().catch(() => null);
  if (quoted) {
    await quoted.delete(true).catch(() => {});
    // 5) Kick the quoted user
    const target = quoted.author || quoted.from;
    await chat.removeParticipants([target]).catch(() => {});

    // 6) Warn the group
    // await chat.sendMessage(
    //   `🛡️ מנגנון מניעת הונאות זיהה פעילות חשודה ⚠️ המשתמש הוסר ✅ הקהילה נשארת מוגנת 🔒`
    // ).catch(() => {});

    // 7) Send the full admin alert exactly as before
    const alert = [
      '🚨 user kicked out',
      `👤 Number: +${target.split('@')[0]}`,
      `📍 Group: ${chat.name}`,
      '🔗 Posted link(s):',
      `   • ${quoted.body}`,
      '🚫 User was removed.'
    ].join('\n');
    await client.sendMessage(`${ALERT_PHONE}@c.us`, alert).catch(() => {});
  }
});

*/

/* ───────────── INVITE-LINK MODERATION ───────────── */
client.on('message', async msg => {
  if (msg.fromMe) return;                         // skip self-echo
  const chat    = await msg.getChat().catch(() => null);
  const contact = await msg.getContact().catch(() => null);
  if (!chat?.isGroup || !contact) return;

  // DO NOT DELETE THIS CODE, TRANSLATEIO< JUST UNCOMMENT IT
  /*
  try {
    // Attempt to translate the message
    const translationResult = await translate(msg.body, { to: 'he' });

    // Extract translated text
    const translatedText = translationResult.text || 'לא זוהה תרגום';

    // Extract detected language in a more flexible way
    let detectedLanguage = 'unknown';

    // Try to find the detected language from the structured response
    if (translationResult.from?.language?.iso) {
      detectedLanguage = translationResult.from.language.iso;
    } else if (translationResult.raw?.src) {
      detectedLanguage = translationResult.raw.src;
    }

    // Only translate if the detected language is not Hebrew
    if (detectedLanguage !== 'he') {
      await chat.sendMessage(
        `🌍 תרגום מהמשתמש @${contact.number} (מ${detectedLanguage}):\n${translatedText}`
      );
      console.log(`✅ Translated user message from ${detectedLanguage} to Hebrew: ${translatedText}`);
    }
  } catch (err) {
    console.error('❌ Translation failed:', err.message);
    await chat.sendMessage('🚫 Translation error: Unable to process the message.');
  }
    */
  
  const muteUntil = mutedUsers.get(msg.author);
  if (muteUntil && Date.now() < muteUntil) {
    // 1) Count this infraction
    const count = (mutedMsgCounts.get(msg.author) || 0) + 1;
    mutedMsgCounts.set(msg.author, count);

    // 2) If over 5 messages while muted → kick
    if (count > 3) {
      try {
        await chat.removeParticipants([ msg.author ]);
        await chat.sendMessage(
          `🚨 המשתמש @${msg.author.split('@')[0]} הורחק בשל הפרת כללי הקבוצה.`
        );
        console.log(`✅ Kicked @${msg.author.split('@')[0]} after ${count} muted messages.`);
      } catch (e) {
        console.error('❌ Failed to kick user:', e.message);
      }
      // clean up their state
      mutedUsers.delete(msg.author);
      mutedMsgCounts.delete(msg.author);
      return;
    }

    // 3) Otherwise still under limit → shadow-delete
    try {
      await msg.delete(true);
      console.log(
        `🗑️ Shadow-deleted message #${count} from @${msg.author.split('@')[0]} (still muted)`
      );
    } catch (err) {
      console.error('❌ Failed to delete message:', err.message);
    }
    return;
  }




  
  const body        = msg.body.replace(/\u200e/g, '').trim(); // keep original case!
  const inviteRegex = /https?:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{10,}/g;
  const matches     = body.match(inviteRegex) || [];
  if (!matches.length) return;

  const senderIsAdmin = chat.participants.some(
    p => p.id.user === contact.id.user && p.isAdmin
  );
  if (senderIsAdmin || WHITELIST.has(contact.number)) return;

  const botIsAdmin = chat.participants.some(
    p => p.id.user === client.info.wid.user && p.isAdmin
  );
  if (!botIsAdmin) return;

  await chat.sendSeen().catch(() => {});
  await msg.delete(true).catch(e => console.error('❌ Delete failed:', e.message));
  const warnInGroup = `🛡️ מנגנון מניעת הונאות זיהה פעילות חשודה ⚠️ המשתמש הוסר ✅ הקהילה נשארת מוגנת 🔒`;
  //await chat.sendMessage(warnInGroup).catch(() => {});

  try {
    // 📝 Normalize phone number by removing '+'
    const phoneNumber = contact.number.startsWith('+') ? contact.number.slice(1) : contact.number;

    // ✅ Check if the number starts with 972
    if (phoneNumber.startsWith('972') || contact.number.startsWith('+972')) {
      //prevent duplicates
      if (await isBlacklisted(contact.number)) {
        console.log(`🚫 User @${contact.number} is already blacklisted.`);
        return;
       }

        await addToBlacklist(phoneNumber);  // 🔥 Add to blacklist
        console.log(`🚫 User @${phoneNumber} added to blacklist for posting invite link.`);
    }
  } catch (err) {
    console.error('❌ Failed to add to blacklist:', err.message);
  }
  
  await chat.removeParticipants([contact.id._serialized])
            .catch(e => console.error('❌ Kick failed:', e.message));

  const alert = [
    '🚨 WhatsApp Invite Detected',
    `👤 Number: +${contact.number}`,
    contact.pushname ? `👤 Name: ${contact.pushname}` : '',
    `📍 Group: ${chat.name}`,
    '🔗 Posted link(s):',
    ...matches.map(l => `   • ${l}`),
    '🚫 User was removed.'
  ].filter(Boolean).join('\n');
  client.sendMessage(`${ALERT_PHONE}@c.us`, alert).catch(() => {});
  console.log(`✅ Invite handled & alert sent for ${contact.number}`);
});

/* ───────────── FOREIGN-JOIN RULE (prefix +1 or +6) ───────────── */
client.on('group_join', async evt => {
  const pid = evt.id?.participant;
  if (!pid) return;

  const { isWhitelisted } = require('./services/whitelistService');
  const chat = await client.getChatById(evt.id.remote).catch(() => null);
  if (!chat?.isGroup) return;

  const contact = await client.getContactById(pid).catch(() => null);
  if (!contact?.number) return;

  if (await isBlacklisted(contact.number)) {
    console.log(`🚫 User @${contact.number} is already blacklisted.`);


    // Kick the blacklisted user
    try {
      await chat.removeParticipants([pid]);

      // Get group invite link
      const inviteCode = await chat.getInviteCode().catch(() => null);
      const groupURL = inviteCode
        ? `https://chat.whatsapp.com/${inviteCode}`
        : '[URL unavailable]';

      // Send message to the kicked user
      const messageToUser = [
        '🚫 הוסרת מהקבוצה מכיוון שמספרך נמצא ברשימה השחורה.',
        '❗ אם אתה חושב שמדובר בטעות, צור קשר עם המנהל כאן:',
        `📱 +${ADMIN_PHONE}`,
        '------------------------------',
        '🚫 You have been removed from the group because your number is on the blacklist.',
        '❗ If you think this was a mistake, please contact the admin here:',
        `📱 +${ADMIN_PHONE}`,
        '------------------------------',
        '🚫 Вы были удалены из группы, так как ваш номер находится в черном списке.',
        '❗ Если вы считаете, что это ошибка, пожалуйста, свяжитесь с администратором здесь:',
        `📱 +${ADMIN_PHONE}`,
        '------------------------------'
    ].join('\n');
    
      await client.sendMessage(pid, messageToUser);

      // Notify the admin about the blacklist kick
      const alert = [
        '🚨 *Blacklisted User Attempted to Join*',
        `👤 Number: +${contact.number}`,
        `📍 Group: ${chat.name}`,
        `🔗 Group URL: ${groupURL}`,
        '🚫 User was auto-removed (blacklisted).'
      ].join('\n');
      await client.sendMessage(`${ALERT_PHONE}@c.us`, alert);

      // Notify the alert phone that the blacklisted user was kicked
const alertMessage = [
    '🚨 *User Kicked - Blacklisted*',
    `👤 Number: +${contact.number}`,
    `📍 Group: ${chat.name}`,
    `🔗 Group URL: ${groupURL}`,
    '🚫 User was kicked because they are on the blacklist.'
].join('\n');

await client.sendMessage(`${ALERT_PHONE}@c.us`, alertMessage);
console.log(`✅ Alert sent to admin: Blacklisted user @${contact.number} was kicked from group: ${chat.name}`);

    } catch (err) {
      console.log(`❌ Failed to auto-kick blacklisted user: ${err.message}`);
    }
    return;
  }

  // Only kick numbers that start with +1 or +6 and are NOT whitelisted
  if ((contact.number.startsWith('1') || contact.number.startsWith('6')) && 
      !(await isWhitelisted(contact.number))) {
    try {
      // Remove the participant
      await chat.removeParticipants([pid]);

      // Notify the kicked user
      const messageToUser = [
        '🚫 You have been removed from the group because your number is considered suspicious.',
        '❗ If this is a mistake, please contact the group admin:',
        `📱 +${ADMIN_PHONE}`
      ].join('\n');
      await client.sendMessage(`${pid}`, messageToUser);

      // Alert the admin
      const alert = [
        '🚨 Non-Whitelisted Member Auto-Kicked',
        `👤 Number: +${contact.number}`,
        `📍 Group: ${chat.name}`,
        '🚫 User was auto-removed (not whitelisted).'
      ].join('\n');
      await client.sendMessage(`${ALERT_PHONE}@c.us`, alert);
      console.log(`✅ Auto-kicked non-whitelisted user: +${contact.number}`);
    } catch (err) {
      console.log(`❌ Failed to auto-kick: ${err.message}`);
    }
  } else {
    console.log(`✅ Allowed to join: +${contact.number}`);
  }
});

  // 🛑 Check if the user is blacklisted



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
console.log('📡 Calling client.initialize()…');
client.initialize();
