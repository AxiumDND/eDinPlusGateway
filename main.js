// main.js

// =============================================================================
// Module Imports
// =============================================================================
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const net = require('net');
const fetch = require('node-fetch/lib/index.js');

// =============================================================================
// Global Variables and Settings File Path
// =============================================================================
let mainWindow;
const settingsFile = path.join(__dirname, 'settings.txt');

console.log("🔍 Electron App Starting...");

// =============================================================================
// Application Configuration
// =============================================================================
app.disableHardwareAcceleration();

// =============================================================================
// Function: readSettings
// =============================================================================
function readSettings() {
  console.log("📂 Reading settings file...");
  if (fs.existsSync(settingsFile)) {
    const content = fs.readFileSync(settingsFile, 'utf-8');
    console.log("✅ Settings file found.");
    const settings = {};
    content.split(/\r?\n/).forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        settings[key.trim()] = value.trim();
      }
    });
    console.log("🔹 Loaded settings:", settings);
    return settings;
  }
  console.log("⚠️ No settings file found, using defaults.");
  return { IP_ADDRESS: '192.168.1.100' };
}

// =============================================================================
// Creating the Main Application Window
// =============================================================================
app.whenReady().then(() => {
  console.log("🚀 Creating Electron Window...");
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.webContents.once('did-finish-load', () => {
    console.log("✅ UI Loaded - Sending settings to renderer...");
    const settings = readSettings();
    mainWindow.webContents.send('load-settings', settings);
  });
});

// =============================================================================
// IPC Handlers
// =============================================================================

// Update settings from renderer
ipcMain.on('update-settings', (event, settings) => {
  console.log("🔄 Received new settings from UI:", settings);
  const content = Object.entries(settings)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  fs.writeFileSync(settingsFile, content, 'utf-8');
  event.reply('log-message', `Settings updated: ${JSON.stringify(settings)}`);
});

// Request current settings
ipcMain.on('request-settings', (event) => {
  const settings = readSettings();
  event.reply('load-settings', settings);
});

// Send command (TCP or HTTP) from renderer
ipcMain.on('send-command', (event, commandObj) => {
  console.log("DEBUG: Main Process Received Command:", commandObj);
  if (commandObj.connection === 'tcp') {
    sendTCPCommand(commandObj.ip, commandObj.port, commandObj.type, event, (err, response) => {
      if (err) {
        console.error("DEBUG: Error sending TCP command:", err);
        event.reply('log-message', `TCP Error: ${err.message}`);
      } else {
        console.log("DEBUG: TCP command response:", response);
        event.reply('log-message', `TCP Response: ${response}`);
      }
    });
  } else {
    event.reply('log-message', "HTTP Sent: " + commandObj.type);
    sendHTTPCommand(commandObj.url, commandObj.type)
      .then(responseText => {
        console.log("DEBUG: HTTP command response:", responseText);
        event.reply('log-message', `HTTP Response: ${responseText}`);
      })
      .catch(error => {
        console.error("DEBUG: HTTP command error:", error);
        event.reply('log-message', `HTTP Error: ${error.message}`);
      });
  }
});

// New IPC Handler: Open the scene edit pop-up window
ipcMain.on('open-scene-edit', (event, sceneData) => {
  console.log("DEBUG: Received request to open scene edit window for scene:", sceneData);
  
  // Create a new BrowserWindow for the edit pop-up.
  let editWindow = new BrowserWindow({
    width: 400,
    height: 300,
    title: "Edit Scene",
    webPreferences: {
      // For security, we disable Node integration in the pop-up.
      contextIsolation: true
      // If you need to expose any APIs to the edit window, you can add a preload here.
    }
  });
  
  // Build the URL for the edit window and pass scene details via query parameters.
  let sceneId = sceneData.num || "";
  let sceneName = sceneData.name || "";
  let editUrl = `file://${__dirname}/scene_edit.html?sceneId=${encodeURIComponent(sceneId)}&sceneName=${encodeURIComponent(sceneName)}`;
  editWindow.loadURL(editUrl);
});

// =============================================================================
// Function: sendTCPCommand
// =============================================================================
function sendTCPCommand(ip, port, command, event, callback) {
  console.log(`DEBUG: Attempting TCP connection to ${ip}:${port}`);
  const client = new net.Socket();
  client.connect(port, ip, () => {
    console.log("DEBUG: TCP connection established");
    client.write(command, () => {
      console.log("DEBUG: TCP Sent:", command);
      event.reply('log-message', "TCP Sent: " + command);
    });
  });
  client.on('data', (data) => {
    const response = data.toString();
    console.log("DEBUG: Received TCP data:", response);
    if (callback) {
      callback(null, response);
    }
    client.destroy();
  });
  client.on('error', (err) => {
    console.error("DEBUG: TCP connection error:", err);
    if (callback) {
      callback(err);
    }
  });
}

// =============================================================================
// Function: sendHTTPCommand
// =============================================================================
function sendHTTPCommand(url, command) {
  console.log(`DEBUG: Sending HTTP Request to: ${url}`);
  console.log(`DEBUG: HTTP Payload: ${command}`);
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: command
  })
  .then(response => {
    console.log("DEBUG: HTTP Response Status:", response.status);
    return response.text();
  });
}

