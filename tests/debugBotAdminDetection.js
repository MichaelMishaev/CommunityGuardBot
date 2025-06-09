#!/usr/bin/env node

// Debug tool to check bot admin detection
const { Client, LocalAuth } = require('whatsapp-web.js');
const { jidKey } = require('../utils/jidUtils');

// Add timestamp helper function
function getTimestamp() {
  return new Date().toLocaleString('en-GB', { timeZone: 'Asia/Jerusalem' });
}

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

function describeContact(contact) {
  if (!contact) return 'Unknown';
  const name = contact.name || contact.pushname || 'Unknown';
  const number = contact.number || 'No number';
  return `${name} (${number})`;
}

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  }
});

client.on('ready', async () => {
  console.log(`[${getTimestamp()}] 🔧 DEBUG: Bot admin detection diagnostic tool started`);
  console.log(`[${getTimestamp()}] 🤖 Bot info:`, client.info);
  console.log(`[${getTimestamp()}] 📱 Bot number: ${client.info.wid.user}`);
  console.log(`[${getTimestamp()}] 🆔 Bot JID (raw): ${client.info.wid._serialized}`);
  
  // Get normalized bot JID
  const botContact = await client.getContactById(client.info.wid._serialized);
  const botJid = jidKey(botContact);
  console.log(`[${getTimestamp()}] 🆔 Bot JID (normalized): ${botJid}`);
  console.log(`[${getTimestamp()}] 👤 Bot contact: ${describeContact(botContact)}`);
  
  // Get all chats and check each group
  const chats = await client.getChats();
  const groups = chats.filter(chat => chat.isGroup);
  
  console.log(`[${getTimestamp()}] 📊 Found ${groups.length} groups`);
  
  for (const chat of groups) {
    console.log(`\n[${getTimestamp()}] 🔍 Checking group: ${chat.name}`);
    console.log(`[${getTimestamp()}] 📍 Group ID: ${chat.id._serialized}`);
    console.log(`[${getTimestamp()}] 👥 Participants: ${chat.participants.length}`);
    
    // Check if bot is admin in this chat
    let botIsAdmin = false;
    let foundBot = false;
    
    console.log(`[${getTimestamp()}] 🔍 Searching for bot in participants...`);
    
    chat.participants.forEach((p, index) => {
      const pJid = getParticipantJid(p);
      const isBot = pJid === botJid || pJid === client.info.wid._serialized;
      
      if (isBot) {
        console.log(`[${getTimestamp()}] ✅ Found bot in participants[${index}]:`);
        console.log(`[${getTimestamp()}]    - Participant JID: ${pJid}`);
        console.log(`[${getTimestamp()}]    - Is Admin: ${p.isAdmin}`);
        console.log(`[${getTimestamp()}]    - Is Super Admin: ${p.isSuperAdmin}`);
        botIsAdmin = p.isAdmin;
        foundBot = true;
      }
    });
    
    if (!foundBot) {
      console.log(`[${getTimestamp()}] ❌ Bot not found in participants list for this group!`);
      console.log(`[${getTimestamp()}] 🔍 All participant JIDs:`);
      chat.participants.forEach((p, index) => {
        const pJid = getParticipantJid(p);
        console.log(`[${getTimestamp()}]    [${index}] ${pJid} (admin: ${p.isAdmin})`);
      });
    }
    
    console.log(`[${getTimestamp()}] 🎯 Bot admin status in ${chat.name}: ${botIsAdmin}`);
    
    // Try fallback method (invite code test)
    try {
      await chat.getInviteCode();
      console.log(`[${getTimestamp()}] ✅ Fallback test: Bot can get invite code (confirms admin status)`);
    } catch (inviteError) {
      console.log(`[${getTimestamp()}] ❌ Fallback test: Bot cannot get invite code - ${inviteError.message}`);
    }
  }
  
  console.log(`\n[${getTimestamp()}] 🔧 Diagnostic complete. Press Ctrl+C to exit.`);
});

client.on('qr', (qr) => {
  console.log(`[${getTimestamp()}] 📱 Please scan the QR code to authenticate`);
});

client.on('authenticated', () => {
  console.log(`[${getTimestamp()}] ✅ Bot authenticated successfully`);
});

client.on('auth_failure', () => {
  console.log(`[${getTimestamp()}] ❌ Authentication failed`);
});

client.on('disconnected', (reason) => {
  console.log(`[${getTimestamp()}] 🔌 Bot disconnected:`, reason);
});

// Start the client
client.initialize();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(`\n[${getTimestamp()}] 🛑 Shutting down diagnostic tool...`);
  client.destroy();
  process.exit(0);
});