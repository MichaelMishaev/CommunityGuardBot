# #clear Command - Simplified Using Working Logic

## Key Insight
You were absolutely right! The bot successfully identifies and kicks users in:
- WhatsApp invite detection
- #kick command  
- #botkick command

So #clear should use the **exact same logic**.

## Changes Made

### 1. Simplified Structure
```javascript
// OLD: Complex nested approach with normalization
const targetJid = jidKey(target);
const messageAuthorJid = jidKey(messageAuthor);
if (messageAuthorJid !== targetJid) continue;

// NEW: Direct approach like #kick
const target = getMessageAuthor(quotedMsg);
if (messageAuthor !== target) continue;
```

### 2. Same Bot Admin Check
Uses identical logic as #kick and invite detection:
```javascript
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
```

### 3. Test Deletion First
Since invite detection successfully deletes the current message, #clear now:
1. **Deletes the quoted message first** (like invite detection)
2. Then deletes additional messages from the same user
3. Uses exact same `message.delete(true)` approach

### 4. Removed Complexity
- No more JID normalization
- No more complex debugging
- Direct message comparison like other working commands

## Why This Should Work

**Invite Detection Flow:**
1. Gets `target` from `getMessageAuthor(msg)`
2. Uses `await msg.delete(true)` ✅ WORKS
3. Uses `await chat.removeParticipants([target])` ✅ WORKS

**#kick Flow:**
1. Gets `target` from `getMessageAuthor(quotedMsg)`
2. Uses `await quotedMsg.delete(true)` ✅ WORKS
3. Uses `await chat.removeParticipants([target])` ✅ WORKS

**New #clear Flow:**
1. Gets `target` from `getMessageAuthor(quotedMsg)` (same as #kick)
2. Uses `await quotedMsg.delete(true)` (same as #kick)
3. Uses `await message.delete(true)` on additional messages

## How to Test

1. **Reply to a user's message and use:**
   ```
   #clear
   ```

2. **Check console for:**
   ```
   [timestamp] Testing deletion of quoted message first...
   [timestamp] ✅ Successfully deleted quoted message
   [timestamp] Deleting message: Hello world...
   [timestamp] ✅ Deleted message 2
   ```

3. **Should see immediate visual deletion** of the quoted message (if working like invite detection)

## Expected Result
Since the bot can successfully delete invite messages and kick users, using the exact same logic should make #clear work reliably.