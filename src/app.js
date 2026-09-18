import { ZipReader, ZipWriter, BlobReader, BlobWriter, TextWriter } from 'https://cdn.jsdelivr.net/npm/@zip.js/zip.js@2.7.57/+esm';

const $ = id => document.getElementById(id);
const canvas = $('view'), ctx = canvas.getContext('2d');
const NODE_TYPES = ['Node2D','CharacterBody2D','StaticBody2D','Area2D','Sprite2D','AnimatedSprite2D','Camera2D','CollisionShape2D','CollisionPolygon2D','TileMap','TileMapLayer','AnimationPlayer','CanvasLayer','Control','Label','Button','Marker2D','River'];
const nodeIcons = {Node:'◇',Node2D:'◇',CharacterBody2D:'●',StaticBody2D:'■',Area2D:'◎',Sprite2D:'▧',AnimatedSprite2D:'▤',Camera2D:'⌾',CollisionShape2D:'◇',CollisionPolygon2D:'◇',TileMap:'▦',TileMapLayer:'▦',AnimationPlayer:'◌',CanvasLayer:'▱',Control:'□',Label:'T',Button:'▣',Marker2D:'⌾',River:'≋'};
const state = {
  zip:null,entries:new Map(),root:'',project:{},files:[],scene:null,selected:null,tool:'select',mode:'2d',playing:false,grid:true,zoom:1,
  camera:{x:550,y:340,limits:null},player:{x:550,y:340,speed:220,r:13},keys:new Set(),last:performance.now(),fps:60,frame:0,
  runtime:{entities:new Map(),areas:new Map(),events:[],startedAt:0,animationTime:0},
  drag:null,cacheBytes:0,cache:new Map(),dirty:false,errors:[],undo:[],redo:[],projectModel:{format:'ninja-engine',version:'0.1',project:{},scenes:[],resources:[],scripts:[],settings:{}}
};
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const escapeAttr=escapeHtml;
function ext(p){const i=p.lastIndexOf('.');return i<0?'':p.slice(i).toLowerCase();}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function archiveSizeLabel(n){return n<1048576?`${(n/1024).toFixed(0)} KB`:`${(n/1048576).toFixed(1)} MB`;}
function log(msg,level='info'){const icon=level==='error'?'✕':level==='warn'?'!':'●';$('console').insertAdjacentHTML('beforeend',`<div class="log-${level}"><i>${icon}</i> ${escapeHtml(msg)}</div>`);$('console').scrollTop=$('console').scrollHeight;if(level==='error'){state.errors.push(msg);$('errorCount').textContent=state.errors.length;$('errors').innerHTML=state.errors.map(escapeHtml).map(x=>`<div class="log-error">✕ ${x}</div>`).join('');}}
function markDirty(){state.dirty=true;$('dirtyState').textContent='● Modified';}
function clone(v){return JSON.parse(JSON.stringify(v));}
function snapshot(){return {scene:clone(state.scene),selectedId:state.selected?.id||null};}
function restore(s){state.scene=clone(s.scene);state.selected=state.scene.nodes.find(n=>n.id===s.selectedId)||null;renderAll();}
function commit(label,before){state.undo.push({label,before,after:snapshot()});if(state.undo.length>100)state.undo.shift();state.redo=[];markDirty();}
function undo(){const c=state.undo.pop();if(!c)return;state.redo.push(c);restore(c.before);log(`Undo: ${c.label}`);}
function redo(){const c=state.redo.pop();if(!c)return;state.undo.push(c);restore(c.after);log(`Redo: ${c.label}`);}
function node(type,name,x=550,y=340,w=64,h=48,parent=''){return {id:crypto.randomUUID(),name:name||type,type,parent,x,y,w,h,rotation:0,scaleX:1,scaleY:1,visible:true,properties:{},metadata:{},source:''};}
function rootForScene(s){return s.root||{id:'root',name:s.name||'Main',type:'Node2D',parent:null,x:0,y:0,w:0,h:0,rotation:0,visible:true,properties:{},metadata:{}};}
function setScene(s){state.scene=s;state.scene.root=rootForScene(s);state.selected=null;state.undo=[];state.redo=[];renderAll();}

let pmSelected=-1;
function recentProjects(){try{return JSON.parse(localStorage.getItem('ninjaRecentProjects')||'[]');}catch{return [];}}
function saveRecentProjects(items){localStorage.setItem('ninjaRecentProjects',JSON.stringify(items.slice(0,30)));}
function rememberProject(name){
  const items=recentProjects().filter(x=>x.name!==name);
  items.unshift({name,path:'Imported ZIP project',updated:new Date().toLocaleString('pt-BR')});
  saveRecentProjects(items);pmSelected=0;renderProjectManager();
}
function renderProjectManager(){
  const q=($('pmSearch')?.value||'').toLowerCase();
  let items=recentProjects().map((x,index)=>({...x,index})).filter(x=>x.name.toLowerCase().includes(q));
  if($('pmSort')?.value==='Nome')items.sort((a,b)=>a.name.localeCompare(b.name));
  $('pmProjectList').innerHTML=items.length?items.map(x=>`<div class="pm-project ${x.index===pmSelected?'selected':''}" data-index="${x.index}"><div class="pm-project-icon">忍</div><div><strong>${escapeHtml(x.name)}</strong><small>▱ ${escapeHtml(x.path)}</small></div><time>${escapeHtml(x.updated||'')}</time></div>`).join(''):'<div class="pm-empty">Nenhum projeto encontrado. Crie ou importe um projeto para começar.</div>';
  document.querySelectorAll('.pm-project').forEach(el=>el.onclick=()=>{pmSelected=Number(el.dataset.index);renderProjectManager();});
  for(const id of ['pmEditBtn','pmRunBtn','pmRenameBtn','pmDuplicateBtn','pmRemoveBtn'])$(id).disabled=pmSelected<0||!recentProjects()[pmSelected];
}
function openEditor(){$('projectManager').hidden=true;}
$('pmCreateBtn').onclick=()=>{const name=prompt('Project name:','New RPG Project');if(!name)return;state.project={name};$('projectStatus').textContent=name;newScene();rememberProject(name);openEditor();};
$('pmImportBtn').onclick=$('pmScanBtn').onclick=()=>$('zipInput').click();
$('pmEditBtn').onclick=()=>$('zipInput').click();
$('pmRunBtn').onclick=()=>{$('zipInput').click();};
$('pmRenameBtn').onclick=()=>{const items=recentProjects(),item=items[pmSelected];if(!item)return;const name=prompt('New project name:',item.name);if(name){item.name=name;saveRecentProjects(items);renderProjectManager();}};
$('pmDuplicateBtn').onclick=()=>{const items=recentProjects(),item=items[pmSelected];if(!item)return;items.splice(pmSelected+1,0,{...item,name:item.name+' Copy',updated:new Date().toLocaleString('pt-BR')});saveRecentProjects(items);pmSelected++;renderProjectManager();};
$('pmRemoveBtn').onclick=()=>{const items=recentProjects();if(!items[pmSelected])return;items.splice(pmSelected,1);saveRecentProjects(items);pmSelected=-1;renderProjectManager();};
$('pmSearch').oninput=renderProjectManager;$('pmSort').onchange=renderProjectManager;

