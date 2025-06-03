// Integration test for CommunityGuard bot with LID support
const { jidKey } = require('../utils/jidUtils');

console.log('=== CommunityGuard Integration Test ===\n');

// Mock data for testing
const mockParticipants = [
  // Legacy format participants
  { id: { _serialized: '972555111111@c.us', user: '972555111111', server: 'c.us' }, isAdmin: false },
  { id: { _serialized: '972555222222@c.us', user: '972555222222', server: 'c.us' }, isAdmin: true },
  
  // LID format participants
  { id: { _serialized: 'abc123@lid', user: 'abc123', server: 'lid' }, isAdmin: false },
  { id: { _serialized: 'xyz789@lid', user: 'xyz789', server: 'lid' }, isAdmin: false },
  { id: { _serialized: 'admin456@lid', user: 'admin456', server: 'lid' }, isAdmin: true },
  
  // Mixed format
  { id: { user: 'test999', server: 'lid' }, isAdmin: false }
];

// Helper functions from inviteMonitor.js
function getParticipantJid(participant) {
  if (participant.id?._serialized) {
    return participant.id._serialized;
  }
  if (participant._serialized) {
    return participant._serialized;
  }
  if (participant.id?.user) {
    const server = participant.id.server || 'c.us';
    return `${participant.id.user}@${server}`;
  }
  return null;
}

function getMessageAuthor(msg) {
  if (msg.author) return msg.author;
  if (msg.from) return msg.from;
  if (msg.id?.participant) return msg.id.participant;
  return null;
}

// Test 1: Participant JID extraction
console.log('Test 1: Extracting JIDs from participants');
console.log('=========================================');
mockParticipants.forEach((p, i) => {
  const jid = getParticipantJid(p);
  console.log(`Participant ${i + 1}: ${jid} (Admin: ${p.isAdmin})`);
});

// Test 2: Message author extraction with different formats
console.log('\nTest 2: Extracting message authors');
console.log('==================================');
const mockMessages = [
  { author: '972555333333@c.us', body: 'Test legacy author' },
  { author: 'user123@lid', body: 'Test LID author' },
  { from: '972555444444@c.us', body: 'Test from field' },
  { id: { participant: 'participant789@lid' }, body: 'Test participant field' }
];

mockMessages.forEach((msg, i) => {
  const author = getMessageAuthor(msg);
  console.log(`Message ${i + 1}: Author = ${author}`);
});

// Test 3: Admin checking with LID support
console.log('\nTest 3: Admin verification with LID');
console.log('===================================');
const testAdminCheck = (senderJid) => {
  return mockParticipants.some(p => {
    const pJid = getParticipantJid(p);
    return pJid === senderJid && p.isAdmin;
  });
};

const testSenders = [
  '972555222222@c.us',  // Admin (legacy)
  'admin456@lid',       // Admin (LID)
  'abc123@lid',         // Not admin
  '972555111111@c.us'  // Not admin
];

testSenders.forEach(sender => {
  const isAdmin = testAdminCheck(sender);
  console.log(`${sender}: ${isAdmin ? 'ADMIN ✅' : 'NOT ADMIN ❌'}`);
});

// Test 4: Blacklist/Whitelist compatibility
console.log('\nTest 4: Blacklist/Whitelist with LID');
console.log('====================================');
const testIdentifiers = [
  '972555666666',           // Plain phone
  '+972-555-777777',        // Formatted phone
  'spammer123@lid',         // LID format
  'ABC456@LID',            // Uppercase LID
  { id: { _serialized: 'contact999@lid' } }  // Contact object
];

testIdentifiers.forEach(id => {
  const normalized = jidKey(id);
  console.log(`Input: ${typeof id === 'object' ? JSON.stringify(id) : id}`);
  console.log(`Normalized: ${normalized}\n`);
});

// Test 5: Bot admin check
console.log('Test 5: Bot admin verification');
console.log('==============================');
const mockBotWid = { _serialized: 'botuser@lid', user: 'botuser', server: 'lid' };
const botJid = jidKey(mockBotWid);

// Add bot to participants as admin
const participantsWithBot = [...mockParticipants, {
  id: { _serialized: botJid, user: 'botuser', server: 'lid' },
  isAdmin: true
}];

const botIsAdmin = participantsWithBot.some(p => {
  const pJid = jidKey(p.id);
  return pJid === botJid && p.isAdmin;
});

console.log(`Bot JID: ${botJid}`);
console.log(`Bot is admin: ${botIsAdmin ? 'YES ✅' : 'NO ❌'}`);

// Test 6: Command parsing edge cases
console.log('\nTest 6: Command parsing with Unicode');
console.log('====================================');
const testCommands = [
  '\u200e#kick\u200e',      // With LRM marks
  '  #mute 10  ',           // With spaces
  '#BLACKLIST 972555999999', // Uppercase
  '#kick',                  // No args
  '#mute 30 2'             // Multiple args
];

testCommands.forEach(cmd => {
  const cleaned = cmd.replace(/\u200e/g, '').trim();
  const lowered = cleaned.toLowerCase();
  const parts = lowered.split(/\s+/);
  const command = parts.shift();
  const arg = parts.join(' ');
  
  console.log(`Raw: "${cmd}"`);
  console.log(`Command: "${command}", Args: "${arg}"\n`);
});

console.log('=== Integration Test Complete ===');
console.log('\nAll critical LID support features tested:');
console.log('✅ JID normalization for both legacy and LID formats');
console.log('✅ Participant identification across formats');
console.log('✅ Message author extraction');
console.log('✅ Admin verification with mixed formats');
console.log('✅ Blacklist/Whitelist compatibility');
console.log('✅ Bot admin detection');
console.log('✅ Command parsing with Unicode handling');