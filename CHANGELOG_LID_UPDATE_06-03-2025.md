# CommunityGuard Bot - LID Support Update
## Changelog for June 3, 2025

### Overview
This update addresses the critical issue where WhatsApp/Meta's update replaced phone numbers with LID (Local Identifier) numbers, which broke several bot functionalities including the #kick command and user identification features.

### Version
- **Previous Version**: 1.0.5
- **New Version**: 1.0.6 - LID Support Update

### Major Changes

#### 1. Enhanced JID Handling (`utils/jidUtils.js`)
- **Modified**: `jidKey()` function now handles both legacy phone numbers and new LID format
- **Added**: Support for various LID formats:
  - `username@lid` (new LID format)
  - `123456789@c.us` (legacy phone format)
  - Mixed case handling (converts to lowercase)
  - Edge case handling for non-numeric identifiers

#### 2. Core Bot Updates (`inviteMonitor.js`)

##### New Helper Functions
```javascript
// Enhanced helper to get participant JID with LID support
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

// Enhanced helper to get message author with LID support
function getMessageAuthor(msg) {
  if (msg.author) return msg.author;
  if (msg.from) return msg.from;
  if (msg.id?.participant) return msg.id.participant;
  return null;
}
```

##### Fixed Commands
1. **#kick** - Now works with both LID and legacy formats
   - Uses `getMessageAuthor()` to extract target user
   - Properly identifies users regardless of format

2. **#mute** - Enhanced for LID support
   - Admin verification uses `getParticipantJid()`
   - Target user identification via `getMessageAuthor()`

3. **#botkick** - Fully updated for LID
   - Iterates through participants using `getParticipantJid()`
   - Bot admin check properly handles LID format

4. **#cf** (Check Foreign) - Updated participant iteration
   - Uses `getParticipantJid()` for proper identification

5. **#translate** - Fixed author identification
   - Uses `getMessageAuthor()` for quoted messages

##### Other Improvements
- All admin checks now use the enhanced `getParticipantJid()` function
- Bot admin verification properly compares JIDs using `jidKey()`
- Invite link moderation uses `getMessageAuthor()` for user identification
- Group join event handling updated for blacklist checking with LID

#### 3. Service Layer Updates
All service files were already using `jidKey()` for normalization, so they automatically support LID:
- `whitelistService.js` - No changes needed
- `blacklistService.js` - No changes needed  
- `muteService.js` - No changes needed

### Testing

#### Created Test Files
1. **`tests/testLidSupport.js`** - Unit tests for JID handling
   - 14 test cases covering all formats
   - 100% pass rate
   - Tests legacy phones, LID formats, contact objects

2. **`tests/integrationTest.js`** - Integration tests
   - Tests participant extraction
   - Message author identification
   - Admin verification across formats
   - Blacklist/whitelist compatibility
   - Command parsing with Unicode

### Technical Details

#### LID Format Examples
- Legacy: `972555123456@c.us`
- New LID: `abc123def@lid`
- Mixed environments supported simultaneously

#### Backward Compatibility
- All legacy phone numbers continue to work
- Database entries don't need migration
- Existing blacklists/whitelists remain functional

### Installation & Usage
1. Ensure all dependencies are installed:
   ```bash
   npm install
   ```

2. Run the bot:
   ```bash
   npm start
   ```

3. Test LID support:
   ```bash
   node tests/testLidSupport.js
   node tests/integrationTest.js
   ```

### Known Issues Resolved
- ✅ #kick command not working with LID users
- ✅ Admin verification failing for LID accounts
- ✅ Bot unable to identify itself as admin
- ✅ Mute functionality broken for LID users
- ✅ Blacklist/whitelist not recognizing LID format

### Future Considerations
- Monitor WhatsApp Web.js updates for official LID support
- Consider implementing user mention caching for faster lookups
- Add telemetry to track LID vs legacy usage patterns

### Migration Notes
No database migration required. The bot will automatically handle both formats.

### Support
For issues or questions about this update:
- Check the test files for implementation examples
- Review the helper functions in `inviteMonitor.js`
- Ensure you're using the latest version of whatsapp-web.js (currently 1.28.0)

---
**Update completed by**: Assistant
**Date**: June 3, 2025
**Files modified**: 
- `inviteMonitor.js`
- `utils/jidUtils.js`
- Created 2 test files
- This changelog