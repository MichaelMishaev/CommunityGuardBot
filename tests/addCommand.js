// addHelp.js (in the project root)
const path  = require('path');
const admin = require('firebase-admin');

// Load the JSON key file itself, not just its path
const serviceAccount = require(path.join(__dirname, '../guard1-dbkey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function insertHelpCommand() {
  try {
    await db.collection('commands').doc('help').set({
      cmd: '#help',
      description: 'Show the list of available commands',
      content:
        '- #status - Check bot status\n' +
        '- #reload - Reload commands from Firestore\n' +
        '- #whitelist - Add or view whitelisted numbers (e.g., #whitelist 972555123456)\n' +
        '- #unwhitelist - Remove a number from the whitelist (e.g., #unwhitelist 972555123456)\n' +
        '- #kick - Kick a user from the group (reply to a message)\n' +
        '- #cf - Check for foreign numbers in the group\n' +
        '- #commands - Show all custom commands from Firestore\n' +
        '- #help - Show this help message'
    });
    console.log('✅ #help command inserted successfully!');
  } catch (error) {
    console.error('❌ Failed to insert #help command:', error);
  }
}

insertHelpCommand();
