const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tempNova', {
  brainStatus: () => ipcRenderer.invoke('temp:brain-status'),
  listModels: () => ipcRenderer.invoke('temp:list-models'),
  chat: (payload) => ipcRenderer.invoke('temp:chat', payload),
});
