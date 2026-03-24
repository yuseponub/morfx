const {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  screen,
  globalShortcut,
  clipboard,
  nativeImage,
} = require('electron');
const path = require('path');
const { exec } = require('child_process');

let mainWindow = null;

// ==========================================
// Window creation
// ==========================================
function createWindow() {
  const display = screen.getPrimaryDisplay();
  const { width: screenW } = display.workAreaSize;

  mainWindow = new BrowserWindow({
    width: 340,
    height: 64,
    x: screenW - 360,
    y: 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('renderer.html');

  // Allow the window to not steal focus when user interacts with buttons
  // The -webkit-app-region: drag CSS handles dragging
  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ==========================================
// Type text via clipboard + simulated Ctrl+V
// Uses PowerShell to preserve previous clipboard, paste, then restore
// ==========================================
async function typeTextViaClipboard(text) {
  if (!text) return;

  // Save current clipboard content
  const previousClipboard = clipboard.readText();

  // Set new text to clipboard
  clipboard.writeText(text);

  // Small delay to ensure clipboard is set
  await new Promise((r) => setTimeout(r, 50));

  // Simulate Ctrl+V via PowerShell SendKeys
  return new Promise((resolve, reject) => {
    const psScript = `
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.SendKeys]::SendWait("^v")
    `;
    exec(
      `powershell.exe -NoProfile -NonInteractive -Command "${psScript.replace(/\n/g, '; ')}"`,
      { timeout: 5000 },
      (err) => {
        // Restore previous clipboard after a delay
        setTimeout(() => {
          clipboard.writeText(previousClipboard || '');
        }, 200);

        if (err) {
          console.error('SendKeys error:', err.message);
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

// ==========================================
// Delete text (backspaces) + type new text
// Used for GPT correction: delete old text, type corrected version
// ==========================================
async function deleteAndType(deleteCount, newText) {
  if (deleteCount <= 0 && !newText) return;

  // Build the SendKeys string: {BS} for each backspace, then the new text
  // SendKeys special chars need escaping: +^%~{}[]
  let sendKeysStr = '';

  // Add backspaces
  for (let i = 0; i < deleteCount; i++) {
    sendKeysStr += '{BS}';
  }

  if (sendKeysStr) {
    // Send backspaces via SendKeys
    await new Promise((resolve, reject) => {
      const psScript = `
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.SendKeys]::SendWait("${sendKeysStr}")
      `;
      exec(
        `powershell.exe -NoProfile -NonInteractive -Command "${psScript.replace(/\n/g, '; ')}"`,
        { timeout: 10000 },
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Small delay between delete and type
    await new Promise((r) => setTimeout(r, 100));
  }

  // Now paste the new text
  if (newText) {
    await typeTextViaClipboard(newText);
  }
}

// ==========================================
// Capture screen via desktopCapturer (no picker dialog)
// ==========================================
async function captureScreen() {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1920, height: 1080 },
  });

  if (sources.length === 0) {
    throw new Error('No screen sources found');
  }

  // Use the primary screen (first source)
  const source = sources[0];
  const image = source.thumbnail;

  // Convert to JPEG base64
  const jpegBuffer = image.toJPEG(70);
  return jpegBuffer.toString('base64');
}

// ==========================================
// IPC Handlers
// ==========================================
function setupIPC() {
  ipcMain.handle('type-text', async (_event, text) => {
    try {
      // Temporarily make window not focusable so paste goes to the right app
      if (mainWindow) {
        mainWindow.setFocusable(false);
        // Small delay to ensure focus releases
        await new Promise((r) => setTimeout(r, 50));
      }

      await typeTextViaClipboard(text);

      // Restore focusable after typing
      if (mainWindow) {
        mainWindow.setFocusable(true);
      }
      return { success: true };
    } catch (err) {
      if (mainWindow) mainWindow.setFocusable(true);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('delete-and-type', async (_event, deleteCount, newText) => {
    try {
      if (mainWindow) {
        mainWindow.setFocusable(false);
        await new Promise((r) => setTimeout(r, 50));
      }

      await deleteAndType(deleteCount, newText);

      if (mainWindow) mainWindow.setFocusable(true);
      return { success: true };
    } catch (err) {
      if (mainWindow) mainWindow.setFocusable(true);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('capture-screen', async () => {
    try {
      const base64 = await captureScreen();
      return { success: true, image: base64 };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('set-window-size', async (_event, width, height) => {
    if (mainWindow) {
      mainWindow.setSize(width, height);
    }
    return { success: true };
  });
}

// ==========================================
// Global shortcuts
// ==========================================
function registerShortcuts() {
  // Ctrl+Shift+Space: toggle recording
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (mainWindow) {
      mainWindow.webContents.send('shortcut-toggle-record');
    }
  });

  // Ctrl+Shift+S: take screenshot
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    if (mainWindow) {
      mainWindow.webContents.send('shortcut-screenshot');
    }
  });
}

// ==========================================
// App lifecycle
// ==========================================
app.whenReady().then(() => {
  setupIPC();
  createWindow();
  registerShortcuts();
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
