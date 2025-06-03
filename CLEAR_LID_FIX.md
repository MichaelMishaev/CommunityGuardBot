# #clear Command Fix for LID Support

## Problem Identified
The #clear command wasn't working because of inconsistent JID comparison between the target user and message authors, especially with LID accounts.

## Solutions Applied

### 1. Enhanced Message Author Detection
```javascript
function getMessageAuthor(msg) {
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
```

### 2. Normalized JID Comparison
```javascript
// Normalize both target and message author JIDs
const targetJid = jidKey(target);
const messageAuthorJid = jidKey(messageAuthor);

// Compare normalized JIDs
if (messageAuthorJid !== targetJid) {
    continue;
}
```

### 3. Added Debug Command
New `#cleardebug` command to help diagnose issues:
- Shows raw and normalized JIDs
- Lists recent messages with authors
- Shows which messages match the target

## How to Use

### 1. Debug First (if having issues):
```
#cleardebug (reply to user's message)
```
This will show:
- Target user's JID (raw and normalized)
- Recent messages with their authors
- Which messages match the target

### 2. Use #clear:
```
#clear (reply to user's message)
```
This will:
- Find last 10 messages from the target user
- Use normalized JID comparison for accuracy
- Delete messages one by one

### 3. If Still Not Working:
Check the console logs which now show:
- Target JID (normalized)
- Sample message authors
- Each message found from target
- Deletion attempts and results

## Key Improvements

1. **Better Author Detection**: Handles multiple message formats
2. **Normalized Comparison**: Uses jidKey() for consistent JID format
3. **Debug Visibility**: Shows exactly what's being compared
4. **LID Support**: Works with both @c.us and @lid formats

## Example Console Output
```
[06/03/2025, 23:45:12] Starting #clear for target: 123456@lid (normalized: 123456@lid)
[06/03/2025, 23:45:12] Fetched 100 messages
[06/03/2025, 23:45:12] Sample message authors:
  Message 1: author = 123456@lid
  Message 2: author = 789012@c.us
  Message 3: author = 123456@lid
[06/03/2025, 23:45:12] Found message 1 from 123456@lid: "Hello world"
[06/03/2025, 23:45:13] Attempting to delete message 1/10
[06/03/2025, 23:45:13] ✅ Successfully deleted message 1
```

The command should now correctly identify and delete messages from LID users!