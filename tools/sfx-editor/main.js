const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Write preload script to a temp file so we can reference it
const preloadPath = path.join(__dirname, 'preload.js');
fs.writeFileSync(preloadPath, `
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  exportWAV: (arrayBuffer, filename) =>
    ipcRenderer.invoke('export-wav', arrayBuffer, filename),
  savePresets: (data) =>
    ipcRenderer.invoke('save-presets', data),
  loadPresets: () =>
    ipcRenderer.invoke('load-presets')
});
`);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1280,
    minHeight: 820,
    title: 'SFX Editor',
    backgroundColor: '#0d0d0d',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.loadFile('index.html');
  win.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('export-wav', async (event, arrayBuffer, filename) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: filename,
    filters: [{ name: 'WAV Audio', extensions: ['wav'] }]
  });
  if (!canceled && filePath) {
    await fs.promises.writeFile(filePath, Buffer.from(arrayBuffer));
    return { success: true, filePath };
  }
  return { success: false };
});

ipcMain.handle('save-presets', async (event, data) => {
  const p = path.join(app.getPath('userData'), 'user-presets.json');
  await fs.promises.writeFile(p, JSON.stringify(data, null, 2));
  return { success: true };
});

ipcMain.handle('load-presets', async () => {
  const p = path.join(app.getPath('userData'), 'user-presets.json');
  try {
    const raw = await fs.promises.readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
});
