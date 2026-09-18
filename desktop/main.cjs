const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');

function env(name){ return process.env[name] || ''; }
async function jsonFetch(url, options={}){
  const r=await fetch(url,{...options,headers:{'User-Agent':'Ninja-Engine','Accept':'application/json',...(options.headers||{})}});
  const text=await r.text(); let data=null; try{data=JSON.parse(text)}catch{}
  return {ok:r.ok,status:r.status,data,text};
}

ipcMain.handle('ninja:connections', async ()=>({
  ai:{configured:!!env('OPENAI_API_KEY'),model:env('NINJA_AI_MODEL')||'gpt-5.6-luna'},
  notion:{configured:!!env('NOTION_TOKEN'),page:env('NINJA_NOTION_PAGE_ID')||''},
  github:{configured:!!env('GITHUB_TOKEN'),repo:env('NINJA_GITHUB_REPO')||''}
}));

ipcMain.handle('ninja:test-connection', async (_e, service)=>{
  try{
    if(service==='ai'){
      if(!env('OPENAI_API_KEY')) return {ok:false,configured:false,message:'OPENAI_API_KEY not configured'};
      const r=await jsonFetch('https://api.openai.com/v1/models',{headers:{Authorization:`Bearer ${env('OPENAI_API_KEY')}`}});
      return {ok:r.ok,configured:true,message:r.ok?'OpenAI API connected':`OpenAI API HTTP ${r.status}`};
    }
    if(service==='notion'){
      if(!env('NOTION_TOKEN')) return {ok:false,configured:false,message:'NOTION_TOKEN not configured'};
      const r=await jsonFetch('https://api.notion.com/v1/users/me',{headers:{Authorization:`Bearer ${env('NOTION_TOKEN')}`,'Notion-Version':'2022-06-28'}});
      return {ok:r.ok,configured:true,message:r.ok?'Notion connected':`Notion API HTTP ${r.status}`};
    }
    if(service==='github'){
      if(!env('GITHUB_TOKEN')) return {ok:false,configured:false,message:'GITHUB_TOKEN not configured'};
      const r=await jsonFetch('https://api.github.com/user',{headers:{Authorization:`Bearer ${env('GITHUB_TOKEN')}`}});
      return {ok:r.ok,configured:true,message:r.ok?'GitHub connected':`GitHub API HTTP ${r.status}`};
    }
    return {ok:false,message:'Unknown service'};
  }catch(e){ return {ok:false,message:e.message}; }
});

