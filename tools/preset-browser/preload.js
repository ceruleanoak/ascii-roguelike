const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // engine + index
  sources: () => ipcRenderer.invoke('sources'),
  msfaSources: () => ipcRenderer.invoke('msfa-sources'),
  indexAll: (opts) => ipcRenderer.invoke('index-all', opts),
  loadVoice: (bankPath, voiceIndex) => ipcRenderer.invoke('load-voice', bankPath, voiceIndex),
  openSyx: () => ipcRenderer.invoke('open-syx'),
  // library metadata
  libraryLoad: () => ipcRenderer.invoke('library-load'),
  featuresLoad: () => ipcRenderer.invoke('features-load'),
  favoritesSave: (arr) => ipcRenderer.invoke('favorites-save', arr),
  tagsSave: (map) => ipcRenderer.invoke('tags-save', map),
  notesSave: (map) => ipcRenderer.invoke('notes-save', map),
  ratingsSave: (map) => ipcRenderer.invoke('ratings-save', map),
  // collections (folders = nesting in relPath)
  collectionList: () => ipcRenderer.invoke('collection-list'),
  collectionLoad: (rel) => ipcRenderer.invoke('collection-load', rel),
  collectionSave: (rel, data) => ipcRenderer.invoke('collection-save', rel, data),
  collectionDelete: (rel) => ipcRenderer.invoke('collection-delete', rel),
  // render bridge
  pickOutputDir: () => ipcRenderer.invoke('pick-output-dir'),
  writeWav: (filePath, bytes) => ipcRenderer.invoke('write-wav', filePath, bytes)
});
