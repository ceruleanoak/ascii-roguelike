
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  exportWAV: (arrayBuffer, filename) =>
    ipcRenderer.invoke('export-wav', arrayBuffer, filename),
  savePresets: (data) =>
    ipcRenderer.invoke('save-presets', data),
  loadPresets: () =>
    ipcRenderer.invoke('load-presets')
});