async function refreshConnections(){
  if(!window.ninjaBridge){$('connectionSummary').textContent='Connections: Web mode';return;}
  const c=await window.ninjaBridge.connections();
  const set=(id,x)=>$(id).textContent=x.configured?'Configured':'Not configured';
  set('aiStatus',c.ai);set('notionStatus',c.notion);set('githubStatus',c.github);
  $('connectionSummary').textContent=`AI ${c.ai.configured?'✓':'—'} · Notion ${c.notion.configured?'✓':'—'} · GitHub ${c.github.configured?'✓':'—'}`;
}
async function testConnection(service,id){
  if(!window.ninjaBridge)return; const r=await window.ninjaBridge.testConnection(service); $(id).textContent=r.message|| (r.ok?'Connected':'Unavailable'); log(`${service}: ${r.message}`,r.ok?'info':'warn');
}
$('connectionsBtn').onclick=()=>{const p=$('connectionsPanel');p.hidden=!p.hidden;if(!p.hidden)refreshConnections();};
$('closeConnectionsBtn').onclick=()=>$('connectionsPanel').hidden=true;
$('mobileMenuBtn').onclick=()=>{document.querySelector('.left-panel').classList.toggle('mobile-open');document.querySelector('.right-panel').classList.remove('mobile-open');};
$('mobileInspectorBtn').onclick=()=>{document.querySelector('.right-panel').classList.toggle('mobile-open');document.querySelector('.left-panel').classList.remove('mobile-open');};
$('aiConnectBtn').onclick=()=>testConnection('ai','aiStatus');$('notionConnectBtn').onclick=()=>testConnection('notion','notionStatus');$('githubConnectBtn').onclick=()=>testConnection('github','githubStatus');
$('openBtn').onclick=()=>$('zipInput').click();
$('zipInput').onchange=e=>e.target.files[0]&&openZip(e.target.files[0]);
$('playBtn').onclick=()=>{resetRuntime();state.playing=true;state.mode='game';syncModes();log('Runtime started.');};
$('stopBtn').onclick=()=>{state.playing=false;state.mode='2d';syncModes();log('Play mode stopped.');};
$('gridBtn').onclick=()=>{state.grid=!state.grid;$('gridBtn').classList.toggle('active',state.grid);draw();};let snapEnabled=true,gridStep=16;$('snapBtn').onclick=()=>{snapEnabled=!snapEnabled;$('snapBtn').classList.toggle('active',snapEnabled);if($('snapGridCheck'))$('snapGridCheck').checked=snapEnabled;};
$('fitBtn').onclick=()=>{state.camera={x:550,y:340};state.zoom=1;$('zoomLabel').textContent='100%';draw();};
$('zoomInBtn').onclick=()=>setZoom(state.zoom*1.15);$('zoomOutBtn').onclick=()=>setZoom(state.zoom/1.15);
$('saveBtn').onclick=saveNinjaProject;$('exportBtn').onclick=exportProject;$('newSceneBtn').onclick=newScene;$('deleteBtn').onclick=deleteSelected;$('duplicateBtn').onclick=duplicateSelected;
$('newNodeBtn').onclick=()=>openNodeDialog();$('newTileMapBtn').onclick=()=>{const before=snapshot();const n=addNode('TileMap','World TileMap',550,340,640,448);state.selected=n;commit('Create TileMap',before);renderAll();};$('newAnimBtn').onclick=()=>{const before=snapshot();const n=addNode('AnimatedSprite2D','Animated Sprite',550,340,64,64);state.selected=n;commit('Create AnimatedSprite2D',before);renderAll();};
$('searchFiles').oninput=renderFiles;$('searchAssets').oninput=renderAssets;
for(const b of document.querySelectorAll('[data-tool]'))b.onclick=()=>{state.tool=b.dataset.tool;document.querySelectorAll('[data-tool]').forEach(x=>x.classList.toggle('active',x===b));};
for(const b of document.querySelectorAll('[data-mode]'))b.onclick=()=>{state.mode=b.dataset.mode;if(state.mode!=='game')state.playing=false;syncModes();};
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>switchLeftTab(b.dataset.tab);
let activeBottom=null;
for(const b of document.querySelectorAll('[data-bottom]'))b.onclick=()=>toggleBottomPanel(b.dataset.bottom);
document.querySelector('.bottom-tabs > button:last-child').onclick=()=>collapseBottomPanel();
window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;const k=e.key.toLowerCase();state.keys.add(k);if(k==='delete')deleteSelected();if(k==='q'){state.tool='select';syncToolButtons();}if(k==='w'){state.tool='move';syncToolButtons();}if(k==='e'){state.tool='rotate';syncToolButtons();}if(k==='z'&&(e.ctrlKey||e.metaKey)){e.preventDefault();e.shiftKey?redo():undo();}if(k==='y'&&(e.ctrlKey||e.metaKey)){e.preventDefault();redo();}if(k==='d'&&(e.ctrlKey||e.metaKey)){e.preventDefault();duplicateSelected();}if(k==='s'&&(e.ctrlKey||e.metaKey)){e.preventDefault();saveNinjaProject();}if(k==='escape'){const modal=document.getElementById('nodeDialog');if(modal){modal.remove();return;}state.selected=null;renderAll();}});
window.addEventListener('keyup',e=>state.keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>state.keys.clear());
function syncToolButtons(){document.querySelectorAll('[data-tool]').forEach(x=>x.classList.toggle('active',x.dataset.tool===state.tool));}
function snapValue(v){return snapEnabled?Math.round(v/gridStep)*gridStep:v;}
function updateTransformHud(n,label){const h=$('transformHud');if(!n){h.hidden=true;return;}h.hidden=false;h.textContent=label+'  X '+Math.round(n.x)+'  Y '+Math.round(n.y)+'  R '+Number(n.rotation||0).toFixed(1)+'°  S '+Number(n.scaleX||1).toFixed(2)+', '+Number(n.scaleY||1).toFixed(2);}
canvas.addEventListener('wheel',e=>{e.preventDefault();setZoom(state.zoom*(e.deltaY<0?1.1:.9),e);},{passive:false});
canvas.addEventListener('pointerdown',e=>{const p=screenToWorld(e);if(state.mode==='game')return;if(state.tool==='select'||state.tool==='move'){const hit=findNodeAt(p.x,p.y);state.selected=hit;if(hit&&['move','rotate','scale'].includes(state.tool))state.drag={node:hit,dx:p.x-hit.x,dy:p.y-hit.y,startX:p.x,startY:p.y,startRotation:hit.rotation||0,startScaleX:hit.scaleX||1,startScaleY:hit.scaleY||1,before:snapshot()};renderAll();}else{const before=snapshot();let n=null;if(state.tool==='rect')n=addNode('StaticBody2D','StaticBody2D',p.x,p.y,96,64);if(state.tool==='collision')n=addNode('CollisionShape2D','CollisionShape2D',p.x,p.y,64,48);if(state.tool==='river')n=addNode('River','River',p.x,p.y,240,120);if(state.tool==='spawn')n=addNode('Marker2D','Marker2D',p.x,p.y,32,32);if(n){state.selected=n;commit(`Create ${n.type}`,before);renderAll();}if(state.tool==='tilepaint'&&state.selected?.type==='TileMap'){paintTile(state.selected,p.x,p.y);renderAll();}}});
canvas.addEventListener('pointermove',e=>{const p=screenToWorld(e);$('coord').textContent=`x: ${Math.round(p.x)}  y: ${Math.round(p.y)}`;if(state.drag){const n=state.drag.node;if(state.tool==='move'){setLocalFromWorld(n,snapValue(p.x-state.drag.dx),snapValue(p.y-state.drag.dy));updateTransformHud(n,'Mover');}else if(state.tool==='rotate'){n.rotation=state.drag.startRotation+(p.x-state.drag.startX)*.5;updateTransformHud(n,'Rotação');}else if(state.tool==='scale'){const d=1+(p.x-state.drag.startX)/120;n.scaleX=Math.max(.05,state.drag.startScaleX*d);n.scaleY=Math.max(.05,state.drag.startScaleY*d);updateTransformHud(n,'Escala');}markDirty();renderInspector();draw();}});
canvas.addEventListener('pointerup',()=>{if(state.drag){commit(`Transform ${state.drag.node.name}`,state.drag.before);state.drag=null;updateTransformHud(null);}});canvas.addEventListener('pointerleave',()=>{if(state.drag){commit(`Move ${state.drag.node.name}`,state.drag.before);state.drag=null;}});
function openNodeDialog(){
  let modal=document.getElementById('nodeDialog');
  if(!modal){modal=document.createElement('div');modal.id='nodeDialog';modal.className='node-dialog-backdrop';document.body.appendChild(modal);}
  modal.innerHTML=`<div class="node-dialog"><div class="node-dialog-title"><b>◆ Criar Novo Node</b><button data-close>×</button></div><div class="node-dialog-body"><aside><b>Favoritos:</b><div class="node-sidebox"></div><b>Recentes:</b><div class="node-sidebox small"></div></aside><main><label><b>Pesquisar:</b><input id="nodeTypeSearch" autofocus></label><div class="node-match-title"><b>Correspondências:</b><span>Filtros⌄</span></div><div id="nodeTypeList" class="node-type-list"></div><b>Descrição:</b><div id="nodeDescription" class="node-description"><strong>Classe Node</strong><p>Classe base para todos os objetos de cena.</p></div></main></div><div class="node-dialog-actions"><button id="nodeCreateConfirm" disabled>Criar</button><button data-close>Cancelar</button></div></div>`;
  let chosen='';
  const groups=[['Node',['Node2D','CharacterBody2D','StaticBody2D','Area2D','Control','CanvasLayer']],['Visual',['Sprite2D','AnimatedSprite2D','Label','Button']],['World',['TileMap','TileMapLayer','Camera2D','Marker2D']],['Animation',['AnimationPlayer']],['Physics',['CollisionShape2D','CollisionPolygon2D']]];
  const render=()=>{const q=$('nodeTypeSearch').value.toLowerCase();$('nodeTypeList').innerHTML=groups.map(([g,types])=>{const xs=types.filter(t=>t.toLowerCase().includes(q));return xs.length?`<div class="node-group"><div>⌄ ◯ ${g}</div>${xs.map(t=>`<button data-type="${t}">　◇ ${t}</button>`).join('')}</div>`:''}).join('');document.querySelectorAll('[data-type]').forEach(b=>b.onclick=()=>{chosen=b.dataset.type;document.querySelectorAll('[data-type]').forEach(x=>x.classList.toggle('selected',x===b));$('nodeCreateConfirm').disabled=false;$('nodeDescription').innerHTML=`<strong>Classe ${chosen}</strong><p>Adiciona um nó ${chosen} à cena atual.</p>`;});};
  render();$('nodeTypeSearch').oninput=render;
  modal.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>modal.remove());
  $('nodeCreateConfirm').onclick=()=>{if(!chosen)return;const before=snapshot();const n=addNode(chosen);state.selected=n;commit(`Create ${chosen}`,before);modal.remove();renderAll();};
}


