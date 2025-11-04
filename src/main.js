const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const LLMService = require('./llm/LLMService');
const { getScreenContext, formatContextForLLM } = require('./utils/screenContext');
const ActivityTracker = require('./tracker/ActivityTracker');
const ReportGenerator = require('./reports/ReportGenerator');
const { getInstalledApps } = require('get-installed-apps');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fsSync = require('fs'); // added to use existsSync

require('dotenv').config();

const llmService = new LLMService();
const activityTracker = new ActivityTracker();

let mainWindow;
let settingsWindow;
let reportWindow;
let tray = null;
let isVisible = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 250,
    minHeight: 250,
    maxHeight: 800,  // prevent overflow
    resizable: false,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
  
  // Open DevTools for debugging
  mainWindow.webContents.openDevTools();
  

  // Center window
  const { screen } = require('electron');
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const bounds = mainWindow.getBounds();
  mainWindow.setPosition(
    Math.round((width - bounds.width) / 2),
    Math.round((height - bounds.height) / 2)
  );

  mainWindow.on('blur', () => {
    setTimeout(() => {
      if (!mainWindow.isFocused() && isVisible) {
        mainWindow.hide();
        isVisible = false;
      }
    }, 200);
  });

}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  tray = new Tray(iconPath);
  
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Assistant',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
        isVisible = true;
      }
    },
    {
      label: 'Productivity Report',
      click: () => {
        if (!reportWindow) {
          reportWindow = new BrowserWindow({
            width: 900,
            height: 700,
            webPreferences: {
              nodeIntegration: true,
              contextIsolation: false
            }
          });
          reportWindow.loadFile(path.join(__dirname, 'ui', 'report.html'));
          reportWindow.on('closed', () => { reportWindow = null; });
        }
        reportWindow.show();
      }
    },
    {
      label: 'Settings',
      click: () => {
        if (!settingsWindow) {
          settingsWindow = new BrowserWindow({
            width: 900,
            height: 700,
            webPreferences: {
              nodeIntegration: true,
              contextIsolation: false
            }
          });
          settingsWindow.loadFile(path.join(__dirname, 'ui', 'settings.html'));
          settingsWindow.on('closed', () => { settingsWindow = null; });
        }
        settingsWindow.show();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit()
    }
  ]);
  
  tray.setContextMenu(contextMenu);
  tray.setToolTip('Floating AI Assistant');

  tray.on('click', () => {
    if (isVisible) mainWindow.hide();
    else { mainWindow.show(); mainWindow.focus(); }
    isVisible = !isVisible;
  });

}

function setupShortcuts() {
  globalShortcut.register('Alt+Space', () => {
    if (isVisible) {
      mainWindow.hide();
      isVisible = false;
    } else {
      mainWindow.show();
      mainWindow.focus();
      isVisible = true;
    }
  });
}
 
function validateIconPath(iconPath) {
  if (!iconPath) return null;

  // Clean ",0" suffix if present (e.g. "C:\\App\\icon.ico,0")
  const cleanPath = iconPath.split(',')[0].trim();

  // Decode URL-style encoding (e.g. "%20" → space)
  const decodedPath = decodeURIComponent(cleanPath);

  // Check if the file actually exists
  if (fsSync.existsSync(decodedPath)) {
    return decodedPath;
  } else {
    console.warn('Icon not found:', decodedPath);
    return null;
  }
}

