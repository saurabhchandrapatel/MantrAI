const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const LLMService = require('./llm/LLMService');
const { getScreenContext, formatContextForLLM } = require('./utils/screenContext');
const ActivityTracker = require('./tracker/ActivityTracker');
const ReportGenerator = require('./reports/ReportGenerator');

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs').promises;
const os = require('os');


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

  // Disable auto-hide for debugging
  // mainWindow.on('blur', () => {
  //   if (isVisible) {
  //     mainWindow.hide();
  //     isVisible = false;
  //   }
  // });

  // mainWindow.on('blur', () => {
  //   setTimeout(() => {
  //     if (!mainWindow.isFocused() && isVisible) {
  //       mainWindow.hide();
  //       isVisible = false;
  //     }
  //   }, 200);
  // });

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


async function findShortcutPathForName(appName) {
    // Search common Start Menu folders for a .lnk whose filename matches appName (case-insensitive)
    const startMenuFolders = [
        path.join(process.env.ProgramData || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
        path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs')
    ].filter(Boolean);

    const nameEsc = appName.replace("'", "''");
    const psPaths = startMenuFolders.map(p => `'${p.replace("'", "''")}'`).join(',');
    const psCmd = `
      $folders = @(${psPaths});
      $folders | ForEach-Object {
        Get-ChildItem -Path $_ -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue
      } | Where-Object { $_.BaseName -like '*${nameEsc}*' } | Select-Object -First 1 -ExpandProperty FullName | ConvertTo-Json -Compress
    `;
    try {
        const { stdout } = await execAsync(`powershell -NoProfile -Command "${psCmd.replace(/\n/g, ' ')}"`);
        const result = stdout.trim();
        if (!result) return null;
        // PowerShell returns a JSON string path or nothing
        return JSON.parse(result);
    } catch (err) {
        console.warn('findShortcutPathForName error', err);
        return null;
    }
}

async function resolveShortcutTarget(lnkPath) {
    // Use WScript.Shell COM to resolve .lnk target
    const safePath = lnkPath.replace("'", "''");
    const psCmd = `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${safePath}'); Write-Output $s.TargetPath`;
    try {
        const { stdout } = await execAsync(`powershell -NoProfile -Command "${psCmd.replace(/\n/g,' ')}"`);
        return stdout.trim() || null;
    } catch (err) {
        console.warn('resolveShortcutTarget error', err);
        return null;
    }
}

async function iconDataUrlFromPath(filePath) {
    try {
        // nativeImage can read icons from exe, dll, ico files
        if (!filePath) return null;
        const exists = await fs.access(filePath).then(() => true).catch(() => false);
        if (!exists) return null;
        const img = nativeImage.createFromPath(filePath);
        if (img.isEmpty()) return null;
        return img.toDataURL(); // returns data:image/png;base64,...
    } catch (err) {
        console.warn('iconDataUrlFromPath error', err);
        return null;
    }
}

// helper: ensure cache dir and return cached dataURL or create & cache resized PNG
async function getCachedIconDataUrl(sourcePath, cacheKey, size = 32) {
    try {
        if (!sourcePath) return null;
        const cacheDir = path.join(app.getPath('userData'), 'icon-cache');
        await fs.mkdir(cacheDir, { recursive: true });
        const safeKey = cacheKey.replace(/[^a-z0-9-_]/gi, '_').toLowerCase();
        const cacheFile = path.join(cacheDir, `${safeKey}_${size}x${size}.png`);

        // return cached if exists
        try {
            await fs.access(cacheFile);
            const img = nativeImage.createFromPath(cacheFile);
            if (!img.isEmpty()) return img.toDataURL();
        } catch (__) { /* cache miss -> continue */ }

        // create from source path
        const srcImg = nativeImage.createFromPath(sourcePath);
        if (srcImg.isEmpty()) return null;

        const resized = srcImg.resize({ width: size, height: size, quality: 'best' });
        const pngBuffer = resized.toPNG();

        await fs.writeFile(cacheFile, pngBuffer);
        return resized.toDataURL();
    } catch (err) {
        console.warn('getCachedIconDataUrl error', err);
        return null;
    }
}

// Create window and start app
app.whenReady().then(async () => {
  createWindow();
  createTray();
  setupShortcuts();
  await activityTracker.start();
  // Register the shortcuts  
  // IPC handlers
  // File context storage
  let currentFileContext = null;

  ipcMain.handle('set-file-context', async (event, { filename, content }) => {
    currentFileContext = { filename, content };
    return { success: true };
  });

  ipcMain.handle('process-query', async (event, { query, context }) => {
    try {
      if (!context) {
        let screenContext = await getScreenContext(true);
        context = formatContextForLLM(screenContext);
      }
      let response = await llmService.processQuery(query, context);
      console.log('ChatGPT response:', response);
      return response;
    } catch (error) {
      console.error('Error processing query:', error);
      return `Error: ${error.message}. Please check your OpenAI API key.`;
    }
  });


  ipcMain.on('resize-window', (event, newHeight) => {
    if (mainWindow) {
      const width = mainWindow.getSize()[0];
      // add padding/margin buffer (e.g., +50)
      mainWindow.setSize(width, Math.min(newHeight + 50, 800)); 
    }
  });

  ipcMain.handle('get-installed-apps', async () => {
    try {
      // 1) Get basic app list quickly and return it to the renderer immediately
      const { stdout } = await execAsync('powershell -NoProfile -Command "Get-StartApps | ConvertTo-Json -Depth 2"');
      const appsRaw = JSON.parse(stdout || '[]');
      const appsArr = Array.isArray(appsRaw) ? appsRaw : [appsRaw];
      const normalized = appsArr.map(a => ({
        Name: a.Name || a.AppName || '',
        AppID: a.AppID || a.AppUserModelID || '',
        Icon: null
      }));

      // Kick off background enrichment (icons) without blocking the renderer
      (async () => {
        try {
          // 2) Scan Start Menu shortcuts once
          const startMenuFolders = [
            path.join(process.env.ProgramData || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
            path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs')
          ].filter(Boolean);
          const psPaths = startMenuFolders.map(p => `'${p.replace("'", "''")}'`).join(',');
          const psCmd = `$folders = @(${psPaths}); $folders | ForEach-Object { Get-ChildItem -Path $_ -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue } | Select-Object -ExpandProperty FullName | ConvertTo-Json -Depth 1`;
          const { stdout: lnkOut } = await execAsync(`powershell -NoProfile -Command "${psCmd.replace(/\n/g, ' ')}"`);
          let lnkList = [];
          if (lnkOut && lnkOut.trim()) {
            const parsed = JSON.parse(lnkOut);
            lnkList = Array.isArray(parsed) ? parsed : [parsed];
          }

          // 3) Prepare basename index
          const lnkBasenames = lnkList.map(p => ({ path: p, base: path.basename(p, '.lnk').toLowerCase() }));

          // 4) Enrich apps with icons in batches
          const BATCH_SIZE = 6;
          for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
            const batch = normalized.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async appItem => {
              try {
                const name = (appItem.Name || '').toLowerCase().trim();
                if (!name) return;
                // find best matching shortcut by basename
                const candidate = lnkBasenames.find(l => l.base.includes(name) || name.includes(l.base));
                if (!candidate) return;
                const target = await resolveShortcutTarget(candidate.path);
                if (target) {
                  const iconUrl = await getCachedIconDataUrl(target, appItem.Name || appItem.AppID || path.basename(target));
                  if (iconUrl) { appItem.Icon = iconUrl; }
                }
                // fallback: check .ico sibling
                if (!appItem.Icon) {
                  const icoCandidate = candidate.path.replace(/\.lnk$/i, '.ico');
                  const icoIcon = await iconDataUrlFromPath(icoCandidate);
                  if (icoIcon) { appItem.Icon = icoIcon; }
                }
              } catch (e) {
                console.warn('icon enrich error for', appItem.Name, e);
              }
            }));
            // send progressive update to renderer after each batch
            try {
              if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('installed-apps-updated', normalized);
              }
            } catch (e) {
              console.warn('failed to send installed-apps-updated', e);
            }
          }
        } catch (bgErr) {
          console.warn('background icon enrichment error', bgErr);
        }
      })();

      return normalized;
    } catch (err) {
      console.error('get-installed-apps error', err);
      return [];
    }
  });

  // ipcMain.handle('launch-app', async (_, appId) => {
  //     try {
  //         // Use explorer to open the app via AppsFolder
  //         await execAsync(`explorer shell:AppsFolder\\${appId}`);
  //         return true;
  //     } catch (err) {
  //         console.error('launch-app error', err);
  //         return false;
  //     }
  // });

  ipcMain.handle('launch-app', async (_, appId) => {
      try {
          // Try different launch methods
          const methods = [
              // Method 1: Direct shell:AppsFolder (UWP apps)
              async () => {
                  await execAsync(`explorer shell:AppsFolder\\${appId}`);
                  return true;
              },
              // Method 2: Start Menu shortcut
              async () => {
                  const startMenuFolders = [
                      path.join(process.env.ProgramData || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
                      path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs')
                  ].filter(Boolean);
                  
                  // Find .lnk file matching app name
                  const psPath = startMenuFolders.map(p => `'${p.replace("'", "''")}'`).join(',');
                  const findCmd = `
                      $folders = @(${psPath});
                      foreach ($folder in $folders) {
                          Get-ChildItem -Path $folder -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue |
                          Where-Object { $_.BaseName -like '*${appId.replace("'", "''")}*' } |
                          Select-Object -First 1 -ExpandProperty FullName
                      }
                  `;
                  const { stdout } = await execAsync(`powershell -NoProfile -Command "${findCmd.replace(/\n/g, ' ')}"`);
                  if (stdout.trim()) {
                      await execAsync(`start "" "${stdout.trim()}"`);
                      return true;
                  }
                  throw new Error('Shortcut not found');
              },
              // Method 3: Direct executable path if known
              async () => {
                  const commonPaths = {
                      'Microsoft.VisualStudioCode': [
                          path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Microsoft VS Code', 'Code.exe'),
                          'C:\\Program Files\\Microsoft VS Code\\Code.exe',
                          'C:\\Program Files (x86)\\Microsoft VS Code\\Code.exe'
                      ]
                  };
                  
                  const paths = commonPaths[appId] || [];
                  for (const exePath of paths) {
                      try {
                          await fs.access(exePath);
                          await execAsync(`start "" "${exePath}"`);
                          return true;
                      } catch (e) {
                          continue;
                      }
                  }
                  throw new Error('Executable not found');
              }
          ];

          // Try each launch method
          for (const method of methods) {
              try {
                  const success = await method();
                  if (success) return true;
              } catch (e) {
                  console.log('Launch method failed:', e.message);
                  continue;
              }
          }

          throw new Error('All launch methods failed');
      } catch (err) {
          console.error('launch-app error', err);
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