function safeProjectName(name){return String(name||'Novo Projeto').replace(/[<>:"/\\|?*]/g,'_').trim()||'Novo Projeto';}
async function readNinjaProject(dir){
  const metaPath=path.join(dir,'project.ninja.json');
  const meta=JSON.parse(await fs.readFile(metaPath,'utf8'));
  const sceneRel=meta.main_scene||'scenes/Main.json';
  const scene=JSON.parse(await fs.readFile(path.join(dir,sceneRel),'utf8'));
  return {kind:'ninja',name:meta.name||path.basename(dir),filePath:dir,meta,scene};
}
async function listProjectFiles(dir,base=dir,out=[]){
  for(const ent of await fs.readdir(dir,{withFileTypes:true})){
    if(ent.name==='node_modules'||ent.name==='.git')continue;
    const full=path.join(dir,ent.name),rel=path.relative(base,full).split(path.sep).join('/');
    if(ent.isDirectory()){out.push({path:rel+'/',name:ent.name,type:'dir'});await listProjectFiles(full,base,out);}
    else out.push({path:rel,name:ent.name,type:'file'});
    if(out.length>=2000)break;
  }
  return out;
}
ipcMain.handle('ninja:create-project-folder', async (_e, project)=>{
  const parent=await dialog.showOpenDialog({title:'Criar projeto — escolha a pasta onde ele será salvo',buttonLabel:'Selecionar pasta',properties:['openDirectory','createDirectory']});
  if(parent.canceled||!parent.filePaths[0])return null;
  const safe=safeProjectName(project?.name),dir=path.join(parent.filePaths[0],safe);
  try{await fs.access(dir);throw new Error('Já existe uma pasta com esse nome. Escolha outro nome.');}catch(err){if(err.code!=='ENOENT')throw err;}
  await fs.mkdir(path.join(dir,'scenes'),{recursive:true});await fs.mkdir(path.join(dir,'assets'),{recursive:true});await fs.mkdir(path.join(dir,'scripts'),{recursive:true});
  const scene=project?.scene||{};
  await fs.writeFile(path.join(dir,'project.ninja.json'),JSON.stringify({engine:'Ninja Engine',version:'0.12',name:safe,main_scene:'scenes/Main.json'},null,2));
  await fs.writeFile(path.join(dir,'scenes','Main.json'),JSON.stringify(scene,null,2));
  return {...await readNinjaProject(dir),files:await listProjectFiles(dir)};
});
ipcMain.handle('ninja:pick-project-folder', async ()=>{
  const r=await dialog.showOpenDialog({title:'Abrir projeto Ninja',buttonLabel:'Abrir projeto',properties:['openDirectory']});
  if(r.canceled||!r.filePaths[0])return null;
  const dir=r.filePaths[0];
  try{return {...await readNinjaProject(dir),files:await listProjectFiles(dir)};}
  catch(err){throw new Error('Selecione a pasta raiz de um projeto Ninja (ela precisa conter project.ninja.json).');}
});
ipcMain.handle('ninja:open-project-path', async (_e,dir)=>{
  if(!dir||typeof dir!=='string')throw new Error('Caminho de projeto inválido.');
  return {...await readNinjaProject(dir),files:await listProjectFiles(dir)};
});
ipcMain.handle('ninja:list-project-files', async (_e,dir)=>{
  if(!dir||typeof dir!=='string')return [];
  return listProjectFiles(dir);
});
ipcMain.handle('ninja:save-project-folder', async (_e,payload)=>{
  const dir=payload?.filePath;if(!dir)throw new Error('Projeto sem pasta.');
  await fs.mkdir(path.join(dir,'scenes'),{recursive:true});await fs.mkdir(path.join(dir,'assets'),{recursive:true});await fs.mkdir(path.join(dir,'scripts'),{recursive:true});
  await fs.writeFile(path.join(dir,'project.ninja.json'),JSON.stringify({engine:'Ninja Engine',version:'0.12',name:payload.name||path.basename(dir),main_scene:'scenes/Main.json'},null,2));
  await fs.writeFile(path.join(dir,'scenes','Main.json'),JSON.stringify(payload.scene||{},null,2));
  return {ok:true,files:await listProjectFiles(dir)};
});
ipcMain.handle('ninja:reveal-project', async (_e,dir)=>{if(dir)require('electron').shell.openPath(dir);return {ok:true};});

ipcMain.handle('ninja:ai', async (_e, payload)=>{
  if(!env('OPENAI_API_KEY')) throw new Error('OPENAI_API_KEY not configured');
  const body={model:env('NINJA_AI_MODEL')||'gpt-5.6-luna',input:payload?.input||'',max_output_tokens:payload?.max_output_tokens||1200};
  const r=await jsonFetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${env('OPENAI_API_KEY')}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok) throw new Error(`OpenAI API HTTP ${r.status}: ${r.text.slice(0,300)}`);
  return r.data;
});

function createWindow(){
  const win = new BrowserWindow({width:1500,height:900,minWidth:1100,minHeight:700,backgroundColor:'#090d14',webPreferences:{contextIsolation:true,nodeIntegration:false,preload:path.join(__dirname,'preload.cjs')}});
  win.loadFile(path.join(__dirname,'..','src','index.html'));
}
app.whenReady().then(()=>{Menu.setApplicationMenu(null);createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
