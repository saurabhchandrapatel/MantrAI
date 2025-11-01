const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const LLMService = require('./llm/LLMService');
const { getScreenContext, formatContextForLLM } = require('./utils/screenContext');
const ActivityTracker = require('./tracker/ActivityTracker');
const ReportGenerator = require('./reports/ReportGenerator');

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
    height: 80,
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
  // mainWindow.webContents.openDevTools();
  
  // Center window
  const { screen } = require('electron');
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const bounds = mainWindow.getBounds();
  mainWindow.setPosition(
    Math.round((width - bounds.width) / 2),
    Math.round((height - bounds.height) / 2)
  );

  // Disable auto-hide for debugging
  mainWindow.on('blur', () => {
    if (isVisible) {
      mainWindow.hide();
      isVisible = false;
    }
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
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  activityTracker.start();
  
  // Global shortcut
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
  
  // IPC handlers
  ipcMain.handle('process-query', async (event, query) => {
    try {      
      // todo - i need get getScreenContext(withOCR) of screen along with clipboard etc
      // context = ;
      console.log('Processing query with ChatGPT...');

      const context = await getScreenContext(true);
      const formattedContext = formatContextForLLM(context);
      
      let response = await llmService.processQuery(query, formattedContext);
      console.log('ChatGPT response:', response);
      return response;
    } catch (error) {
      console.error('Error processing query:', error);
      return `Error: ${error.message}. Please check your OpenAI API key.`;
    }
  });

  ipcMain.on('hide-window', () => {
    mainWindow.hide();
    isVisible = false;
  });

  ipcMain.on('resize-window', (event, height) => {
    console.log('Resizing window to height:', height);
    const currentBounds = mainWindow.getBounds();
    mainWindow.setBounds({
      ...currentBounds,
      height: Math.max(80, height)
    });
  });

  // Settings handlers
  ipcMain.handle('save-all-settings', async (event, settings) => {
    const fs = require('fs');
    const settingsPath = path.join(__dirname, 'data', 'settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    llmService.updateConfig(settings);
  });

  ipcMain.handle('get-all-settings', async () => {
    const fs = require('fs');
    const settingsPath = path.join(__dirname, 'data', 'settings.json');
    try {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {
      return { provider: 'openai' };
    }
  });

  ipcMain.handle('test-llm-connection', async () => {
    try {
      await llmService.testConnection();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Report generation handler - returns structured report data to renderer
  ipcMain.handle('generate-report', async (_, period = 'today') => {
    try {
      const rg = new ReportGenerator();
      const report = await rg.generateReport(period);
      return { success: true, report };
    } catch (error) {
      console.error('Error generating report:', error);
      return { success: false, error: error.message };
    }
  });

  // Context management handlers
  // ipcMain.handle('add-context', async (event, context) => {
  //   await llmService.addContext(context);
  // });

  // ipcMain.handle('clear-context', async () => {
  //   llmService.clearContext();
  // });

  // ipcMain.handle('get-conversation-history', async () => {
  //   return await llmService.getConversationHistory();
  // });

  ipcMain.handle('export-user-data', async () => {
    try {
      const fs = require('fs');
      const dataPath = path.join(__dirname, 'data');
      const exportPath = path.join(require('os').homedir(), 'Desktop', 'productivity-data-export.json');
      
      const data = {
        settings: fs.existsSync(path.join(dataPath, 'settings.json')) ? 
          JSON.parse(fs.readFileSync(path.join(dataPath, 'settings.json'), 'utf8')) : {},
        exportDate: new Date().toISOString()
      };
      
      fs.writeFileSync(exportPath, JSON.stringify(data, null, 2));
      return { success: true, path: exportPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('clear-user-data', async () => {
    try {
      const fs = require('fs');
      const dataPath = path.join(__dirname, 'data');
      
      // Keep settings but clear activity data
      const files = ['activity.db', 'reports.json'];
      files.forEach(file => {
        const filePath = path.join(dataPath, file);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  
    
  ipcMain.handle('get-screen-context', async (_, withOCR = false) => {
    const saveDir = path.join(__dirname, 'screenshots'); // custom dir

    const context = await getScreenContext(withOCR, saveDir);

    console.log('✅ Saved screenshot:', context.screenshotPath);
    
    const llmPrompt = formatContextForLLM(context);
    console.log('\n🧠 LLM Prompt:\n', llmPrompt);

    return context;
  });

  console.log('Floating AI Assistant started successfully!');
  console.log('Press Alt+Space to show/hide the assistant');
});


app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', async () => {
  await activityTracker.stop();
  globalShortcut.unregisterAll();
});