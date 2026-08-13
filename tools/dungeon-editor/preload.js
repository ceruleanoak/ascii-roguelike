const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('editorAPI', {
  // shared footprint contract (staircase geometry — read-only)
  footprintContractLoad: () => ipcRenderer.invoke('footprint-contract-load'),
  footprintReservedCellsLoad: () => ipcRenderer.invoke('footprint-reserved-cells'),

  // Interior — floor templates
  floorTemplatesList: () => ipcRenderer.invoke('floor-templates-list'),
  floorTemplateLoad: (name) => ipcRenderer.invoke('floor-template-load', name),
  floorTemplateSave: (name, data) => ipcRenderer.invoke('floor-template-save', name, data),
  floorTemplateDelete: (name) => ipcRenderer.invoke('floor-template-delete', name),

  // Exterior — zone designs
  designsList: () => ipcRenderer.invoke('designs-list'),
  designLoad: (zone) => ipcRenderer.invoke('design-load', zone),
  designSave: (zone, data) => ipcRenderer.invoke('design-save', zone, data),
});
