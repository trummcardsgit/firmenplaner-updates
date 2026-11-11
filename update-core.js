'use strict';
// Dependency-free, restricted GitHub release updater for FirmenPlaner.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const PACKAGE_FILES = ['package.json', 'server.js', 'push.js', 'manager.js', 'update-core.js', 'start-windows.bat', 'start-linux.sh', 'README.md', 'Caddyfile.beispiel'];
const ALLOWED = name => PACKAGE_FILES.includes(name) || /^public\/[A-Za-z0-9_.\-/]+$/.test(name);
const repoPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
function validateRepo(repo) {
  if (typeof repo !== 'string' || !repoPattern.test(repo) || repo.includes('..')) throw new Error('Bitte GitHub-Repository als benutzer/repository angeben.');
  return repo;
}
function versionParts(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version || '');
  if (!match) throw new Error('Ungültige Versionsnummer: ' + version);
  return match.slice(1).map(Number);
}
function compareVersions(a, b) {
  const x = versionParts(a), y = versionParts(b);
  for (let i=0;i<3;i++) if (x[i] !== y[i]) return Math.sign(x[i] - y[i]);
  return 0;
}
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n=0;n<256;n++) { let c=n; for(let k=0;k<8;k++) c=(c&1)?0xedb88320^(c>>>1):(c>>>1);t[n]=c>>>0; }
  return t;
})();
function crc32(buf) { let c=0xffffffff; for(const b of buf)c=crcTable[(c^b)&255]^(c>>>8); return (c^0xffffffff)>>>0; }
function getFiles(root) {
  const files = PACKAGE_FILES.map(f => [f, fs.readFileSync(path.join(root, f))]);
  function recurse(dir) {
    for(const ent of fs.readdirSync(path.join(root,dir),{withFileTypes:true})) {
      const name = `${dir}/${ent.name}`;
      if(ent.isDirectory()) recurse(name);
      else if(ent.isFile()) files.push([name,fs.readFileSync(path.join(root,name))]);
      else throw new Error('Unsupported release file type: '+name);
    }
  }
  recurse('public');
  return files.sort(([a],[b])=>a.localeCompare(b));
}
function packZip(files) {
  if(files.length>200) throw new Error('Zu viele Dateien');
  const locals=[],centrals=[];
  let offset=0;
  for (const [name,contents] of files) {
    if(!ALLOWED(name)||name.includes('..')||name.startsWith('/')||name.includes('\\')) throw new Error('Datei nicht erlaubt: '+name);
    const filename=Buffer.from(name,'utf8'), b=Buffer.from(contents), crc=crc32(b);
    const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50,0);l.writeUInt16LE(20,4);l.writeUInt16LE(0x0800,6);
    l.writeUInt16LE(0x21,12);l.writeUInt32LE(crc,14);l.writeUInt32LE(b.length,18);l.writeUInt32LE(b.length,22);l.writeUInt16LE(filename.length,26);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x0800,8);
    c.writeUInt16LE(0x21,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(b.length,20);c.writeUInt32LE(b.length,24);c.writeUInt16LE(filename.length,28);c.writeUInt32LE(offset,42);
    locals.push(l,filename,b);centrals.push(c,filename);offset+=l.length+filename.length+b.length;
  }
  const central=Buffer.concat(centrals),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);
  end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,central,end]);
}
function unpackZip(zip) {
  if(zip.length>20*1024*1024) throw new Error('Update-Paket zu groß');
  const eocd=zip.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
  if(eocd<0||eocd+22>zip.length) throw new Error('ZIP-Datei fehlerhaft');
  const count=zip.readUInt16LE(eocd+10),centralSize=zip.readUInt32LE(eocd+12),centralOffset=zip.readUInt32LE(eocd+16);
  if(!count||count>200||centralOffset+centralSize>eocd) throw new Error('ZIP-Verzeichnis fehlerhaft');
  let position=centralOffset,total=0;const result=new Map();
  for(let i=0;i<count;i++) {
    if(position+46>zip.length||zip.readUInt32LE(position)!==0x02014b50) throw new Error('ZIP-Eintrag fehlerhaft');
    const flags=zip.readUInt16LE(position+8),method=zip.readUInt16LE(position+10);
    const crc=zip.readUInt32LE(position+16),comp=zip.readUInt32LE(position+20),plain=zip.readUInt32LE(position+24);
    const n=zip.readUInt16LE(position+28),extra=zip.readUInt16LE(position+30),comment=zip.readUInt16LE(position+32),loc=zip.readUInt32LE(position+42);
    if(position+46+n+extra+comment>zip.length) throw new Error('ZIP-Dateiname unvollständig');
    const name=zip.subarray(position+46,position+46+n).toString('utf8');
    if(!ALLOWED(name)||name.includes('..')||name.includes('\\')||name.startsWith('/')||result.has(name)) throw new Error('Unsicherer/unerlaubter ZIP-Pfad: '+name);
    if((flags&1)||![0,8].includes(method)||plain>10*1024*1024||comp>10*1024*1024||(total+=plain)>35*1024*1024) throw new Error('Nicht unterstützter ZIP-Eintrag');
    if(loc+30>zip.length||zip.readUInt32LE(loc)!==0x04034b50) throw new Error('ZIP-Kopf defekt');
    const localNameLen=zip.readUInt16LE(loc+26),localExtraLen=zip.readUInt16LE(loc+28);
    if(zip.subarray(loc+30,loc+30+localNameLen).toString('utf8')!==name) throw new Error('ZIP-Eintragsname stimmt nicht');
    const start=loc+30+localNameLen+localExtraLen;
    if(start+comp>centralOffset) throw new Error('ZIP-Daten abgeschnitten');
    const compressed=zip.subarray(start,start+comp);
    const buffer=method===0?Buffer.from(compressed):zlib.inflateRawSync(compressed,{maxOutputLength:10*1024*1024});
    if(buffer.length!==plain||crc32(buffer)!==crc) throw new Error('ZIP-Prüfsumme ungültig');
    result.set(name,buffer);position+=46+n+extra+comment;
  }
  if(position!==centralOffset+centralSize) throw new Error('ZIP-Verzeichnis hat unerwartete Daten');
  for(const file of ['server.js','push.js','manager.js','update-core.js','package.json','public/index.html','public/app.js','public/sw.js']) {
    if(!result.has(file))throw new Error('Update-Paket unvollständig: '+file);
  }
  return result;
}
function sha256(buffer){return crypto.createHash('sha256').update(buffer).digest('hex');}
async function fetchBytes(url,maxBytes,fetchFn=fetch) {
  if (!/^https:\/\//.test(url)) throw new Error('Updates erfordern eine sichere HTTPS-Adresse.');
  const res=await fetchFn(url,{headers:{'User-Agent':'FirmenPlaner-Updater','Accept':'application/vnd.github+json'},signal:AbortSignal.timeout(20000)});
  if(!res.ok) throw new Error('Update-Server meldet HTTP '+res.status);
  const len=Number(res.headers.get('content-length')||0);
  if(len>maxBytes)throw new Error('Download zu groß');
  const data=Buffer.from(await res.arrayBuffer());
  if(data.length>maxBytes)throw new Error('Download zu groß');
  return data;
}
async function latestRelease(repo,fetchFn=fetch) {
  repo=validateRepo(repo);
  const response=await fetchBytes(`https://api.github.com/repos/${repo}/releases/latest`,1024*1024,fetchFn);
  let release;try{release=JSON.parse(response.toString());}catch{throw new Error('Ungültige Antwort von GitHub');}
  const version=String(release.tag_name||'').replace(/^v/,'');versionParts(version);
  const zip=release.assets?.find(a=>a.name==='firmenplaner-update.zip');
  const manifestAsset=release.assets?.find(a=>a.name==='update.json');
  if(!zip||!manifestAsset)throw new Error('Release enthält nicht beide Update-Dateien (ZIP + update.json).');
  const prefix=`https://github.com/${repo}/releases/download/`;
  if(!zip.browser_download_url?.startsWith(prefix)||!manifestAsset.browser_download_url?.startsWith(prefix))throw new Error('Release-Adressen ungültig');
  const buf=await fetchBytes(manifestAsset.browser_download_url,1024*1024,fetchFn);
  let manifest;try{manifest=JSON.parse(buf.toString());}catch{throw new Error('Update-Manifest ungültig');}
  if(manifest.version!==version||!/^([a-f0-9]{64})$/.test(manifest.sha256)||manifest.archive!=='firmenplaner-update.zip')throw new Error('Update-Manifest passt nicht zur Release-Version');
  return {version,zipUrl:zip.browser_download_url,sha256:manifest.sha256,notes:String(release.name||'').slice(0,150)};
}
function applyUpdate(root,dataDir,zip,newVersion) {
  const files=unpackZip(zip), manifest=JSON.parse(files.get('package.json').toString('utf8'));
  if(manifest.version!==newVersion)throw new Error('ZIP-Versionsnummer stimmt nicht überein');
  const backup=path.join(dataDir,'update-backups',`${new Date().toISOString().replace(/[:.]/g,'-')}-${process.pid}`);
  fs.mkdirSync(backup,{recursive:true});
  const old=[];
  try {
    for(const [filename,buffer] of files) {
      const target=path.join(root,...filename.split('/'));
      if(fs.existsSync(target)) {
        const backupPath=path.join(backup,...filename.split('/'));
        fs.mkdirSync(path.dirname(backupPath),{recursive:true});fs.copyFileSync(target,backupPath);old.push([filename,true]);
      } else old.push([filename,false]);
    }
    const dbPath=path.join(dataDir,'firmenplaner.json');
    if(fs.existsSync(dbPath))fs.copyFileSync(dbPath,path.join(backup,'firmenplaner.json.backup'));
    for(const [filename,buffer] of files) {
      const target=path.join(root,...filename.split('/'));
      fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.writeFileSync(`${target}.new`,buffer);fs.renameSync(`${target}.new`,target);
    }
  } catch(error) { restore(); throw error; }
  function restore(){
    for(const [filename,existed] of old) {
      const dst=path.join(root,...filename.split('/'));
      if(existed)fs.copyFileSync(path.join(backup,...filename.split('/')),dst);
      else fs.rmSync(dst,{force:true});
      fs.rmSync(`${dst}.new`,{force:true});
    }
  }
  return {backup,restore};
}
module.exports={validateRepo,compareVersions,packZip,unpackZip,getFiles,sha256,latestRelease,fetchBytes,applyUpdate};
