# 🚀 CommGuard Bot Deployment Guide

## 📋 Prerequisites
- GitHub account with your bot repository
- Credit card for VPS payment
- Basic terminal/SSH knowledge

## 🌊 DigitalOcean Deployment (Recommended)

### Step 1: Create DigitalOcean Droplet
1. Go to [DigitalOcean](https://www.digitalocean.com/)
2. Create account and add payment method
3. Create new Droplet:
   - **Image:** Ubuntu 22.04 LTS
   - **Plan:** Basic ($6/month - 1GB RAM, 1 CPU)
   - **Region:** Choose closest to you
   - **Authentication:** SSH Key (recommended) or Password

### Step 2: Connect to Your Server
```bash
# Replace YOUR_SERVER_IP with actual IP
ssh root@YOUR_SERVER_IP
```

### Step 3: Server Setup
```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt-get install -y nodejs

# Install Git and other tools
apt install git screen htop -y

# Verify installation
node --version
npm --version
```

### Step 4: Deploy Your Bot
```bash
# Clone your repository
git clone https://github.com/MichaelMishaev/CommunityGuardBot.git
cd CommunityGuardBot

# Install dependencies
npm install

# For bCommGuard (Baileys version - RECOMMENDED)
cd bCommGuard
npm install
```

### Step 5: Setup Firebase (if using database features)
```bash
# Upload your real Firebase key file
# Replace the mock guard1-dbkey.json with your real one
nano guard1-dbkey.json
# Paste your real Firebase service account JSON
```

### Step 6: Start the Bot
```bash
# Create a persistent session
screen -S commguard

# Start the bot (choose one)
# Option A: Original version
node inviteMonitor.js

# Option B: bCommGuard (Baileys - recommended)
cd bCommGuard && node index.js
```

### Step 7: QR Code Authentication
1. When the QR code appears in terminal
2. Open WhatsApp on your phone
3. Go to Settings > Linked Devices
4. Tap "Link a Device"
5. Scan the QR code from your terminal

### Step 8: Keep Bot Running
```bash
# Detach from screen session (bot keeps running)
# Press: Ctrl + A, then D

# To reconnect later:
screen -r commguard

# To see running screens:
screen -ls
```

## 🔄 Auto-Restart Setup

### Create systemd service for auto-restart:
```bash
# Create service file
nano /etc/systemd/system/commguard.service
```

```ini
[Unit]
Description=CommGuard WhatsApp Bot
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/CommunityGuardBot/bCommGuard
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start service
systemctl enable commguard
systemctl start commguard

# Check status
systemctl status commguard

# View logs
journalctl -u commguard -f
```

## 🔐 Security Setup

### 1. Create non-root user
```bash
adduser botuser
usermod -aG sudo botuser
su - botuser
```

### 2. Setup UFW Firewall
```bash
ufw enable
ufw allow ssh
ufw allow 22
ufw status
```

### 3. Setup SSH key authentication (recommended)
```bash
# On your local machine, generate SSH key
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"

# Copy public key to server
ssh-copy-id root@YOUR_SERVER_IP
```

## 📊 Monitoring

### Check bot status:
```bash
# View running processes
ps aux | grep node

# Check memory usage
htop

# View bot logs (if using systemd)
journalctl -u commguard -f

# Manual log viewing
tail -f /path/to/your/logfile
```

## 💰 Cost Breakdown

| Service | Monthly Cost | Features |
|---------|-------------|----------|
| DigitalOcean Basic | $6 | 1GB RAM, 1 CPU, 25GB SSD |
| Linode Nanode | $5 | 1GB RAM, 1 CPU, 25GB SSD |
| Vultr Regular | $3.50 | 512MB RAM, 1 CPU, 10GB SSD |

## 🔧 Troubleshooting

### Bot crashes/disconnects:
```bash
# Check logs
systemctl status commguard
journalctl -u commguard --no-pager -l

# Restart service
systemctl restart commguard
```

### Update bot code:
```bash
cd /root/CommunityGuardBot
git pull origin master
cd bCommGuard
npm install
systemctl restart commguard
```

### Memory issues:
```bash
# Check memory usage
free -h

# Add swap file if needed
fallocate -l 1G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
```

## 🎯 Which Version to Deploy?

**Recommendation:** Deploy **bCommGuard** (Baileys version)
- ✅ Lower memory usage (~50-100MB vs 500MB+)
- ✅ Faster startup (2-5 seconds vs 10-30 seconds)
- ✅ More reliable kick function
- ✅ Better error handling
- ✅ More efficient WebSocket connection

## 📱 Alternative: Local Development Server

If you want to test locally first:
```bash
# Install ngrok for external access
npm install -g ngrok

# Start your bot locally
node index.js

# In another terminal, expose to internet
ngrok http 3000
```

This setup will give you a reliable, 24/7 running WhatsApp bot for about $6/month! 