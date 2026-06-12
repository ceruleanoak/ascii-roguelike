
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  exportWAV: (arrayBuffer, filename) =>
    ipcRenderer.invoke('export-wav', arrayBuffer, filename),
  listTemplates: () =>
    ipcRenderer.invoke('templates-list'),
  loadTemplate: (relPath) =>
    ipcRenderer.invoke('template-load', relPath),
  saveTemplate: (relPath, data) =>
    ipcRenderer.invoke('template-save', relPath, data),
  deleteTemplate: (relPath) =>
    ipcRenderer.invoke('template-delete', relPath)
});