function initEditorMenus(){
  const roots=[...document.querySelectorAll('.menu-root')];
  const close=()=>roots.forEach(r=>r.classList.remove('open'));
  roots.forEach(root=>{const trigger=root.querySelector(':scope > button');trigger.onclick=e=>{e.stopPropagation();const was=root.classList.contains('open');close();if(!was)root.classList.add('open');};});
  document.addEventListener('click',e=>{if(!e.target.closest('.menu-root'))close();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();$('saveBtn')?.click();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='o'){e.preventDefault();$('openBtn')?.click();}});
  const bind=(id,target)=>{const a=$(id),b=$(target);if(a&&b)a.onclick=()=>{close();b.click();};};
  bind('menuNewScene','newSceneBtn');bind('menuOpenProject','openBtn');bind('menuSaveScene','saveBtn');bind('menuAddNode','newNodeBtn');bind('menuExportProject','exportBtn');bind('menuPlay','playBtn');bind('menuStop','stopBtn');
  $('menuProjectManager').onclick=()=>{close();showProjectManager();};
  $('menuSpriteWorkspace').onclick=()=>{close();state.mode='sprite';syncModes();};
  document.querySelectorAll('[data-bottom-menu]').forEach(b=>b.onclick=()=>{close();toggleBottomPanel(b.dataset.bottomMenu);});
  $('menuQuit').onclick=()=>{close();if(window.ninjaDesktop?.quit)window.ninjaDesktop.quit();else if(confirm('Fechar a Ninja Engine?'))window.close();};
  $('menuAbout').onclick=()=>{close();const d=document.createElement('div');d.className='about-dialog';d.innerHTML='<section class="about-dialog-card"><header>Sobre a Ninja Engine<button id="closeAbout">×</button></header><main><div class="brand-mark">忍</div><h2>Ninja Engine</h2><p>Versão 0.12<br>Editor 2D, cenas, runtime e fluxo integrado de spritesheets e animações.</p></main></section>';document.body.appendChild(d);d.onclick=e=>{if(e.target===d||e.target.id==='closeAbout')d.remove();};};
}
initEditorMenus();

initSceneTabsAndFiles();


