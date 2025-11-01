const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('screenContext', {
  get: () => ipcRenderer.invoke('get-screen-context')
});

contextBridge.exposeInMainWorld('electronAPI', {
  processQuery: (query) => ipcRenderer.invoke('process-query', query),
  getProductivityReport: (period) => ipcRenderer.invoke('get-productivity-report', period),
  hideWindow: () => ipcRenderer.send('hide-window'),
  resizeWindow: (height) => ipcRenderer.send('resize-window', height),
  
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