# CommunityGuard WhatsApp Bot

**Version:** 1.2.1  
**Main File:** `inviteMonitor.js`

A comprehensive WhatsApp group moderation bot designed to protect communities from spam, unwanted invite links, and malicious users. Built with Node.js, WhatsApp Web.js, and Firebase Firestore for persistent data storage.

## 🚀 Overview

CommunityGuard is an advanced WhatsApp bot that provides automated group protection, user management, and moderation capabilities. It features intelligent message processing, automatic threat detection, and comprehensive admin tools for maintaining healthy group environments.

## ✨ Key Features

### 🛡️ Automatic Protection
- **Invite Link Detection**: Automatically detects and removes WhatsApp group invite links
- **Blacklist Enforcement**: Instantly removes known problematic users who try to join
- **Spam Protection**: Advanced message queue processing to prevent spam
- **Foreign Number Detection**: Identifies and manages foreign phone numbers

### 👥 User Management
- **Whitelist/Blacklist System**: Comprehensive user access control
- **Mute Functionality**: Temporary user silencing with automatic enforcement
- **Progressive Moderation**: Shadow-delete messages before taking stronger action
- **User Activity Tracking**: Complete user interaction history

### 🎛️ Administrative Controls
- **Admin Verification**: Multiple methods to verify bot admin privileges
- **Permission-Based Commands**: Role-based access to different features
- **Custom Commands**: Dynamic command loading from Firestore database
- **Group Statistics**: Detailed analytics and member information

## 📋 Available Commands

### 🔧 Administrative Commands (Admin Only)
| Command | Description | Usage |
|---------|-------------|-------|
| `#status` | Check bot status | `#status` |
| `#reload` | Reload commands from database | `#reload` |
| `#help` | Display help message | `#help` |
| `#commands` | Show all custom commands | `#commands` |

### ✅ Whitelist Management (Admin Only)
| Command | Description | Usage |
|---------|-------------|-------|
| `#whitelist` | Add number to whitelist | `#whitelist 972555123456` |
| `#unwhitelist` | Remove from whitelist | `#unwhitelist 972555123456` |
| `#whitelst` | List whitelisted numbers | `#whitelst` |

### 🚫 Blacklist Management (Admin Only)
| Command | Description | Usage |
|---------|-------------|-------|
| `#blacklist` | Add number to blacklist | `#blacklist 972555123456` |
| `#unblacklist` | Remove from blacklist | `#unblacklist 972555123456` |
| `#blacklst` | List blacklisted numbers | `#blacklst` |
| `#unb` | Alternative unban command | Reply to bot message with `#unb [number]` |

### 🚨 Group Management
| Command | Description | Usage |
|---------|-------------|-------|
| `#kick` | Kick user from group | Reply to message with `#kick` |
| `#ban` | Ban user permanently | Reply to message with `#ban` |
| `#cf` | Check for foreign numbers | `#cf` (bot account only) |
| `#botkick` | Remove all blacklisted users | `#botkick` |
| `#warn` | Send warning to user | Reply to message with `#warn` |

### 🔇 Moderation Commands (Admin Only)
| Command | Description | Usage |
|---------|-------------|-------|
| `#mute [minutes]` | Mute entire group | `#mute 30` |
| `#mute [minutes]` | Mute specific user | Reply to message with `#mute 30` |

### 🧹 Message Management
| Command | Description | Usage |
|---------|-------------|-------|
| `#clear` | Delete last 10 user messages | Reply to message with `#clear` |
| `#cleartest` | Test deletion capabilities | `#cleartest` |
| `#cleardebug` | Debug message detection | Reply to message with `#cleardebug` |

### 👑 Super Admin Commands (Admin Phone Only)
| Command | Description | Usage |
|---------|-------------|-------|
| `#promote` | Promote user to admin | Reply to message with `#promote` |
| `#demote` | Demote admin to user | Reply to message with `#demote` |

### 📢 Communication & Information
| Command | Description | Usage |
|---------|-------------|-------|
| `#announce` | Send announcement | `#announce Your message here` |
| `#pin [days]` | Pin message | Reply to message with `#pin 7` |
| `#translate` | Translate to Hebrew | Reply to message with `#translate` |
| `#stats` | Show group statistics | `#stats` |

