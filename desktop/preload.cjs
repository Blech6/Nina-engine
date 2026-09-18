const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ninjaBridge',{
  connections:()=>ipcRenderer.invoke('ninja:connections'),
  testConnection:(service)=>ipcRenderer.invoke('ninja:test-connection',service),
  ai:(payload)=>ipcRenderer.invoke('ninja:ai',payload)
});
