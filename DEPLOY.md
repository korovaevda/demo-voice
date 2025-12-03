# Deployment Guide

## Server Deployment (Production)

### Step 1: Clone and Setup

```bash
# Navigate to your deployment directory
cd /opt

# Clone the repository
git clone https://github.com/korovaevda/demo-voice.git

# Enter the project directory
cd demo-voice

# Install dependencies
npm install

# Create .env file with your API key
echo "GEMINI_API_KEY=your_api_key_here" > .env

# Build the production bundle
npm run build
```

### Step 2: Deploy with PM2 (Recommended)

**Option A: Using ecosystem.config.cjs (Easiest)**

```bash
# Install PM2 globally if not already installed
npm install -g pm2

# Create logs directory
mkdir -p logs

# Start the application using the ecosystem config
pm2 start ecosystem.config.cjs

# Save PM2 process list (to restart on server reboot)
pm2 save

# Setup PM2 to start on system boot
pm2 startup
```

**Option B: Manual PM2 command**

```bash
# For production (preview server)
pm2 start npm --name "demo-voice" -- run preview -- --host --port 3000

# For development (not recommended for production)
pm2 start npm --name "demo-voice" -- run dev -- --host
```

### Step 3: Manage the Application

```bash
# View status
pm2 status

# View logs (real-time)
pm2 logs demo-voice

# View logs (from file, if using ecosystem config)
tail -f logs/combined.log

# Restart application
pm2 restart demo-voice

# Stop application
pm2 stop demo-voice

# Delete from PM2
pm2 delete demo-voice
```

### Step 4: Update Deployment

```bash
# Navigate to project directory
cd /opt/demo-voice

# Pull latest changes
git pull

# Install any new dependencies
npm install

# Rebuild
npm run build

# Restart PM2 process
pm2 restart demo-voice
```

## Local Development

```bash
# Install dependencies
npm install

# Create .env file
echo "GEMINI_API_KEY=your_api_key_here" > .env

# Start development server
npm run dev
```

## Important Notes

### HTTPS Requirement
⚠️ **This application uses `getUserMedia` for microphone access**, which requires:
- **Localhost**: Works with HTTP
- **Remote server**: **MUST use HTTPS** (not HTTP)

To use HTTPS on your server, you need to:
1. Use a reverse proxy like **nginx** or **Caddy**
2. Configure SSL certificate (Let's Encrypt recommended)

### Firewall Configuration
Ensure your server firewall allows traffic on the required port:
```bash
# For Ubuntu/Debian with ufw
sudo ufw allow 3000/tcp

# Or if using nginx as reverse proxy
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

### Environment Variables
Make sure `.env` file contains:
```
GEMINI_API_KEY=your_actual_api_key
```

## Troubleshooting

**PM2 not found:**
```bash
npm install -g pm2
```

**Port already in use:**
```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>
```

**Application not accessible from outside:**
- Check if `--host` flag is used (required for external access)
- Check firewall settings
- Verify the port is correct
