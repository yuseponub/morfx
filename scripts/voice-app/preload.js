const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voiceAPI', {
  // Type text at current cursor position (clipboard + Ctrl+V)
  typeText: (text) => ipcRenderer.invoke('type-text', text),

  // Delete N characters then type new text (for GPT correction)
  deleteAndType: (deleteCount, newText) =>
    ipcRenderer.invoke('delete-and-type', deleteCount, newText),

  // Capture screen without picker dialog (desktopCapturer)
  captureScreen: () => ipcRenderer.invoke('capture-screen'),

  // Resize the widget window
  setWindowSize: (width, height) =>
    ipcRenderer.invoke('set-window-size', width, height),

  // Listen for global shortcuts from main process
  onToggleRecord: (callback) =>
    ipcRenderer.on('shortcut-toggle-record', callback),

  onScreenshot: (callback) =>
    ipcRenderer.on('shortcut-screenshot', callback),
});
