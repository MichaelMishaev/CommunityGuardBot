# CommunityGuard WhatsApp Bot

A powerful WhatsApp group management bot with advanced moderation features and LID (WhatsApp's new identifier system) support.

## Features

### 🛡️ Security & Protection
- **Automatic Invite Link Detection**: Automatically removes WhatsApp group invite links and kicks the sender
- **Blacklist System**: Automatically kicks blacklisted users when they join groups
- **Whitelist System**: Protect trusted users from moderation actions
- **LID Support**: Full support for WhatsApp's new @lid identifier system

### 👮 Moderation Tools

#### Basic Commands
- `#kick` - Kick a user from the group (reply to their message)
- `#mute [minutes]` - Mute the entire group for specified minutes (admin only)
- `#mute [minutes]` (reply) - Mute a specific user (auto-kick after 3 violations)
- `#warn` - Send a warning to a user (reply to their message)
- `#clear` - Delete all messages from a specific user (reply to their message)
- `#botkick` - Automatically kick all blacklisted users from the current group

#### Blacklist Management
- `#blacklist [number]` - Add a number to the blacklist
- `#unblacklist [number]` - Remove a number from the blacklist
- `#blacklst` - List all blacklisted numbers
- `#unb [number]` - Unban a number (reply to bot alert message)

#### Whitelist Management
- `#whitelist [number]` - Add a number to the whitelist
- `#unwhitelist [number]` - Remove a number from the whitelist
- `#whitelst` - List all whitelisted numbers

### 📊 Group Management

#### Admin Tools
- `#cf` - Check for foreign (non-972) numbers in the group
- `#stats` - Show group statistics (member count, admin count, etc.)
- `#announce [message]` - Send an announcement to all group members
- `#pin [days]` - Pin a message (default 7 days, reply to message)

#### Super Admin Tools
- `#promote` - Promote a user to admin (reply to their message)
- `#demote` - Demote an admin to regular user (reply to their message)

### 🌐 Communication
- `#translate` - Translate a message to Hebrew (reply or provide text)
- `#help` - Show all available commands
- `#commands` - Display custom commands from Firestore
- `#status` - Check bot status (admin only)
- `#reload` - Reload commands from Firestore (admin only)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/CommunityGuard.git
cd CommunityGuard
```

2. Install dependencies:
```bash
npm install
```

3. Set up Firebase:
   - Create a Firebase project
   - Download your service account key
   - Save it as `guard1-dbkey.json` in the project root

4. Configure the bot:
   - Edit `inviteMonitor.js`
   - Update `ADMIN_PHONE` and `ALERT_PHONE` with your phone numbers

5. Run the bot:
```bash
node inviteMonitor.js
```

## Configuration

### Required Environment Variables
- `ADMIN_PHONE`: Super admin phone number (e.g., '972555020829')
- `ALERT_PHONE`: Phone number for alerts (e.g., '972544345287')

### Firebase Collections
The bot uses the following Firestore collections:
- `whitelist`: Stores whitelisted users
- `blacklist`: Stores blacklisted users
- `muted_users`: Stores temporarily muted users
- `commands`: Stores custom commands

## Features in Detail

### WhatsApp URL Detection
When a user posts a WhatsApp group invite link:
1. The message is immediately deleted
2. The sender is kicked from the group
3. The sender is added to the blacklist
4. The group code from the URL is also blacklisted as a potential LID
5. An alert is sent to the admin with group details

### Mute System
- **Group Mute**: Restricts all members except admins from sending messages
- **User Mute**: Silently deletes messages from muted users
- **Auto-kick**: Users who send more than 3 messages while muted are automatically kicked

### LID Support
The bot fully supports WhatsApp's new @lid identifier system:
- Automatically handles both traditional phone numbers and LID formats
- Properly identifies users regardless of their identifier type
- Ensures all moderation features work with both formats

## Security Best Practices

1. **Whitelist trusted users** to prevent accidental moderation
2. **Regularly review blacklist** to ensure it's up to date
3. **Limit admin access** to trusted individuals only
4. **Monitor alerts** sent to ALERT_PHONE for suspicious activity
5. **Keep the bot updated** to ensure compatibility with WhatsApp changes

## Troubleshooting

### Bot not responding to commands
- Ensure the bot has admin privileges in the group
- Check that commands are typed correctly (case-insensitive)
- Verify Firebase connection is working

### Mute command shows "bot must be an admin"
- The bot's LID/phone number must have admin privileges
- Try removing and re-adding the bot as admin

### Users not being kicked
- Verify the bot has admin privileges
- Check if the target user is also an admin (admins cannot be kicked)
- Ensure the user is properly blacklisted

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues or questions:
- Open an issue on GitHub
- Contact the admin at the configured ADMIN_PHONE number

## Changelog

### Version 1.0.6 - LID Support Update
- Added full support for WhatsApp's @lid identifier system
- Fixed mute command LID vs phone number comparison
- Enhanced WhatsApp URL detection to extract and blacklist group LIDs
- Improved blacklist kick notifications with timestamps and group URLs
- Added new group management commands:
  - `#warn` - Send warnings to users
  - `#stats` - View group statistics
  - `#clear` - Clear messages from specific users
  - `#promote`/`#demote` - Manage admin roles
  - `#announce` - Send group announcements
  - `#pin` - Pin important messages

---

🤖 Powered by whatsapp-web.js