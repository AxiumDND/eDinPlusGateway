// main.js

// =============================================================================
// Module Imports
// =============================================================================
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const net = require('net');
const fetch = require('node-fetch/lib/index.js');
const {
  HTTP_TIMEOUT_MS,
  HTTP_RETRY_AFTER_MS,
  TCP_FALLBACK_PORT,
  shouldSendViaTcpOnly,
  shouldSkipHttp,
  nextHttpUnavailableUntil,
  gatewayPostUrl,
  postGatewayCommand
} = require('./gateway-http.js');

let httpUnavailableUntil = 0;

// =============================================================================
// Global Variables and Settings File Path
// =============================================================================
let mainWindow;
const settingsFile = path.join(app.getPath('userData'), 'settings.txt');

// Add global variable for persistent TCP connection
let tcpClient = null;

console.log("🔍 Electron App Starting...");
console.log("📁 Settings file location:", settingsFile);

// =============================================================================
// Application Configuration
// =============================================================================
app.disableHardwareAcceleration();

// =============================================================================
// Function: readSettings
// =============================================================================
function readSettings() {
  console.log("📂 Reading settings file...");
  try {
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
    // If no settings file exists, create one with defaults
    const defaultSettings = {
      IP_ADDRESS: '192.168.1.100',
      CONNECTION_TYPE: 'http',
      USERNAME: 'Administrator',
      PASSWORD: 'mode1234'
    };
    const content = Object.entries(defaultSettings)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    fs.writeFileSync(settingsFile, content, 'utf-8');
    console.log("📝 Created default settings file");
    return defaultSettings;
  } catch (error) {
    console.error("⚠️ Error handling settings:", error);
    return {
      IP_ADDRESS: '192.168.1.100',
      CONNECTION_TYPE: 'http',
      USERNAME: 'Administrator',
      PASSWORD: 'mode1234'
    };
  }
}

