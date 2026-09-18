const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

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
app.whenReady().then(()=>{createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