function initRightDock(){
  const tabs=[...document.querySelectorAll('[data-right-tab]')],ins=$('inspector'),sig=$('signalsPanel'),grp=$('groupsPanel');
  function renderSignals(){const n=state.selected,items=['ready','tree_entered','tree_exited','visibility_changed'];$('signalsList').innerHTML=n?items.map(s=>\`<button class="signal-row" data-signal="\${s}"><span>⚡</span><b>\${s}</b><small>\${n.metadata?.signals?.[s]?'Conectado':'—'}</small></button>\`).join(''):'<div class="empty-state"><strong>Selecione um nó</strong><span>Os sinais disponíveis aparecerão aqui.</span></div>';}
  function renderGroups(){const n=state.selected,groups=n?.metadata?.groups||[];$('groupsList').innerHTML=n?groups.map(g=>\`<div class="group-row"><label><input type="checkbox" checked data-group="\${escapeAttr(g)}"> \${escapeHtml(g)}</label><button data-remove-group="\${escapeAttr(g)}">×</button></div>\`).join('')||'<div class="muted dock-padding">Este nó ainda não pertence a grupos.</div>':'<div class="empty-state"><strong>Selecione um nó</strong><span>Os grupos do nó aparecerão aqui.</span></div>';document.querySelectorAll('[data-remove-group]').forEach(b=>b.onclick=()=>{const before=snapshot();n.metadata.groups=groups.filter(g=>g!==b.dataset.removeGroup);commit('Remover grupo',before);renderGroups();});}
  function activate(name){tabs.forEach(t=>t.classList.toggle('active',t.dataset.rightTab===name));ins.hidden=name!=='inspector';sig.hidden=name!=='signals';grp.hidden=name!=='groups';document.querySelector('.inspector-search').hidden=name!=='inspector';document.querySelector('.object-header').hidden=name!=='inspector';if(name==='signals')renderSignals();if(name==='groups')renderGroups();}
  tabs.forEach(t=>t.onclick=()=>activate(t.dataset.rightTab));
  $('connectSignalBtn').onclick=()=>{const n=state.selected;if(!n)return;const s=prompt('Nome do sinal para conectar:','ready');if(!s)return;const before=snapshot();n.metadata.signals=n.metadata.signals||{};n.metadata.signals[s]='connected';commit('Conectar sinal',before);renderSignals();};
  $('addGroupBtn').onclick=()=>{const n=state.selected;if(!n)return;const g=prompt('Nome do grupo:','players');if(!g)return;const before=snapshot();n.metadata.groups=[...new Set([...(n.metadata.groups||[]),g])];commit('Adicionar grupo',before);renderGroups();};
  $('inspectorFilter').oninput=e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('#inspector .property,#inspector .property-group').forEach(el=>{if(el.classList.contains('property-group'))return;el.hidden=q&&!el.textContent.toLowerCase().includes(q);});};
  $('inspectorAddMeta').onclick=()=>{const n=state.selected;if(!n)return;const key=prompt('Nome do metadado:');if(!key)return;const value=prompt('Valor:','');const before=snapshot();n.metadata[key]=value;commit('Adicionar metadado',before);renderInspector();};
  window.__refreshRightDock=()=>{if(document.querySelector('[data-right-tab="signals"]').classList.contains('active'))renderSignals();if(document.querySelector('[data-right-tab="groups"]').classList.contains('active'))renderGroups();};
}


function initViewportOptions(){
 const btn=$('viewportOptionsBtn'),menu=$('viewportOptionsMenu');if(!btn||!menu)return;
 btn.onclick=e=>{e.stopPropagation();menu.hidden=!menu.hidden;};
 document.addEventListener('click',e=>{if(!e.target.closest('#viewportOptionsMenu')&&!e.target.closest('#viewportOptionsBtn'))menu.hidden=true;});
 $('showOriginCheck').onchange=e=>document.querySelectorAll('.viewport-origin,.axis-label').forEach(x=>x.hidden=!e.target.checked);
 $('showGridCheck').onchange=e=>{state.grid=e.target.checked;$('gridBtn').classList.toggle('active',state.grid);draw();};
 $('snapGridCheck').onchange=e=>{snapEnabled=e.target.checked;$('snapBtn').classList.toggle('active',snapEnabled);};
 $('gridStepInput').onchange=e=>{gridStep=clamp(Number(e.target.value)||16,1,256);e.target.value=gridStep;};
 $('centerViewBtn').onclick=()=>{state.camera.x=0;state.camera.y=0;setZoom(1);menu.hidden=true;};
}

function initBottomTools(){
  const vol=$('audioVolume'),label=$('audioVolumeLabel'),mute=$('audioMuteBtn');let muted=false,last=80;
  if(vol){vol.oninput=()=>{label.textContent=vol.value+'%';if(+vol.value>0){last=+vol.value;muted=false;mute.textContent='🔊';}};mute.onclick=()=>{muted=!muted;if(muted){last=+vol.value||last;vol.value=0;label.textContent='0%';mute.textContent='🔇';}else{vol.value=last;label.textContent=last+'%';mute.textContent='🔊';}};}
  $('openSpriteEditorBtn').onclick=()=>{state.mode='sprite';syncModes();collapseBottomPanel();};
  $('bottomAnimPlay').onclick=()=>{$('spritePlayBtn')?.click();};
  $('bottomAnimStop').onclick=()=>{$('spriteStopBtn')?.click();};
  $('bottomAnimFps').oninput=()=>{if($('spriteFps')){$('spriteFps').value=$('bottomAnimFps').value;$('spriteFps').dispatchEvent(new Event('input'));}};
  $('bottomAnimLoop').onchange=()=>{if($('spriteLoop'))$('spriteLoop').checked=$('bottomAnimLoop').checked;};
}

initBottomTools();
initRightDock();
initViewportOptions();

function initSpriteWorkspace(){
  const strip=$('frameStrip'), input=$('spriteImageInput'), canvas=$('spriteCanvas'); if(!strip||!input||!canvas)return;
  const sctx=canvas.getContext('2d',{alpha:true}); sctx.imageSmoothingEnabled=false;
  const animations=new Map([['Idle',[]],['Walk',[]],['Run',[]],['Attack',[]],['Jump',[]]]);
  let activeAnim='Idle',active=0,img=null,imgUrl='',zoom=1,playing=false,timer=null;
  const frames=()=>animations.get(activeAnim)||[];
  function syncFields(){
    $('animationName').value=activeAnim;$('spriteFpsSide').value=$('spriteFps').value;$('spriteLoopSide').checked=$('spriteLoop').checked;
    $('spriteWidthSide').value=$('spriteWidth').value;$('spriteHeightSide').value=$('spriteHeight').value;
  }
  function drawSheet(){
    sctx.clearRect(0,0,canvas.width,canvas.height);if(!img)return;
    const fw=Math.max(1,+$('spriteWidth').value||64),fh=Math.max(1,+$('spriteHeight').value||64);
    canvas.width=Math.max(896,Math.ceil(img.width*zoom));canvas.height=Math.max(416,Math.ceil(img.height*zoom));
    sctx.imageSmoothingEnabled=false;sctx.drawImage(img,0,0,img.width*zoom,img.height*zoom);
    sctx.strokeStyle='#58a6e7';sctx.lineWidth=1;
    for(let x=0;x<=img.width;x+=fw){sctx.beginPath();sctx.moveTo(x*zoom,0);sctx.lineTo(x*zoom,img.height*zoom);sctx.stroke();}
    for(let y=0;y<=img.height;y+=fh){sctx.beginPath();sctx.moveTo(0,y*zoom);sctx.lineTo(img.width*zoom,y*zoom);sctx.stroke();}
    $('spriteEmptyHint').hidden=true;
  }
  function render(){
    strip.innerHTML=frames().length?frames().map((f,i)=>\`<button class="frame-card \${i===active?'active':''}" data-frame="\${i}"><div class="frame-preview" style="background-image:url('\${imgUrl}');background-size:\${f.sheetW/f.w*62}px \${f.sheetH/f.h*62}px;background-position:-\${f.x/f.w*62}px -\${f.y/f.h*62}px"></div><span>\${i+1}</span></button>\`).join(''):'<div class="muted">Nenhum quadro. Importe e recorte uma spritesheet.</div>';
    strip.querySelectorAll('[data-frame]').forEach(b=>b.onclick=()=>{active=+b.dataset.frame;render();});syncFields();
  }
  function slice(){
    if(!img)return;const fw=Math.max(1,+$('spriteWidth').value||64),fh=Math.max(1,+$('spriteHeight').value||64),out=[];
    for(let y=0;y+fh<=img.height;y+=fh)for(let x=0;x+fw<=img.width;x+=fw)out.push({x,y,w:fw,h:fh,sheetW:img.width,sheetH:img.height});
    animations.set(activeAnim,out);active=0;$('spriteColumns').value=Math.floor(img.width/fw);$('spriteRows').value=Math.floor(img.height/fh);render();drawSheet();
  }
  $('spriteImportBtn').onclick=()=>input.click();
  input.onchange=e=>{const file=e.target.files?.[0];if(!file)return;if(imgUrl)URL.revokeObjectURL(imgUrl);imgUrl=URL.createObjectURL(file);img=new Image();img.onload=()=>{slice();drawSheet();};img.src=imgUrl;};
  $('autoSliceBtn').onclick=slice;
  const duration=()=>{$('spriteDuration').textContent=(1/Math.max(1,+$('spriteFps').value||12)).toFixed(3)+' s';syncFields();if(playing)play();};$('spriteFps').oninput=duration;duration();
  const step=()=>{const fs=frames();if(!fs.length)return;if(active>=fs.length-1){if($('spriteLoop').checked)active=0;else return stop();}else active++;render();};
  function play(){clearInterval(timer);playing=true;timer=setInterval(step,1000/Math.max(1,+$('spriteFps').value||12));}
  function stop(){playing=false;clearInterval(timer);active=0;render();}
  $('spritePlayBtn').onclick=play;$('spritePauseBtn').onclick=()=>{playing=false;clearInterval(timer)};$('spriteStopBtn').onclick=stop;
  $('addFrameBtn').onclick=()=>{const fs=frames();const base=fs[active]||{x:0,y:0,w:+$('spriteWidth').value||64,h:+$('spriteHeight').value||64,sheetW:img?.width||64,sheetH:img?.height||64};fs.push({...base});active=fs.length-1;render();};
  $('duplicateFrameBtn').onclick=()=>{const fs=frames();if(!fs.length)return;fs.splice(active+1,0,{...fs[active]});active++;render();};
  $('removeFrameBtn').onclick=()=>{const fs=frames();if(!fs.length)return;fs.splice(active,1);active=Math.max(0,Math.min(active,fs.length-1));render();};
  $('moveFrameLeftBtn').onclick=()=>{const fs=frames();if(active<=0)return;[fs[active-1],fs[active]]=[fs[active],fs[active-1]];active--;render();};
  $('moveFrameRightBtn').onclick=()=>{const fs=frames();if(active>=fs.length-1)return;[fs[active+1],fs[active]]=[fs[active],fs[active+1]];active++;render();};
  document.querySelectorAll('#animationTabs [data-animation]').forEach(b=>b.onclick=()=>selectAnim(b.dataset.animation,b));
  function selectAnim(name,button){activeAnim=name;active=0;document.querySelectorAll('#animationTabs [data-animation]').forEach(x=>x.classList.toggle('active',x===button));render();}
  $('newAnimationBtn').onclick=()=>{const name=prompt('Nome da animação:','NovaAnimação');if(!name||animations.has(name))return;animations.set(name,$('keepCharacterCheck').checked?frames().map(f=>({...f})):[]);const b=document.createElement('button');b.dataset.animation=name;b.textContent=name;b.onclick=()=>selectAnim(name,b);$('newAnimationBtn').before(b);selectAnim(name,b);};
  const keepA=$('keepCharacterCheck'),keepB=$('keepCharacterSide');const sk=e=>{keepA.checked=e.target.checked;keepB.checked=e.target.checked};keepA.onchange=sk;keepB.onchange=sk;
  let ratio=1;function sizeFrom(source){const w=$('spriteWidth'),h=$('spriteHeight');if(source==='w'&&$('lockRatio').checked)h.value=Math.max(1,Math.round(+w.value/ratio));if(source==='h'&&$('lockRatio').checked)w.value=Math.max(1,Math.round(+h.value*ratio));slice();syncFields();}
  $('spriteWidth').onchange=()=>sizeFrom('w');$('spriteHeight').onchange=()=>sizeFrom('h');$('spriteWidthSide').onchange=()=>{$('spriteWidth').value=$('spriteWidthSide').value;sizeFrom('w')};$('spriteHeightSide').onchange=()=>{$('spriteHeight').value=$('spriteHeightSide').value;sizeFrom('h')};
  document.querySelectorAll('[data-size]').forEach(b=>b.onclick=()=>{$('spriteWidth').value=$('spriteHeight').value=b.dataset.size;ratio=1;slice();syncFields()});
  $('spriteFpsSide').oninput=()=>{$('spriteFps').value=$('spriteFpsSide').value;duration()};$('spriteLoopSide').onchange=()=>{$('spriteLoop').checked=$('spriteLoopSide').checked};
  $('animationName').onchange=()=>{const n=$('animationName').value.trim();if(!n||n===activeAnim||animations.has(n))return;$('animationTabs').querySelector(\`[data-animation="\${activeAnim}"]\`).textContent=n;animations.set(n,animations.get(activeAnim));animations.delete(activeAnim);activeAnim=n;};
  $('spriteZoomIn').onclick=()=>{zoom=Math.min(8,zoom*1.25);$('spriteZoomLabel').textContent=Math.round(zoom*100)+'%';drawSheet()};$('spriteZoomOut').onclick=()=>{zoom=Math.max(.25,zoom/1.25);$('spriteZoomLabel').textContent=Math.round(zoom*100)+'%';drawSheet()};
  render();
}
initSpriteWorkspace();

function syncModes(){document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('active',x.dataset.mode===state.mode));const center=document.querySelector('.center'),sw=$('spriteWorkspace'),view=$('view'),tools=document.querySelector('.viewport-tools');if(center&&sw){const sprite=state.mode==='sprite';center.classList.toggle('sprite-mode',sprite);sw.hidden=!sprite;if(view)view.hidden=sprite;if(tools)tools.hidden=sprite;}draw();}
function switchLeftTab(tab){document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));$('scenePane').hidden=tab!=='scene';$('filesPane').hidden=tab!=='files';}
function switchBottomTab(tab){activeBottom=tab;const panel=document.querySelector('.bottom-panel');panel.classList.add('expanded');document.querySelectorAll('[data-bottom]').forEach(x=>x.classList.toggle('active',x.dataset.bottom===tab));$('console').hidden=tab!=='output';$('debugger').hidden=tab!=='debugger';$('errors').hidden=tab!=='errors';$('audio').hidden=tab!=='audio';$('animation').hidden=tab!=='animation';}
function collapseBottomPanel(){activeBottom=null;document.querySelector('.bottom-panel').classList.remove('expanded');document.querySelectorAll('[data-bottom]').forEach(x=>x.classList.remove('active'));for(const id of ['console','debugger','errors','audio','animation'])$(id).hidden=true;}
function toggleBottomPanel(tab){if(activeBottom===tab&&document.querySelector('.bottom-panel').classList.contains('expanded'))collapseBottomPanel();else switchBottomTab(tab);}
function setZoom(z){state.zoom=clamp(z,.35,3);$('zoomLabel').textContent=`${Math.round(state.zoom*100)}%`;draw();}
function screenToWorld(e){const r=canvas.getBoundingClientRect(),sx=(e.clientX-r.left)*canvas.width/r.width,sy=(e.clientY-r.top)*canvas.height/r.height;return{x:(sx-canvas.width/2)/state.zoom+state.camera.x,y:(sy-canvas.height/2)/state.zoom+state.camera.y};}
function addNode(type,name,x=550,y=340,w=70,h=55,parent=''){const n=node(type,name,x,y,w,h,parent);if(type==='TileMap'||type==='TileMapLayer'){n.properties={tileSize:32,columns:20,rows:14,cells:{},source:'procedural-grid'};}if(type==='AnimatedSprite2D'){n.properties={frames:4,frameDuration:0.14,loop:true,animation:'default'};}state.scene.nodes.push(n);return n;}
function paintTile(tile,x,y){const wt=worldTransform(tile);const size=Number(tile.properties?.tileSize)||32;const col=Math.floor((x-wt.x+tile.w/2)/size),row=Math.floor((y-wt.y+tile.h/2)/size);if(col<0||row<0)return;const cols=Math.max(1,Math.floor(tile.w/size)),rows=Math.max(1,Math.floor(tile.h/size));if(col>=cols||row>=rows)return;tile.properties=tile.properties||{};tile.properties.cells=tile.properties.cells||{};const key=`${col},${row}`;tile.properties.cells[key]=tile.properties.cells[key]?0:1;markDirty();}
function tileCells(tile){return tile.properties?.cells||{};}
function descendants(id){const out=[],seen=new Set(),q=[id];while(q.length){const p=q.shift();if(seen.has(p))continue;seen.add(p);for(const n of state.scene.nodes.filter(n=>n.parent===p)){if(!seen.has(n.id)){out.push(n);q.push(n.id);}}}return out;}function canReparent(nodeId,targetId){if(!nodeId||nodeId===targetId)return false;return !descendants(nodeId).some(n=>n.id===targetId);}
function getNode(id){return id==='root'?rootForScene(state.scene):state.scene.nodes.find(n=>n.id===id)||null;}
function worldTransform(n,seen=new Set()){if(!n)return{x:0,y:0,rotation:0,sx:1,sy:1};if(seen.has(n.id))return{x:n.x||0,y:n.y||0,rotation:n.rotation||0,sx:n.scaleX??1,sy:n.scaleY??1};seen.add(n.id);const p=n.parent?getNode(n.parent):null;if(!p)return{x:n.x||0,y:n.y||0,rotation:n.rotation||0,sx:n.scaleX??1,sy:n.scaleY??1};const pw=worldTransform(p,seen),r=(pw.rotation||0)*Math.PI/180, lx=(n.x||0)*(pw.sx??1), ly=(n.y||0)*(pw.sy??1);return{x:(pw.x||0)+lx*Math.cos(r)-ly*Math.sin(r),y:(pw.y||0)+lx*Math.sin(r)+ly*Math.cos(r),rotation:(pw.rotation||0)+(n.rotation||0),sx:(pw.sx??1)*(n.scaleX??1),sy:(pw.sy??1)*(n.scaleY??1)};}
function setLocalFromWorld(n,wx,wy){const p=n.parent?getNode(n.parent):null;if(!p){n.x=wx;n.y=wy;return;}const pw=worldTransform(p),r=-(pw.rotation||0)*Math.PI/180,dx=wx-(pw.x||0),dy=wy-(pw.y||0);n.x=(dx*Math.cos(r)-dy*Math.sin(r))/(pw.sx??1);n.y=(dx*Math.sin(r)+dy*Math.cos(r))/(pw.sy??1);}

function deleteSelected(){if(!state.selected)return;const before=snapshot(),id=state.selected.id;const doomed=new Set([id,...descendants(id).map(n=>n.id)]);state.scene.nodes=state.scene.nodes.filter(n=>!doomed.has(n.id));state.selected=null;commit('Delete node',before);renderAll();}
function duplicateSelected(){if(!state.selected)return;const before=snapshot(),o=state.selected,n=clone(o);n.id=crypto.randomUUID();n.name=`${o.name}_copy`;n.x+=24;n.y+=24;state.scene.nodes.push(n);state.selected=n;commit('Duplicate node',before);renderAll();}
function newScene(){const before=state.scene?snapshot():null;setScene({path:'',name:'New Scene',root:node('Node2D','NewScene',0,0,0,0,''),nodes:[]});state.scene.root.id='root';markDirty();if(before)state.undo=[];log('New scene created.');}
function findNodeAt(x,y){for(let i=state.scene.nodes.length-1;i>=0;i--){const n=state.scene.nodes[i];if(!n.visible)continue;const w=worldTransform(n),a=(w.rotation||0)*Math.PI/180,dx=x-w.x,dy=y-w.y,rx=dx*Math.cos(a)+dy*Math.sin(a),ry=-dx*Math.sin(a)+dy*Math.cos(a);if(Math.abs(rx)<=n.w*(w.sx??1)/2&&Math.abs(ry)<=n.h*(w.sy??1)/2)return n;}return null;}

async function openZip(file){
  state.zip=file;state.entries.clear();state.cache.clear();state.cacheBytes=0;state.errors=[];state.undo=[];state.redo=[];$('statusText').textContent='Reading archive…';$('projectStatus').textContent='Importing…';log(`Opening ${file.name}`);
  try{const reader=new ZipReader(new BlobReader(file));for(const e of await reader.getEntries())state.entries.set(e.filename,e);await reader.close();state.files=[...state.entries.keys()].sort((a,b)=>a.localeCompare(b));state.root=detectRoot();const pp=state.root+'project.godot';state.project=state.entries.has(pp)?parseGodot(await readText(pp)):{name:file.name.replace(/\.zip$/i,'')};state.projectModel.project=clone(state.project);$('projectStatus').textContent=state.project.name||file.name;$('memory').textContent=archiveSizeLabel(file.size);$('projectInfo').innerHTML=`<div><b>${escapeHtml(state.project.name||file.name)}</b></div><div>${state.entries.size.toLocaleString()} files</div><div>Godot features: ${escapeHtml(state.project.features||'unknown')}</div><div class="muted">Ninja intermediate model active</div>`;rememberProject(state.project.name||file.name);openEditor();renderFiles();renderAssets();if(state.project.main_scene&&state.entries.has(resolvePath(state.project.main_scene)))await loadScene(resolvePath(state.project.main_scene));else refreshConnections();
setScene({path:'',name:'Main',root:node('Node2D','Main',0,0,0,0,''),nodes:[]});$('statusText').textContent='Project imported';log(`Indexed ${state.entries.size.toLocaleString()} archive entries.`);await buildCompatibilityReport();}
  catch(err){$('statusText').textContent='Import failed';log(err.message,'error');console.error(err);}
}
function detectRoot(){const keys=[...state.entries.keys()];if(keys.includes('project.godot'))return '';const k=keys.find(x=>x.endsWith('/project.godot'));return k?k.slice(0,-'project.godot'.length):'';}
function resolvePath(p){if(p.startsWith('res://'))return state.root+p.slice(6);return state.root+p;}
async function readText(path){const e=state.entries.get(path);if(!e)throw new Error(`Missing archive entry: ${path}`);if(state.cache.has(path))return state.cache.get(path).text;const text=await e.getData(new TextWriter());cachePut(path,{text,bytes:text.length*2});return text;}
function cachePut(path,value){state.cache.set(path,value);state.cacheBytes+=value.bytes||0;const MAX=64*1024*1024;while(state.cacheBytes>MAX&&state.cache.size>1){const k=state.cache.keys().next().value,v=state.cache.get(k);state.cache.delete(k);state.cacheBytes-=v.bytes||0;}$('memory').textContent=`cache ${archiveSizeLabel(state.cacheBytes)}`;}
function unquote(s){const t=s.trim();if(/^"[\s\S]*"$/.test(t))try{return JSON.parse(t);}catch{}return t;}
function parseGodot(t){const p={settings:{}};for(const raw of t.split(/\r?\n/)){const line=raw.trim();let m=line.match(/^config\/name\s*=\s*"(.*)"/);if(m)p.name=m[1];m=line.match(/^run\/main_scene\s*=\s*"(.*)"/);if(m)p.main_scene=m[1];m=line.match(/^config\/features\s*=\s*PackedStringArray\((.*)\)/);if(m)p.features=m[1];m=line.match(/^([^#=]+?)\s*=\s*(.+)$/);if(m&&!/^config\/name|^run\/main_scene|^config\/features/.test(line))p.settings[m[1].trim()]=unquote(m[2]);}return p;}
function splitTop(s){const out=[];let cur='',depth=0,quote=false,esc=false;for(const ch of s){if(esc){cur+=ch;esc=false;continue}if(ch==='\\'){cur+=ch;esc=true;continue}if(ch==='"'){quote=!quote;cur+=ch;continue}if(!quote&&(ch==='('||ch==='['||ch==='{'))depth++;if(!quote&&(ch===')'||ch===']'||ch==='}'))depth--;if(!quote&&depth===0&&ch===','){out.push(cur.trim());cur='';}else cur+=ch;}if(cur.trim())out.push(cur.trim());return out;}
function parseTyped(v){v=v.trim();if(v==='true')return true;if(v==='false')return false;if(v==='null')return null;if(/^[-+]?\d+(\.\d+)?$/.test(v))return Number(v);if(/^Vector2\(/.test(v)){const a=splitTop(v.slice(v.indexOf('(')+1,-1));return {__type:'Vector2',x:Number(a[0]),y:Number(a[1])};}if(/^Vector2i\(/.test(v)){const a=splitTop(v.slice(v.indexOf('(')+1,-1));return {__type:'Vector2i',x:Number(a[0]),y:Number(a[1])};}if(/^Color\(/.test(v))return {__type:'Color',raw:v};if(/^ExtResource\("([^"]+)"\)/.test(v))return {__type:'ExtResource',id:v.match(/^ExtResource\("([^"]+)"\)/)[1]};if(/^SubResource\("([^"]+)"\)/.test(v))return {__type:'SubResource',id:v.match(/^SubResource\("([^"]+)"\)/)[1]};if(/^PackedStringArray\(/.test(v))return splitTop(v.slice(v.indexOf('(')+1,-1)).map(parseTyped);if(/^Array\[/.test(v)||/^\[/.test(v))return splitTop(v.slice(v.indexOf('[')+1,-1)).map(parseTyped);if(/^"[\s\S]*"$/.test(v))try{return JSON.parse(v);}catch{}return v;}
function parseTscn(text,path){
  const lines=text.split(/\r?\n/), extResources={}, subResources={}, nodes=[], signals=[]; let section=null, current=null;
  for(const raw of lines){const line=raw.trim();if(!line||line.startsWith(';'))continue;
    let m=line.match(/^\[ext_resource\s+(.+)\]$/); if(m){const a=parseHeaderAttrs(m[1]);extResources[a.id||String(Object.keys(extResources).length+1)]={type:a.type||'',path:a.path||'',id:a.id||''};continue;}
    m=line.match(/^\[sub_resource\s+(.+)\]$/); if(m){const a=parseHeaderAttrs(m[1]);current={type:a.type||'',id:a.id||String(Object.keys(subResources).length+1),properties:{}};subResources[current.id]=current;section='sub';continue;}
    m=line.match(/^\[node\s+(.+)\]$/); if(m){const a=parseHeaderAttrs(m[1]);current={id:crypto.randomUUID(),name:a.name||'Node',type:a.type||'Node',parent:a.parent||'',x:0,y:0,w:64,h:48,rotation:0,visible:true,properties:{},metadata:{},source:a.instance||''};nodes.push(current);section='node';continue;}
    m=line.match(/^\[connection\s+(.+)\]$/); if(m){signals.push(parseHeaderAttrs(m[1]));section='connection';continue;}
    if(line.startsWith('[')){section=null;current=null;continue;}
    m=line.match(/^([^=]+?)\s*=\s*(.+)$/);if(!m||!current)continue;const key=m[1].trim(), value=parseTyped(m[2]);
    if(section==='node'){current.properties[key]=value;if(key==='position'&&value?.__type==='Vector2'){current.x=value.x;current.y=value.y;}else if(key==='rotation')current.rotation=Number(value)*180/Math.PI;else if(key==='visible')current.visible=Boolean(value);else if(key==='size'&&value?.__type==='Vector2'){current.w=value.x;current.h=value.y;}}
    else if(section==='sub')current.properties[key]=value;
  }
  const root=nodes.find(n=>!n.parent)||nodes[0]||node('Node2D','Main',0,0,0,0,'');
  const list=nodes.filter(n=>n!==root);const map=new Map(nodes.map(n=>[n.name,n]));
  for(const n of list){if(n.parent==='.')n.parent=root.id;else if(n.parent){const parentName=n.parent.split('/').pop();const p=map.get(parentName);if(p)n.parent=p.id;}}
  return {path,name:path.split('/').pop().replace(/\.tscn$/i,''),root,nodes:list,resources:{extResources,subResources},signals,format:3};
}
function parseHeaderAttrs(s){const a={};for(const part of splitHeader(s)){const m=part.match(/^([\w/]+)=(.*)$/);if(m)a[m[1]]=unquote(m[2]);}return a;}
function splitHeader(s){const out=[];let cur='',q=false,esc=false;for(const ch of s){if(esc){cur+=ch;esc=false;continue}if(ch==='\\'){cur+=ch;esc=true;continue}if(ch==='"'){q=!q;cur+=ch;continue}if(!q&&/\s/.test(ch)){if(cur){out.push(cur);cur='';}}else cur+=ch;}if(cur)out.push(cur);return out;}

async function loadScene(path){if(!state.entries.has(path)){log(`Scene not found: ${path}`,'error');return;}try{const text=await readText(path);if(ext(path)!=='.tscn'){log(`Unsupported scene format: ${ext(path)}`,'warn');return;}const parsed=parseTscn(text,path);setScene(parsed);state.projectModel.scenes=state.projectModel.scenes.filter(s=>s.path!==path);state.projectModel.scenes.push(clone(parsed));$('sceneName').textContent=state.scene.name;log(`Loaded scene ${path}: ${state.scene.nodes.length+1} nodes, ${Object.keys(parsed.resources.extResources).length} external resources.`);}
catch(e){log(`Scene parse failed: ${e.message}`,'error');}}
function renderAll(){renderSceneTree();renderInspector();window.__refreshRightDock?.();renderFiles();draw();$('sceneName').textContent=state.scene?.name||'Cena sem título';$('dirtyState').textContent=state.dirty?'● Modificado':'';}
function renderSceneTree(){const root=rootForScene(state.scene||{});const rows=[],seen=new Set();function walk(parent,depth){const children=state.scene.nodes.filter(n=>(n.parent||'')===(parent==='root'?'':parent));for(const n of children){if(seen.has(n.id))continue;seen.add(n.id);rows.push({n,depth});walk(n.id,depth+1);}}rows.push({n:root,depth:0});walk(root.id,1);$('sceneTree').innerHTML=rows.map(r=>\`<div class="tree-row \${r.n===state.selected?'selected':''}" data-id="\${r.n.id}" draggable="\${r.depth>0}"><span class="tree-indent" style="--depth:\${r.depth}">\${r.depth?'└':'▾'}</span><span class="tree-icon">\${nodeIcons[r.n.type]||'◇'}</span><span class="tree-label">\${escapeHtml(r.n.name)}</span><span class="node-type">\${escapeHtml(r.n.type)}</span><button class="tree-visibility" title="Visibilidade">\${r.n.visible===false?'○':'◉'}</button></div>\`).join('');
  document.querySelectorAll('#sceneTree .tree-row').forEach(el=>{el.onclick=e=>{if(e.target.closest('.tree-visibility'))return;state.selected=state.scene.nodes.find(n=>n.id===el.dataset.id)||null;renderAll();};el.ondblclick=e=>{if(e.target.closest('.tree-visibility'))return;const n=state.scene.nodes.find(n=>n.id===el.dataset.id);if(!n)return;const label=el.querySelector('.tree-label'),input=document.createElement('input');input.className='tree-rename';input.value=n.name;label.replaceWith(input);input.focus();input.select();const finish=()=>{const v=input.value.trim();if(v&&v!==n.name){const before=snapshot();n.name=v;commit('Renomear nó',before);}renderAll();};input.onblur=finish;input.onkeydown=k=>{if(k.key==='Enter')input.blur();if(k.key==='Escape')renderAll();};};el.ondragstart=e=>{e.dataTransfer.setData('text/ninja-node',el.dataset.id);};el.ondragover=e=>e.preventDefault();el.ondrop=e=>{e.preventDefault();const id=e.dataTransfer.getData('text/ninja-node'),n=state.scene.nodes.find(x=>x.id===id),target=state.scene.nodes.find(x=>x.id===el.dataset.id)||root;if(!n||!canReparent(n.id,target.id)){log('Reparentamento inválido: um nó não pode ser filho de si mesmo ou de um descendente.','warn');return;}const before=snapshot();n.parent=target.id==='root'?'':target.id;commit('Reparentar nó',before);renderAll();};const vis=el.querySelector('.tree-visibility');vis.onclick=e=>{e.stopPropagation();const n=state.scene.nodes.find(x=>x.id===el.dataset.id);if(!n)return;const before=snapshot();n.visible=n.visible===false;commit('Alterar visibilidade',before);renderAll();};});$('objectCount').textContent=state.scene.nodes.length;}
function tileInspector(n){if(!['TileMap','TileMapLayer'].includes(n.type))return '';const ts=Number(n.properties?.tileSize)||32;const cells=Object.keys(tileCells(n)).length;return `<div class=\"field-group\"><label>Tile Size</label><input id=\"tileSizeInput\" type=\"number\" value=\"${ts}\"></div><div class=\"field-group\"><label>Painted Cells</label><div class=\"muted\">${cells} cells · use ▦ tool</div></div>`;}
function renderInspector(){const o=state.selected;$('selectedType').textContent=o?o.type:'—';if(!o){$('inspector').innerHTML='<div class="empty-state"><div class="empty-icon">◇</div><strong>Selecione um nó</strong><span>As propriedades aparecerão aqui.</span></div>';return;}const blocked=new Set(descendants(o.id).map(n=>n.id));const parents=[rootForScene(state.scene),...state.scene.nodes.filter(n=>n.id!==o.id&&!blocked.has(n.id))];const vec=(label,a,b)=>\`<div class="property vector-property"><label>\${label}</label><div><input type="number" step="0.1" data-p="\${a}" value="\${o[a]??0}"><input type="number" step="0.1" data-p="\${b}" value="\${o[b]??0}"></div></div>\`;$('inspector').innerHTML=\`\${tileInspector(o)}<div class="property-group"><div class="property-header">NÓ <span>⌃</span></div><div class="property"><label>Nome</label><input data-p="name" value="\${escapeAttr(o.name)}"></div><div class="property"><label>Tipo</label><select data-p="type">\${NODE_TYPES.map(t=>\`<option \${t===o.type?'selected':''}>\${t}</option>\`).join('')}</select></div><div class="property"><label>Pai</label><select data-p="parent"><option value="">\${escapeHtml(rootForScene(state.scene).name)}</option>\${parents.filter(p=>p.id&&p.id!==o.id).map(p=>\`<option value="\${p.id}" \${o.parent===p.id?'selected':''}>\${escapeHtml(p.name)}</option>\`).join('')}</select></div></div><div class="property-group"><div class="property-header">TRANSFORM <span>⌃</span></div>\${vec('Posição','x','y')}\${vec('Tamanho','w','h')}<div class="property"><label>Rotação</label><input type="number" step="0.1" data-p="rotation" value="\${o.rotation??0}"></div>\${vec('Escala','scaleX','scaleY')}</div><div class="property-group"><div class="property-header">VISIBILIDADE <span>⌃</span></div><div class="property"><label>Visível</label><input type="checkbox" data-p="visible" \${o.visible!==false?'checked':''}></div></div><div class="property-group"><div class="property-header">METADADOS <span>⌄</span></div><div class="property-json"><code>\${escapeHtml(JSON.stringify(o.properties,null,2))}</code></div></div>\`;
  document.querySelectorAll('#inspector [data-p]').forEach(el=>el.onchange=()=>{const before=snapshot(),p=el.dataset.p;if(p==='visible')o[p]=el.checked;else if(['x','y','w','h','rotation','scaleX','scaleY'].includes(p))o[p]=Number(el.value);else o[p]=el.value;commit(\`Alterar \${p}\`,before);renderAll();});
  document.querySelectorAll('#inspector .property-header').forEach(h=>h.onclick=()=>h.parentElement.classList.toggle('collapsed'));
}

let openSceneTabs=[];
function syncSceneTabs(){
  const list=$('sceneTabList');if(!list)return;
  const current=state.scene?.path||state.scene?.name||'current';
  if(!openSceneTabs.some(t=>t.key===current))openSceneTabs.push({key:current,label:state.scene?.name||'Cena sem título',scene:clone(state.scene)});
  openSceneTabs=openSceneTabs.map(t=>t.key===current?{...t,label:state.scene?.name||t.label,scene:clone(state.scene)}:t);
  list.innerHTML=openSceneTabs.map(t=>\`<button class="scene-tab \${t.key===current?'active':''}" data-scene-key="\${escapeAttr(t.key)}"><span>◇</span><span>\${escapeHtml(t.label)}</span><i data-close-scene="\${escapeAttr(t.key)}">×</i></button>\`).join('');
  list.querySelectorAll('[data-scene-key]').forEach(b=>b.onclick=e=>{if(e.target.matches('[data-close-scene]'))return;const t=openSceneTabs.find(x=>x.key===b.dataset.sceneKey);if(t){state.scene=clone(t.scene);state.selected=null;renderAll();syncSceneTabs();}});
  list.querySelectorAll('[data-close-scene]').forEach(x=>x.onclick=e=>{e.stopPropagation();if(openSceneTabs.length<=1)return;const key=x.dataset.closeScene,was=key===current;openSceneTabs=openSceneTabs.filter(t=>t.key!==key);if(was){state.scene=clone(openSceneTabs.at(-1).scene);state.selected=null;renderAll();}syncSceneTabs();});
}
function initSceneTabsAndFiles(){
  $('addSceneTabBtn').onclick=()=>{newScene();syncSceneTabs();};
  const openResource=async path=>{if(/\.tscn$/i.test(path)){await loadScene(path);syncSceneTabs();return;}if(/\.(png|jpe?g|webp)$/i.test(path)){state.mode='sprite';syncModes();log('Recurso de imagem selecionado: '+path);return;}log('Recurso selecionado: '+path);};
  const attach=()=>{document.querySelectorAll('#assetList .asset,#fileList .file-row').forEach(el=>{const path=el.dataset.path||el.title;el.ondblclick=()=>openResource(path);el.oncontextmenu=e=>{e.preventDefault();const m=$('fileContextMenu');m.dataset.path=path;m.hidden=false;m.style.left=e.clientX+'px';m.style.top=e.clientY+'px';};});};
  window.__attachFileInteractions=attach;
  document.addEventListener('click',e=>{const m=$('fileContextMenu');if(m&&!e.target.closest('#fileContextMenu'))m.hidden=true;});
  $('fileContextMenu').onclick=async e=>{const b=e.target.closest('[data-file-action]');if(!b)return;const m=$('fileContextMenu'),path=m.dataset.path;m.hidden=true;if(b.dataset.fileAction==='open')openResource(path);if(b.dataset.fileAction==='copy')navigator.clipboard?.writeText(path);if(b.dataset.fileAction==='rename')log('Renomear recurso será aplicado ao projeto exportado: '+path,'warn');if(b.dataset.fileAction==='delete')log('Remoção de recurso protegida no arquivo importado: '+path,'warn');};
  syncSceneTabs();
}
function renderFiles(){const q=$('searchFiles').value.toLowerCase();const arr=state.files.filter(k=>k.toLowerCase().includes(q)).slice(0,1000);$('fileList').innerHTML=arr.length?arr.map(k=>`<div class="file-row" data-path="${escapeAttr(k)}" title="${escapeAttr(k)}"><span>${fileIcon(k)}</span><span>${escapeHtml(k)}</span></div>`).join(''):'<div class="muted">Nenhum arquivo encontrado.</div>';window.__attachFileInteractions?.();}
function renderAssets(){const q=$('searchAssets').value.toLowerCase();const arr=state.files.filter(k=>/\.(png|jpe?g|webp|svg|ogg|wav|mp3|ttf|woff2?|tscn|tres|res)$/i.test(k)&&k.toLowerCase().includes(q)).slice(0,500);$('assetCount').textContent=arr.length;$('assetList').innerHTML=arr.length?arr.map(k=>`<div class="asset" data-path="${escapeAttr(k)}" title="${escapeAttr(k)}"><span class="asset-icon">${fileIcon(k)}</span><span>${escapeHtml(k.split('/').pop())}</span></div>`).join(''):'<div class="muted">Nenhum recurso encontrado.</div>';window.__attachFileInteractions?.();}
function fileIcon(k){const e=ext(k);return e==='.tscn'?'◇':e==='.gd'?'G':e==='.png'||e==='.jpg'||e==='.jpeg'||e==='.webp'?'▧':e==='.ogg'||e==='.wav'||e==='.mp3'?'♫':e==='.tres'||e==='.res'?'◆':'•';}
async function buildCompatibilityReport(){const counts={supported:0,partial:0,unsupported:0};const details=[];for(const p of state.files){const e=ext(p);let status='unsupported';if(['.tscn','.godot'].includes(e))status='supported';else if(['.tres','.res','.gd','.png','.jpg','.jpeg','.webp','.svg','.ogg','.wav','.mp3','.ttf','.woff','.woff2'].includes(e))status='partial';counts[status]++;details.push({path:p,status});}state.projectModel.compatibility={...counts,details};buildResourceModel();log(`Compatibility scan: ${counts.supported} supported, ${counts.partial} partial, ${counts.unsupported} unsupported.`);}
function colliders(){return state.scene.nodes.filter(n=>n.visible!==false&&['StaticBody2D','CollisionShape2D','CollisionPolygon2D','River'].includes(n.type));}
function rectWorld(o){const t=worldTransform(o);return {x:t.x,y:t.y,w:Math.abs((o.w||0)*(t.sx||1)),h:Math.abs((o.h||0)*(t.sy||1))};}
function overlaps(a,b,pad=0){const A=rectWorld(a),B=typeof b==='object'&&b.w!==undefined?b:{x:b.x,y:b.y,w:b.r*2,h:b.r*2};return Math.abs(A.x-B.x)*2 < A.w+B.w+pad*2 && Math.abs(A.y-B.y)*2 < A.h+B.h+pad*2;}
function blocked(nx,ny){const r=state.player.r;for(const o of colliders()){const b=rectWorld(o);if(Math.abs(nx-b.x)*2 < b.w+2*r && Math.abs(ny-b.y)*2 < b.h+2*r)return true;}return false;}
function entityPosition(n){const t=worldTransform(n);return {x:t.x,y:t.y};}
function resetRuntime(){state.runtime={entities:new Map(),areas:new Map(),events:[],startedAt:performance.now(),animationTime:0};const chars=state.scene.nodes.filter(n=>n.type==='CharacterBody2D');const spawn=state.scene.nodes.find(n=>n.type==='Marker2D'&&n.properties?.spawn===true)||chars[0];const pos=spawn?entityPosition(spawn):{x:550,y:340};state.player.x=pos.x;state.player.y=pos.y;state.camera.x=pos.x;state.camera.y=pos.y;for(const n of state.scene.nodes){if(n.type==='CharacterBody2D')state.runtime.entities.set(n.id,{id:n.id,node:n,x:entityPosition(n).x,y:entityPosition(n).y,vx:0,vy:0});if(n.type==='Area2D')state.runtime.areas.set(n.id,new Set());}}
function areaEvents(){for(const area of state.scene.nodes.filter(n=>n.type==='Area2D'&&n.visible!==false)){const inside=overlaps(area,{x:state.player.x,y:state.player.y,w:state.player.r*2,h:state.player.r*2});const set=state.runtime.areas.get(area.id)||new Set();const key='player';if(inside&&!set.has(key)){set.add(key);state.runtime.events.unshift(`${area.name}: body_entered(player)`);state.runtime.events=state.runtime.events.slice(0,30);}else if(!inside&&set.has(key)){set.delete(key);state.runtime.events.unshift(`${area.name}: body_exited(player)`);state.runtime.events=state.runtime.events.slice(0,30);}state.runtime.areas.set(area.id,set);}}
function clampCamera(){const l=state.camera.limits;if(!l)return;const hw=canvas.width/(2*state.zoom),hh=canvas.height/(2*state.zoom);state.camera.x=clamp(state.camera.x,l.left+hw,l.right-hw);state.camera.y=clamp(state.camera.y,l.top+hh,l.bottom-hh);}
function updateRuntime(dt){if(!state.playing)return;let dx=0,dy=0;if(state.keys.has('w')||state.keys.has('arrowup'))dy--;if(state.keys.has('s')||state.keys.has('arrowdown'))dy++;if(state.keys.has('a')||state.keys.has('arrowleft'))dx--;if(state.keys.has('d')||state.keys.has('arrowright'))dx++;if(dx||dy){const l=Math.hypot(dx,dy);dx/=l;dy/=l;const sp=state.player.speed*dt;const nx=state.player.x+dx*sp,ny=state.player.y+dy*sp;if(!blocked(nx,state.player.y))state.player.x=nx;if(!blocked(state.player.x,ny))state.player.y=ny;}state.camera.x+=(state.player.x-state.camera.x)*Math.min(1,dt*8);state.camera.y+=(state.player.y-state.camera.y)*Math.min(1,dt*8);clampCamera();areaEvents();}
function draw(){if(!state.scene)return;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#080c12';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.save();ctx.translate(canvas.width/2,canvas.height/2);ctx.scale(state.zoom,state.zoom);ctx.translate(-state.camera.x,-state.camera.y);if(state.grid){ctx.strokeStyle='#16232e';ctx.lineWidth=1/state.zoom;const step=32,x0=Math.floor((state.camera.x-canvas.width/state.zoom/2)/step)*step,y0=Math.floor((state.camera.y-canvas.height/state.zoom/2)/step)*step;for(let x=x0;x<state.camera.x+canvas.width/state.zoom/2;x+=step){ctx.beginPath();ctx.moveTo(x,state.camera.y-canvas.height/state.zoom/2);ctx.lineTo(x,state.camera.y+canvas.height/state.zoom/2);ctx.stroke();}for(let y=y0;y<state.camera.y+canvas.height/state.zoom/2;y+=step){ctx.beginPath();ctx.moveTo(state.camera.x-canvas.width/state.zoom/2,y);ctx.lineTo(state.camera.x+canvas.width/state.zoom/2,y);ctx.stroke();}}for(const o of state.scene?.nodes||[])drawNode(o);if(state.mode==='game'||state.playing){ctx.fillStyle='#e6a0a0';ctx.beginPath();ctx.arc(state.player.x,state.player.y,state.player.r,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff';ctx.stroke();}ctx.restore();if(state.mode==='debug'){ctx.fillStyle='#b9c8da';ctx.font='11px ui-monospace';ctx.fillText(`DEBUG nodes:${state.scene?.nodes.length||0} colliders:${colliders().length} entities:${state.runtime.entities.size} player:${Math.round(state.player.x)},${Math.round(state.player.y)} vel:${state.player.speed}`,14,24);}}
function drawNode(o){if(!o.visible)return;ctx.save();const wt=worldTransform(o);ctx.translate(wt.x,wt.y);ctx.rotate((wt.rotation||0)*Math.PI/180);ctx.scale(wt.sx??1,wt.sy??1);ctx.globalAlpha=o===state.selected?.85:1;let fill='#2d5b37';if(o.type==='River')fill='#286d99';else if(o.type==='StaticBody2D'||o.type.includes('Collision'))fill='#46515e';else if(o.type==='Marker2D')fill='#b08b36';else if(o.type==='Sprite2D'||o.type==='AnimatedSprite2D')fill='#5a4d83';else if(o.type==='Area2D')fill='#704b70';ctx.fillStyle=fill;ctx.strokeStyle=o===state.selected?'#69b5ff':'#496476';ctx.lineWidth=(o===state.selected?2:1)/state.zoom;ctx.fillRect(-o.w/2,-o.h/2,o.w,o.h);ctx.strokeRect(-o.w/2,-o.h/2,o.w,o.h);if(o.type==='TileMap'||o.type==='TileMapLayer'){const ts=Number(o.properties?.tileSize)||32;for(const [k,v] of Object.entries(tileCells(o))){if(!v)continue;const [cx,cy]=k.split(',').map(Number);ctx.fillStyle='#3f704d';ctx.fillRect(-o.w/2+cx*ts,-o.h/2+cy*ts,ts,ts);ctx.strokeStyle='#62856c';ctx.strokeRect(-o.w/2+cx*ts,-o.h/2+cy*ts,ts,ts);}}if(o.type==='AnimatedSprite2D'){const frames=Math.max(1,Number(o.properties?.frames)||4),dur=Math.max(.03,Number(o.properties?.frameDuration)||.14),f=Math.floor((state.runtime.animationTime||0)/dur)%frames;ctx.fillStyle=f%2?'#8064ad':'#a078c9';ctx.fillRect(-o.w/2+4,-o.h/2+4,o.w-8,o.h-8);ctx.fillStyle='#fff';ctx.font=`${Math.max(9,10/state.zoom)}px ui-monospace`;ctx.fillText(`${f+1}/${frames}`,-o.w/2+6,4);}if(o.type==='River'){ctx.strokeStyle='#7ac8ef';ctx.lineWidth=1.5/state.zoom;for(let y=-o.h/2+15;y<o.h/2;y+=18){ctx.beginPath();ctx.moveTo(-o.w/2+8,y);ctx.quadraticCurveTo(0,y-6,o.w/2-8,y);ctx.stroke();}}ctx.restore();}
function godotQuote(s){return JSON.stringify(String(s));}
function godotValue(v){if(v&&v.__type==='Vector2')return `Vector2(${v.x}, ${v.y})`;if(v&&v.__type==='Vector2i')return `Vector2i(${v.x}, ${v.y})`;if(v&&v.__type==='ExtResource')return `ExtResource("${v.id}")`;if(v&&v.__type==='SubResource')return `SubResource("${v.id}")`;if(typeof v==='string')return godotQuote(v);if(typeof v==='boolean'||typeof v==='number')return String(v);if(v===null)return 'null';return godotQuote(JSON.stringify(v));}
function sceneToTscn(){const root=rootForScene(state.scene);const nodes=[root,...state.scene.nodes];const idMap=new Map(nodes.map(n=>[n.id,n]));const namePath=n=>{if(!n||n===root)return '.';const p=n.parent?idMap.get(n.parent):root;return p===root?n.name:n.name;};let out='[gd_scene load_steps=1 format=3]\\n\\n';out+=`[node name=${godotQuote(root.name)} type=${godotQuote(root.type)}]\\n\\n`;for(const n of state.scene.nodes){const parent=n.parent&&idMap.has(n.parent)?(idMap.get(n.parent)===root?'.':idMap.get(n.parent).name):'.';out+=`[node name=${godotQuote(n.name)} type=${godotQuote(n.type)} parent=${godotQuote(parent)}]\\n`;if(n.x||n.y)out+=`position = Vector2(${n.x}, ${n.y})\\n`;if(n.rotation)out+=`rotation = ${n.rotation*Math.PI/180}\\n`;if(n.visible===false)out+='visible = false\\n';for(const [k,v] of Object.entries(n.properties||{})){if(['position','rotation','scale','visible'].includes(k))continue;out+=`${k} = ${godotValue(v)}\\n`;}out+='\\n';}return out.replace(/\\\\n/g,'\\n');}

function buildResourceModel(){
  state.projectModel.resources=[]; state.projectModel.scripts=[];
  for(const p of state.files){const e=ext(p);if(e==='.gd')state.projectModel.scripts.push({path:p,status:'partial',reason:'Script source preserved; execution stays in Godot runtime.'});
    if(['.tres','.res','.png','.jpg','.jpeg','.webp','.svg','.ogg','.wav','.mp3','.ttf','.woff','.woff2'].includes(e))state.projectModel.resources.push({path:p,type:e.slice(1),status:e==='.tres'||e==='.res'?'partial':'external'});}
}
function ninjaProjectText(){state.projectModel.project=clone(state.project);state.projectModel.scenes=state.projectModel.scenes.filter(s=>s.path!==state.scene.path);state.projectModel.scenes.push(clone(state.scene));buildResourceModel();return JSON.stringify(state.projectModel,null,2);}
function saveNinjaProject(){const blob=new Blob([ninjaProjectText()],{type:'application/json'});download(blob,'project.ninja.json');state.dirty=false;$('dirtyState').textContent='';log('Ninja project model saved.');}
async function exportProject(){try{const writer=new ZipWriter(new BlobWriter('application/zip'));const project=`; Generated by Ninja Engine\nconfig_version=5\n\n[application]\nconfig/name=${godotQuote(state.project.name||'Ninja Project')}\n\n[run]\nmain_scene=${godotQuote('res://'+(state.scene.name||'Main')+'.tscn')}\n\n[display]\nwindow/size/viewport_width=1100\nwindow/size/viewport_height=680\n`;await writer.add('project.godot',new BlobReader(new Blob([project])));await writer.add(`${state.scene.name||'Main'}.tscn`,new BlobReader(new Blob([sceneToTscn()])));await writer.add('ninja/project.ninja.json',new BlobReader(new Blob([ninjaProjectText()])));const blob=await writer.close();download(blob,'NinjaEngine_Godot_Project.zip');log('Godot 4 starter project + Ninja model exported.');}catch(e){log(`Export failed: ${e.message}`,'error');}}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function tick(now){const dt=Math.min(.05,(now-state.last)/1000);state.last=now;state.frame++;state.runtime.animationTime=(state.runtime.animationTime||0)+dt;updateRuntime(dt);if(state.frame%12===0){state.fps=Math.round(1/dt);$('fps').textContent=state.fps;const mem=performance.memory?.usedJSHeapSize;if(mem)$('memory').textContent=archiveSizeLabel(mem);if($('debugger'))$('debugger').innerHTML=state.playing?`<div><i>●</i> Runtime: running</div><div>Entities: ${state.runtime.entities.size}</div><div>Areas: ${state.runtime.areas.size}</div><div>Events: ${state.runtime.events.slice(0,8).map(escapeHtml).join('<br>')||'No area events.'}</div>`:'<div><i>●</i> Runtime stopped.</div>';}draw();requestAnimationFrame(tick);}
refreshConnections();
setScene({path:'',name:'Main',root:node('Node2D','Main',0,0,0,0,''),nodes:[]});state.scene.root.id='root';renderAll();draw();requestAnimationFrame(tick);
renderProjectManager();
