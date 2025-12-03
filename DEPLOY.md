# Deployment & Background Execution

## Running in the Background

To keep the application running in the background (even after you close the terminal), you can use a process manager like **PM2** or the `nohup` command.

### Option 1: Using PM2 (Recommended)

PM2 is a production process manager for Node.js. It keeps your app alive forever and reloads it without downtime.

1.  **Install PM2 globally:**
    ```bash
    npm install -g pm2
    ```

2.  **Start the application:**
    
    For development (`npm run dev`):
    ```bash
    pm2 start npm --name "demo-voice" -- run dev
    ```

    For production (recommended for VPS):
    ```bash
    # First build the app
    npm run build
    
    # Then preview/serve it
    pm2 start npm --name "demo-voice" -- run preview -- --host
    ```

3.  **Manage the process:**
    - View status: `pm2 status`
    - View logs: `pm2 logs demo-voice`
    - Stop app: `pm2 stop demo-voice`
    - Restart app: `pm2 restart demo-voice`

### Option 2: Using nohup (Simple)

If you don't want to install PM2, you can use the built-in `nohup` command.

```bash
# Run in background and redirect output to a log file
nohup npm run dev > app.log 2>&1 &
```

- To stop it, you'll need to find the process ID (`ps aux | grep npm`) and `kill` it.

## VPS Configuration

Ensure your VPS firewall allows traffic on port `3000` (or whichever port you are using).

If you are using `npm run preview`, it serves on port `4173` by default. You can specify the port:
```bash
npm run preview -- --port 3000 --host
```
