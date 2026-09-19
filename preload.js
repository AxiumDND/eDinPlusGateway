// preload.js
//
// Exposes a safe API (electronAPI) to the renderer using contextBridge.
// Only the necessary IPC functions are exposed.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendCommand: (command) => ipcRenderer.send('send-command', command),
  onLogMessage: (callback) => ipcRenderer.on('log-message', (event, message) => callback(message)),
  updateSettings: (settings) => ipcRenderer.send('update-settings', settings),
  requestSettings: () => ipcRenderer.send('request-settings'),
  onLoadSettings: (callback) => ipcRenderer.on('load-settings', (event, settings) => callback(settings)),
  // New function to open the scene edit window.
  openSceneEdit: (sceneData) => ipcRenderer.send('open-scene-edit', sceneData),
  getVersion: () => ipcRenderer.invoke('get-version'),
  fetchInfoCatalog: (opts) => ipcRenderer.invoke('fetch-info-catalog', opts)
});