// Create window and start app
app.whenReady().then(async () => {
  createWindow();
  createTray();
  setupShortcuts();
  await activityTracker.start();
  let currentFileContext = null;
  let currentExtraContext = null; // additional context added from renderer (e.g., screen capture)

  ipcMain.handle('set-file-context', async (event, { filename, content }) => {
    try {
      // Accept either: { filename, content } OR { files: [ { name, content, isBinary } ] }
      if (Array.isArray(arguments[1])) {
        // unlikely path; but normalize
        currentFileContext = { files: arguments[1] };
      } else if (arguments[1] && arguments[1].files) {
        currentFileContext = { files: arguments[1].files };
      } else if (filename && content !== undefined) {
        currentFileContext = { filename, content };
      } else {
        // fallback: store raw payload
        currentFileContext = arguments[1] || null;
      }
      return { success: true };
    } catch (err) {
      console.error('set-file-context error', err);
      return { success: false, error: err.message };
    }
  });

  // Provide screen/context capture to renderer via preload
  ipcMain.handle('get-screen-context', async (event, useOCR = false) => {
    try {
      const ctx = await getScreenContext(!!useOCR);
      return ctx;
    } catch (err) {
      console.error('get-screen-context error', err);
      return null;
    }
  });

  // Renderer requests to open the settings window
  ipcMain.on('open-settings', (event) => {
    try {
      if (!settingsWindow) {
        settingsWindow = new BrowserWindow({
          width: 900,
          height: 700,
          webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
          }
        });
        settingsWindow.loadFile(path.join(__dirname, 'ui', 'settings.html'));
        settingsWindow.on('closed', () => { settingsWindow = null; });
      }
      settingsWindow.show();
      if (mainWindow) mainWindow.hide();
    } catch (err) {
      console.error('open-settings handler error', err);
    }
  });

  ipcMain.handle('process-action', async (event, { query, context }) => {
    return await llmService.processAction(query, context);
  });
  ipcMain.handle('process-query', async (event, { query, context }) => {
    try {
      // Priority: explicit context passed in > file-uploaded context > extra context (screen capture) > live screen capture
      if (!context) {
        if (currentFileContext && currentFileContext.content) {
          context = currentFileContext.content;
        } else if (currentExtraContext) {
          context = formatContextForLLM(currentExtraContext);
        } else {
          const screenContext = await getScreenContext(true);
          context = formatContextForLLM(screenContext);
        }
      }
      let response = await llmService.processQuery(query, context);
      return response;
    } catch (error) {
      return `Error: ${error.message}. Please check your OpenAI API key.`;
    }
  });

  // Allow renderer to add captured context (e.g., OCR/window) that will be used by subsequent queries
  ipcMain.handle('add-context', async (event, context) => {
    try {
      currentExtraContext = context || null;
      return { success: true };
    } catch (err) {
      console.error('add-context error', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('clear-context', async () => {
    try {
      currentExtraContext = null;
      return { success: true };
    } catch (err) {
      console.error('clear-context error', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('get-conversation-history', async () => {
    try {
      if (llmService && llmService.memory && typeof llmService.memory.loadMemoryVariables === 'function') {
        const vars = await llmService.memory.loadMemoryVariables({});
        return vars.history || [];
      }
      return [];
    } catch (err) {
      console.error('get-conversation-history error', err);
      return [];
    }
  });

  ipcMain.on('resize-window', (event, newHeight) => {
    if (mainWindow) {
      const width = mainWindow.getSize()[0];
      // add padding/margin buffer (e.g., +50)
      mainWindow.setSize(width, Math.min(newHeight + 50, 800)); 
    }
  });

   // Replace the get-installed-apps handler
  ipcMain.handle('get-installed-apps', async () => {
    try {
        const apps = await getInstalledApps();
        const normalized = apps
        .map(app => {

          const validIcon = validateIconPath(app.DisplayIcon);
          return {
            Name: app.appName || app.DisplayName || app.kMDItemDisplayName || '',
            AppID: app.DisplayIcon || app.kMDItemFSName || app.appIdentifier || '',
            DisplayIcon: validIcon,
            Icon: null // We'll handle icons separately if needed
          };
        })
        .filter(app => app.Name && app.AppID);

        console.log('Found apps:', normalized.length);
        return normalized;
    } catch (err) {
        console.error('Error getting installed apps:', err);
        return [];
    }
}); 

  // Replace the existing launch-app handler with this improved version:
   // Update the launch-app handler to work with the new format
  ipcMain.handle('launch-app', async (_, app) => {
      try {
          if (!app.AppID) {
              throw new Error('No app path provided');
          }

          // Handle different path formats
          if (app.AppID.endsWith('.exe') || app.AppID.endsWith('.app')) {
              await execAsync(`start "" "${app.AppID}"`);
              console.log(`Launched via direct path: ${app.AppID}`);
              return true;
          }

          // Try launching via Start-Process as fallback
          await execAsync(`powershell -NoProfile -Command "Start-Process '${app.Name.replace("'", "''")}'"`);
          console.log(`Launched via Start-Process: ${app.Name}`);
          return true;
      } catch (err) {
          console.error('launch-app error:', err);
          return false;
      }
  });

});

// Quit when all windows are closed

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', async () => {
  await activityTracker.stop();
  globalShortcut.unregisterAll();
});

app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  if (tray) tray.destroy();
});
 