## 🏗️ Architecture

### Core Components

#### **Main Bot (`inviteMonitor.js`)**
- WhatsApp Web.js client initialization
- Message processing queue system
- Command routing and execution
- Event handling for joins, leaves, and admin changes

#### **Service Modules**
- **`blacklistService.js`**: User blacklist management with Firebase persistence
- **`whitelistService.js`**: User whitelist management with legacy support
- **`muteService.js`**: Temporary user muting with automatic enforcement
- **`userService.js`**: Comprehensive user data tracking and management

#### **Utility Functions**
- **`jidUtils.js`**: WhatsApp JID normalization and LID support

#### **Configuration**
- **`firebaseConfig.js`**: Firebase Admin SDK initialization
- **`firebase.json`**: Firestore configuration
- **`guard1-dbkey.json`**: Firebase service account credentials

### Message Processing System

The bot uses an advanced queue-based message processing system:

1. **Message Queuing**: Messages are queued per user to prevent race conditions
2. **Deduplication**: Prevents duplicate message processing
3. **Batch Processing**: Processes messages in batches to avoid WhatsApp rate limits
4. **Rate Limiting**: 200ms delays between message deletions
5. **Cooldown System**: 10-second cooldown between actions for the same user

### Security Features

- **Admin Verification**: Multiple verification methods for bot admin status
- **Permission Checks**: Commands restricted based on user roles
- **Contact Validation**: Robust contact and JID validation
- **LID Support**: Enhanced support for WhatsApp's newer LID system

## 🔄 Automatic Behaviors

### Invite Link Protection
1. **Detection**: Monitors all messages for WhatsApp group invite links
2. **Immediate Action**: Instantly deletes invite link messages
3. **User Processing**: Automatically kicks and blacklists violating users
4. **Admin Alerts**: Sends detailed alerts with unblacklist options
5. **Group Code Blacklisting**: Prevents re-sharing of the same invite links

### Blacklisted User Management
1. **Join Monitoring**: Watches for blacklisted users attempting to join
2. **Instant Removal**: Automatically kicks blacklisted users
3. **User Notification**: Sends Hebrew explanation message to removed users
4. **Admin Notifications**: Detailed alerts with group information

### Muted User Enforcement
1. **Message Tracking**: Monitors messages from muted users
2. **Progressive Action**: Shadow-deletes first 3 messages, kicks on 4th
3. **Auto-Unmute**: Automatically removes mute after timeout period
4. **Admin Immunity**: Admins cannot be muted

## 💾 Data Storage

The bot uses Firebase Firestore for persistent data storage:

### Collections
- **`whitelist`**: Approved user JIDs
- **`blacklist`**: Banned user JIDs with legacy support
- **`muted_users`**: Temporarily silenced users with expiration timestamps
- **`users`**: Comprehensive user activity and group membership data
- **`commands`**: Custom commands loaded dynamically

### Data Structure
```javascript
// User Document
{
  name: "User Display Name",
  userId: "1234567890@c.us",
  lastSeen: Timestamp,
  isBlacklisted: false,
  isWhitelisted: false,
  groups: {
    "groupId@g.us": {
      joinedAt: Timestamp,
      isAdmin: false,
      isInGroup: true
    }
  }
}

// Muted User Document
{
  muteUntil: 1734567890000  // Unix timestamp
}
```

## 🚀 Installation & Setup

### Prerequisites
- Node.js 16+ 
- Firebase project with Firestore enabled
- WhatsApp account for the bot

### Installation Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd CommunityGuard_02062025
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Firebase Setup**
   - Create a Firebase project
   - Enable Firestore database
   - Download service account key as `guard1-dbkey.json`
   - Place the key file in the project root

4. **Configure Environment**
   ```bash
   # Production mode
   npm start
   
   # Test mode
   npm run start:test
   
   # Development mode
   npm run dev
   ```

5. **Bot Authentication**
   - Run the bot and scan the QR code with your WhatsApp
   - The bot will save authentication data locally

### Environment Variables
- `MODE`: Set to `prod` or `test` to control bot behavior
- `DEBUG`: Puppeteer debug configuration (automatically set)

