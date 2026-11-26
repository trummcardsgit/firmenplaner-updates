import fs from 'node:fs';
import path from 'node:path';
const root='cloud/public';
const file=path.join(root,'sw.js');
const sw=fs.readFileSync(file,'utf8');
if(!sw.includes('CACHE_PREFIX="tp-cache:"+SCOPE.pathname')||!sw.includes('ownRequest(req.url)')||!sw.includes('ownRequest(client.url)'))throw Error('Missing scoped isolation');
const files=JSON.parse(sw.match(/const ASSETS=(\[.*?\]);/s)[1]);
for(const a of files)if(!fs.existsSync(path.join(root,a)))throw Error('Missing PWA asset '+a);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
if(manifest.name!=='RHTFLOW'||manifest.short_name!=='RHTFLOW')throw Error('Brand missing');
for(const icon of manifest.icons){const b=fs.readFileSync(path.join(root,icon.src));const [w,h]=icon.sizes.split('x').map(Number);if(b.readUInt32BE(16)!==w||b.readUInt32BE(20)!==h)throw Error('Icon dimensions '+icon.src);}
console.log('Verified '+files.length+' PWA resources; separate TEST scope');

const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
for(const view of ['tickets','admin']){
 if(!fs.existsSync('branding-source/branding/'+view+'.png'))throw Error('Missing original artwork '+view);
 const url='./icons/menu-'+view+'.webp';
 if(!files.includes(url)||!app.includes(url)||html.split('src="'+url+'"').length!==3)throw Error('Missing desktop/mobile/header or offline artwork for '+view);
}

const cfg=fs.readFileSync(path.join(root,'config.js'),'utf8');if(!cfg.includes('ilmwoapvcluoravpsrjv')||cfg.includes('cpycfxolqpidfjbhhsmr')||cfg.includes('hgdexyvtgfffcasfpjyu')||!cfg.includes('sb_publishable_'))throw Error('Production database mismatch');

if(manifest.id!=='./'||manifest.start_url!=='./'||manifest.scope!=='./')throw Error('Installed app identity changed');
for(const size of [16,24,32,48,64,128,192,256,512]){
 const icon=manifest.icons.find(i=>i.purpose==='any'&&i.sizes===size+'x'+size);
 if(!icon||!icon.src.includes('rhtflow-taskbar-v2-')||!files.includes(icon.src))throw Error('Missing fresh desktop icon '+size);
}
const ico=files.find(f=>/^\.\/icons\/rhtflow-taskbar-v2-[a-f0-9]+\.ico$/.test(f));
if(!ico||!html.includes('href="'+ico+'"'))throw Error('Missing Windows ICO fallback');
const icoBytes=fs.readFileSync(path.join(root,ico));if(icoBytes.readUInt16LE(0)!==0||icoBytes.readUInt16LE(2)!==1||icoBytes.readUInt16LE(4)<4)throw Error('Invalid Windows ICO');
console.log('Verified new Windows taskbar icon URLs, ICO sizes and unchanged application identity');
