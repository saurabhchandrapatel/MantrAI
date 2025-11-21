const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('screenContext', {
  get: () => ipcRenderer.invoke('get-screen-context'),
  resizeWindow: (height) => ipcRenderer.send('resize-window', height)
});

contextBridge.exposeInMainWorld('electronAPI', {
  processQuery: (query, context) => ipcRenderer.invoke('process-query', { query, context }),
  processAction: (query, context) => ipcRenderer.invoke('process-action', { query, context }),

  // Streaming API
  streamQuery: (query, context) => ipcRenderer.send('stream-query', { query, context }),
  onStreamChunk: (callback) => ipcRenderer.on('stream-chunk', (event, chunk) => callback(chunk)),
  onStreamEnd: (callback) => ipcRenderer.on('stream-end', callback),
  onStreamError: (callback) => ipcRenderer.on('stream-error', (event, err) => callback(err)),
  removeStreamListeners: () => {
    ipcRenderer.removeAllListeners('stream-chunk');
    ipcRenderer.removeAllListeners('stream-end');
    ipcRenderer.removeAllListeners('stream-error');
  },

  // 🚀 NEW AGENTIC APIs
  executeWorkflow: (workflowName, params) => ipcRenderer.invoke('execute-workflow', { workflowName, params }),
  createWorkflow: (name, description, steps) => ipcRenderer.invoke('create-workflow', { name, description, steps }),
  getWorkflows: () => ipcRenderer.invoke('get-workflows'),
  getAgentState: (key) => ipcRenderer.invoke('get-agent-state', key),
  updateAgentState: (key, value) => ipcRenderer.invoke('update-agent-state', { key, value }),
  addDailyGoal: (goal) => ipcRenderer.invoke('add-daily-goal', goal),
  completeGoal: (goalId) => ipcRenderer.invoke('complete-goal', goalId),
  getDailyGoals: () => ipcRenderer.invoke('get-daily-goals'),
  suggestWorkflow: (context) => ipcRenderer.invoke('suggest-workflow', context),
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

  // 🚀 Vector Store / RAG
  uploadDocument: (filePath) => ipcRenderer.invoke('upload-document', filePath),
  queryVectorStore: (query) => ipcRenderer.invoke('query-vector-store', query),
  resetVectorStore: () => ipcRenderer.invoke('reset-vector-store'),
  getConversationHistory: () => ipcRenderer.invoke('get-conversation-history'),

  // Event listeners
  onWindowShown: (callback) => ipcRenderer.on('window-shown', callback),
  onWindowHidden: (callback) => ipcRenderer.on('window-hidden', callback),
  onShowReport: (callback) => ipcRenderer.on('show-report', callback),
  onFocusModeStarted: (callback) => ipcRenderer.on('focus-mode-started', callback),

  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),

  // Settings & Reports
  saveSettings: (settings) => ipcRenderer.invoke('save-all-settings', settings),
  getAllSettings: () => ipcRenderer.invoke('get-all-settings'),
  testLLMConnection: () => ipcRenderer.invoke('test-llm-connection'),
  exportUserData: () => ipcRenderer.invoke('export-user-data'),
  clearUserData: () => ipcRenderer.invoke('clear-user-data'),
  generateReport: (period) => ipcRenderer.invoke('generate-report', period),

  // Automation Tools
  invokeTool: (toolName, args) => ipcRenderer.invoke(`tool:${toolName}`, args)
});


contextBridge.exposeInMainWorld('system', {
  getInstalledApps: () => ipcRenderer.invoke('get-installed-apps'),
  launchApp: (appPath) => ipcRenderer.invoke('launch-app', appPath)
});

// Event bridge for installed-apps updates (background icon enrichment)
contextBridge.exposeInMainWorld('installedAppsAPI', {
  onUpdated: (callback) => ipcRenderer.on('installed-apps-updated', callback)
});