## 🛠️ Configuration

### Firebase Rules
The bot requires administrative access to Firestore. Current rules deny all public access:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### Admin Configuration
Configure admin phones and alert numbers in the main bot file:
- `ADMIN_PHONE`: Primary admin phone number
- `ALERT_PHONE`: Phone number for receiving alerts and notifications

## 🔧 Development & Testing

### Test Files
- **`testClearCommand.js`**: Tests message clearing functionality
- **`testCriticalFixes.js`**: Tests core moderation features
- **`testLidSupport.js`**: Tests WhatsApp LID compatibility
- **`integrationTest.js`**: Comprehensive integration tests
- **`debugBotAdmin.js`**: Admin permission debugging

### Running Tests
```bash
node tests/testClearCommand.js
node tests/testCriticalFixes.js
node tests/integrationTest.js
```

### Development Mode
```bash
npm run dev  # Uses nodemon for auto-restart
```

## 🐛 Known Issues

1. **Mute Command**: The mute command may not work properly without proper bot admin status
2. **Clear Command**: Message deletion may occasionally fail due to WhatsApp API limitations
3. **Rate Limiting**: Heavy usage may trigger WhatsApp rate limits

## 🔮 Future Features & Enhancements

### Planned Features
1. **Enhanced Link Detection**: 
   - Expand beyond WhatsApp invites to detect malicious links
   - URL reputation checking
   - Phishing protection

2. **Advanced Moderation**:
   - Spam score calculation
   - AI-powered content filtering
   - Sentiment analysis for toxic message detection

3. **Analytics Dashboard**:
   - Web-based administration interface
   - Real-time group statistics
   - Activity monitoring and reporting

4. **Multi-Language Support**:
   - Configurable language preferences
   - Auto-translation capabilities
   - Localized command interfaces

5. **Integration Enhancements**:
   - Webhook support for external integrations
   - REST API for remote administration
   - Integration with other moderation tools

6. **User Experience Improvements**:
   - Voice message transcription
   - Image content analysis
   - Automated response templates

7. **Security Enhancements**:
   - Two-factor authentication for admin commands
   - Encrypted command transmission
   - Advanced bot detection and prevention

### Technical Improvements
1. **Performance Optimization**:
   - Message processing performance improvements
   - Database query optimization
   - Memory usage reduction

2. **Reliability Enhancements**:
   - Better error recovery mechanisms
   - Improved connection stability
   - Automatic retry logic for failed operations

3. **Scalability Features**:
   - Multi-group management from single bot
   - Distributed processing capabilities
   - Load balancing for high-traffic groups

## 📊 Current Capabilities Summary

### ✅ What We Have Now
- **Complete group moderation suite** with 27+ commands
- **Automatic threat detection** and response
- **Persistent data storage** with Firebase Firestore
- **Advanced message processing** with queue system
- **Comprehensive user management** (whitelist/blacklist/mute)
- **Real-time admin alerts** and notifications
- **Multi-language support** (Hebrew/English)
- **LID compatibility** for modern WhatsApp accounts
- **Progressive moderation** with configurable responses
- **Custom command system** with database loading
- **Group analytics** and statistics
- **Translation services** integrated
- **Pin message functionality** with duration control

### 🔧 Technical Features
- **Robust error handling** with global exception management
- **Rate limiting** to prevent WhatsApp restrictions
- **Contact validation** and JID normalization
- **Deduplication systems** to prevent spam processing
- **Cooldown mechanisms** for user actions
- **Batch processing** for efficiency
- **Debug logging** with timestamps
- **Automatic reconnection** handling

### 🎯 Current Status
The CommunityGuard bot is a **fully functional, production-ready** WhatsApp group moderation solution with enterprise-level features. It successfully handles:
- Automatic spam and invite link detection
- Real-time user management and moderation
- Comprehensive admin tools and controls
- Persistent data storage and management
- Advanced message processing and queue systems

## 📝 License

This project is licensed under the ISC License.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues, feature requests, or pull requests.

## 📞 Support

For support and questions, please refer to the project documentation or create an issue in the repository.

---

**CommunityGuard** - Protecting WhatsApp communities with intelligent automation and comprehensive moderation tools.