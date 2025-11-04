const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('screenContext', {
  get: () => ipcRenderer.invoke('get-screen-context'),
  resizeWindow: (height) => ipcRenderer.send('resize-window', height)
});

contextBridge.exposeInMainWorld('electronAPI', {
  processQuery: (query, context) => ipcRenderer.invoke('process-query', { query, context }),
  processAction: (query, context) => ipcRenderer.invoke('process-action', { query, context }),
  getProductivityReport: (period) => ipcRenderer.invoke('get-productivity-report', period),
  hideWindow: () => ipcRenderer.send('hide-window'),
  resizeWindow: (height) => ipcRenderer.send('resize-window', height),
  openSettings: () => ipcRenderer.send('open-settings'),
  setFileContext: (filename, content) => ipcRenderer.invoke('set-file-context', { filename, content }),
  // Accept structured payloads for bulk folder uploads: { files: [ { name, content, isBinary } ] }
  setFileContextBulk: (payload) => ipcRenderer.invoke('set-file-context', payload),
  
  // Context management
  addContext: (context) => ipcRenderer.invoke('add-context', context),
  clearContext: () => ipcRenderer.invoke('clear-context'),
  getConversationHistory: () => ipcRenderer.invoke('get-conversation-history'),
  
  // Event listeners
  onWindowShown: (callback) => ipcRenderer.on('window-shown', callback),
  onWindowHidden: (callback) => ipcRenderer.on('window-hidden', callback),
  onShowReport: (callback) => ipcRenderer.on('show-report', callback),
  onFocusModeStarted: (callback) => ipcRenderer.on('focus-mode-started', callback),
  
  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});


contextBridge.exposeInMainWorld('system', {
    getInstalledApps: () => ipcRenderer.invoke('get-installed-apps'),
    launchApp: (appPath) => ipcRenderer.invoke('launch-app', appPath)
});

// Event bridge for installed-apps updates (background icon enrichment)
contextBridge.exposeInMainWorld('installedAppsAPI', {
  onUpdated: (callback) => ipcRenderer.on('installed-apps-updated', callback)
});