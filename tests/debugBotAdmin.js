// Debug script to understand bot admin check issues
const { Client, LocalAuth } = require('whatsapp-web.js');
const { jidKey } = require('../utils/jidUtils');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('ready', async () => {
    console.log('✅ Bot is ready!\n');
    
    console.log('=== Debugging Bot Info ===');
    console.log('client.info:', JSON.stringify(client.info, null, 2));
    
    // Try different ways to get bot info
    console.log('\n=== Trying Different Methods ===');
    
    // Method 1: Direct access
    console.log('1. client.info.wid:', client.info.wid);
    console.log('   Type:', typeof client.info.wid);
    
    // Method 2: Check for me
    console.log('\n2. client.info.me:', client.info.me);
    
    // Method 3: Check pushname
    console.log('\n3. client.info.pushname:', client.info.pushname);
    
    // Method 4: Try to get contact
    try {
        const me = await client.getContactById(client.info.wid._serialized || client.info.wid);
        console.log('\n4. Bot contact:', {
            number: me.number,
            id: me.id,
            id_serialized: me.id?._serialized,
            isMe: me.isMe
        });
    } catch (e) {
        console.log('\n4. Error getting bot contact:', e.message);
    }
    
    // Method 5: Check in a real group
    const chats = await client.getChats();
    const groups = chats.filter(c => c.isGroup);
    
    if (groups.length > 0) {
        console.log(`\n=== Checking in Group: ${groups[0].name} ===`);
        const participants = groups[0].participants;
        
        console.log('Total participants:', participants.length);
        
        // Log all participants to find the bot
        console.log('\nAll participants:');
        participants.forEach((p, i) => {
            const pJid = p.id?._serialized || p.id;
            console.log(`${i + 1}. JID: ${pJid}, isAdmin: ${p.isAdmin}`);
        });
        
        // Try to find bot in participants
        const botWid = client.info.wid;
        console.log('\nSearching for bot with wid:', botWid);
        
        const botParticipant = participants.find(p => {
            const pJid = p.id?._serialized || p.id;
            // Try multiple comparisons
            return pJid === botWid || 
                   pJid === (botWid._serialized || botWid) ||
                   pJid === jidKey(botWid);
        });
        
        if (botParticipant) {
            console.log('\n✅ Found bot in participants!');
            console.log('Bot is admin:', botParticipant.isAdmin);
        } else {
            console.log('\n❌ Bot not found in participants');
        }
    }
    
    process.exit(0);
});

client.initialize();
console.log('🔄 Initializing debug client...');