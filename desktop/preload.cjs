const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('ninjaBridge',{
  connections:()=>ipcRenderer.invoke('ninja:connections'),
  testConnection:(service)=>ipcRenderer.invoke('ninja:test-connection',service),
  ai:(payload)=>ipcRenderer.invoke('ninja:ai',payload),
  filePath:(file)=>webUtils.getPathForFile(file),
  readProjectFile:(filePath)=>ipcRenderer.invoke('ninja:read-project-file',filePath),
  pickProjectZip:()=>ipcRenderer.invoke('ninja:pick-project-zip'),
  createProjectFolder:(project)=>ipcRenderer.invoke('ninja:create-project-folder',project),
  pickProjectFolder:()=>ipcRenderer.invoke('ninja:pick-project-folder'),
  saveProjectFolder:(payload)=>ipcRenderer.invoke('ninja:save-project-folder',payload)
});
