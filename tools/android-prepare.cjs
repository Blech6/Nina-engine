const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const src=path.join(root,'src'), assets=path.join(root,'android/app/src/main/assets');
fs.rmSync(assets,{recursive:true,force:true}); fs.mkdirSync(assets,{recursive:true});
function copyTree(from,to){for(const e of fs.readdirSync(from,{withFileTypes:true})){const a=path.join(from,e.name),b=path.join(to,e.name); if(e.name==='app.js' || e.isFile()) fs.copyFileSync(a,b); else {fs.mkdirSync(b,{recursive:true});copyTree(a,b)}}}
copyTree(src,assets);
console.log('Android web assets prepared:', assets);