// =============================================================================
// Creating the Main Application Window
// =============================================================================
app.whenReady().then(() => {
  console.log("🚀 Creating Electron Window...");
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, 'assets', 'edin-plus-mark.png'),
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

ipcMain.handle('get-version', () => app.getVersion());

function infoBasicAuth(username, password) {
  if (!username || !password) return {};
  const token = Buffer.from(String(username) + ':' + String(password), 'utf8').toString('base64');
  return { Authorization: 'Basic ' + token };
}

async function fetchInfoCsv(ip, what, username, password) {
  const host = String(ip || '').replace(/^https?:\/\//, '').split('/')[0];
  const url = `http://${host}/info?what=${encodeURIComponent(what)}`;
  console.log('DEBUG: GET Info CSV', url);
  const response = await fetch(url, {
    method: 'GET',
    headers: Object.assign({ 'Content-Type': 'application/csv' }, infoBasicAuth(username, password))
  });
  const text = await response.text();
  if (!response.ok) {
    const err = new Error(`GET /info?what=${what} failed (${response.status})`);
    err.status = response.status;
    err.body = text.slice(0, 300);
    throw err;
  }
  return text;
}

ipcMain.handle('fetch-info-catalog', async (event, opts) => {
  const ip = opts && opts.ip;
  const username = opts && opts.username;
  const password = opts && opts.password;
  const namesText = await fetchInfoCsv(ip, 'names', username, password);
  event.sender.send('log-message', `Info CSV names: ${namesText.split(/\r\n|\n/).length} lines`);
  let levelsText = '';
  try {
    levelsText = await fetchInfoCsv(ip, 'levels', username, password);
    event.sender.send('log-message', `Info CSV levels: ${levelsText.split(/\r\n|\n/).length} lines`);
  } catch (err) {
    event.sender.send('log-message', `Info CSV levels skipped: ${err.message}`);
  }
  return { namesText, levelsText };
});

function sendViaTcp(event, commandObj, reason) {
  const port = TCP_FALLBACK_PORT;
  if (reason) {
    event.reply('log-message', reason);
  }
  sendTCPCommand(commandObj.ip, port, commandObj.type, event, (err, response) => {
    if (err) {
      console.error("DEBUG: Error sending TCP command:", err);
      event.reply('log-message', `TCP Error: ${err.message}`);
    } else if (response) {
      console.log("DEBUG: TCP command response:", response);
      event.reply('log-message', `TCP Response: ${response}`);
    }
  });
}

function sendViaHttpThenTcp(event, commandObj) {
  const url = commandObj.url || gatewayPostUrl(commandObj.ip, commandObj.port || 80);
  event.reply('log-message', "HTTP Sent: " + commandObj.type);
  sendHTTPCommand(url, commandObj.type)
    .then(responseText => {
      httpUnavailableUntil = 0;
      console.log("DEBUG: HTTP command response:", responseText);
      event.reply('log-message', `HTTP Response: ${responseText}`);
    })
    .catch(error => {
      console.error("DEBUG: HTTP command error:", error);
      event.reply('log-message', `HTTP Error: ${error.message}`);
      httpUnavailableUntil = nextHttpUnavailableUntil(Date.now(), HTTP_RETRY_AFTER_MS);
      sendViaTcp(event, commandObj, `HTTP failed — falling back to TCP port ${TCP_FALLBACK_PORT}`);
    });
}

// Send command: HTTP first, TCP port 26 if HTTP fails or Setup is TCP only
ipcMain.on('send-command', (event, commandObj) => {
  console.log("DEBUG: Main Process Received Command:", commandObj);
  if (shouldSendViaTcpOnly(commandObj.connection)) {
    sendViaTcp(event, commandObj);
    return;
  }
  if (shouldSkipHttp(httpUnavailableUntil, Date.now())) {
    sendViaTcp(event, commandObj, `HTTP recently failed — using TCP port ${TCP_FALLBACK_PORT}`);
    return;
  }
  sendViaHttpThenTcp(event, commandObj);
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
// Function: establishTCPConnection
// =============================================================================
function establishTCPConnection(ip, port, event) {
  if (tcpClient) {
    console.log("DEBUG: Closing existing TCP connection");
    tcpClient.destroy();
  }

  console.log(`DEBUG: Establishing persistent TCP connection to ${ip}:${port}`);
  tcpClient = new net.Socket();
  
  tcpClient.connect(port, ip, () => {
    console.log("DEBUG: TCP connection established");
    event.reply('log-message', "TCP Connection Established");
  });

  tcpClient.on('data', (data) => {
    const response = data.toString();
    console.log("DEBUG: Received TCP data:", response);
    event.reply('log-message', response);
  });

  tcpClient.on('error', (err) => {
    console.error("DEBUG: TCP connection error:", err);
    event.reply('log-message', `TCP Error: ${err.message}`);
  });

  tcpClient.on('close', () => {
    console.log("DEBUG: TCP connection closed");
    event.reply('log-message', "TCP Connection Closed");
    tcpClient = null;
  });

  return tcpClient;
}

// =============================================================================
// Function: sendTCPCommand
// =============================================================================
function sendTCPCommand(ip, port, command, event, callback) {
  console.log(`DEBUG: Sending TCP command: ${command}`);
  
  // If no connection exists or connection is closed, establish new one
  if (!tcpClient || tcpClient.destroyed) {
    tcpClient = establishTCPConnection(ip, port, event);
  }

  // Send the command
  tcpClient.write(command, () => {
    console.log("DEBUG: TCP Sent:", command);
    event.reply('log-message', "TCP Sent: " + command);
    if (callback) {
      callback(null);
    }
  });
}

// =============================================================================
// Function: sendHTTPCommand
// =============================================================================
function sendHTTPCommand(url, command) {
  console.log(`DEBUG: Sending HTTP Request to: ${url}`);
  console.log(`DEBUG: HTTP Payload: ${command}`);
  return postGatewayCommand(fetch, url, command, HTTP_TIMEOUT_MS)
    .then(text => {
      console.log("DEBUG: HTTP Response Status: OK");
      return text;
    });
}

// Add cleanup on app quit
app.on('before-quit', () => {
  if (tcpClient) {
    console.log("DEBUG: Closing TCP connection on app quit");
    tcpClient.destroy();
  }
});

