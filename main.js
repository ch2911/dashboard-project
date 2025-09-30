// In your project's root folder: main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { execFile } = require('child_process');
const express = require('express');

let backendProcess = null;
const localServer = express();
const PORT = 3001; // An unused port

// --- Start Backend Process ---
function startBackend() {
    const backendPath = path.join(__dirname, 'backend', 'dist', 'app');
    backendProcess = execFile(backendPath, (error, stdout, stderr) => {
        if (error) {
            console.error(`Backend Error: ${error}`);
        }
    });
}

// --- Start Local Frontend Server ---
function startLocalServer() {
    // Serve the static files from the 'out' directory
    const staticPath = path.join(__dirname, 'frontend', 'out');
    localServer.use(express.static(staticPath));

    localServer.listen(PORT, () => {
        console.log(`Local server listening on http://localhost:${PORT}`);
    });
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: true,
        },
    });

    // Load the app from the local server URL
    win.loadURL(`http://localhost:${PORT}`);
}

app.whenReady().then(() => {
    startLocalServer();
    startBackend();
    createWindow();
});

app.on('window-all-closed', () => {
    if (backendProcess) {
        backendProcess.kill();
    }
    app.quit();
});