'use strict';
// Launches FirmenPlaner, checks signed-in user's configured GitHub Releases,
// downloads + verifies updates, backs up the old program, and restarts server.
const fs=require('node:fs');
const path=require('node:path');
const {fork}=require('node:child_process');
const {validateRepo,compareVersions,latestRelease,fetchBytes,sha256,applyUpdate}=require('./update-core');
const ROOT=__dirname;
const DATA_DIR=path.resolve(process.env.DATA_DIR||path.join(ROOT,'data'));
const CONFIG=path.join(DATA_DIR,'update-settings.json');
fs.mkdirSync(DATA_DIR,{recursive:true});
let settings={repo:'trummcardsgit/firmenplaner-updates',autoOnStart:true};
if(fs.existsSync(CONFIG)) {
  try {const s=JSON.parse(fs.readFileSync(CONFIG,'utf8'));
    if(typeof s.repo==='string'&&s.repo) validateRepo(s.repo);
    settings={repo:s.repo||'trummcardsgit/firmenplaner-updates',autoOnStart:s.autoOnStart!==false};
  }catch(e){console.error('[Update] Einstellungen fehlerhaft:',e.message);}
}
const currentVersion=()=>JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8')).version;
let latest=null, checking=null, installing=false, serverChild=null, stopping=false, shuttingDown=false;
let status={phase:'idle',lastChecked:null,message:'Noch nicht geprüft'};
function saveSettings(){const temp=CONFIG+'.tmp';fs.writeFileSync(temp,JSON.stringify(settings,null,2)+'\n',{mode:0o600});fs.renameSync(temp,CONFIG);}
function publicStatus(){return {
  managed:true,version:currentVersion(),repo:settings.repo,autoOnStart:settings.autoOnStart,
  availableVersion:latest&&compareVersions(latest.version,currentVersion())>0?latest.version:null,
  phase:status.phase,message:status.message,lastChecked:status.lastChecked,
  busy:installing||Boolean(checking)
};}
async function checkUpdates(){
  if(checking){await checking;return publicStatus();}
  if(installing)throw new Error('Update wird gerade installiert');
  if(!settings.repo){latest=null;status={phase:'not-configured',lastChecked:null,message:'Bitte einmalig ein GitHub-Repository als Updatequelle eintragen.'};return publicStatus();}
  checking=(async()=>{
    status.phase='checking';status.message='Suche nach neuen Versionen ...';
    try{
      const release=await latestRelease(settings.repo);
      latest=release;status.lastChecked=new Date().toISOString();
      const newer=compareVersions(release.version,currentVersion())>0;
      status.phase=newer?'available':'current';
      status.message=newer?`Version ${release.version} ist verfügbar.`:'Du verwendest bereits die neueste Version.';
    }catch(err){latest=null;status.phase='error';status.message=err.message;status.lastChecked=new Date().toISOString();}
  })();
  try{await checking;}finally{checking=null;}
  return publicStatus();
}
async function stopServer(){
  if(!serverChild)return;
  const child=serverChild;stopping=true;
  await new Promise(resolve=>{
    if(child.exitCode!==null||child.signalCode!==null)return resolve();
    const timeout=setTimeout(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');},5000);
    child.once('exit',()=>{clearTimeout(timeout);resolve();});
    child.kill('SIGTERM');
  });
  serverChild=null;stopping=false;
}
function startServer(){
  if(serverChild)throw new Error('Server läuft bereits');
  return new Promise((resolve,reject)=>{
    const child=fork(path.join(ROOT,'server.js'),[],{cwd:ROOT,env:process.env,stdio:['inherit','inherit','inherit','ipc']});
    serverChild=child;let ready=false;
    const timeout=setTimeout(()=>{if(!ready){child.kill();reject(new Error('Server startet nicht (Zeitlimit)'));}},12000);
    child.on('message',msg=>{
      if(msg?.type==='server:ready'){if(!ready){ready=true;clearTimeout(timeout);resolve();}}
      else if(msg?.type==='update:request')void handleRequest(child,msg);
    });
    child.on('exit',(code,signal)=>{
      clearTimeout(timeout);
      if(serverChild===child)serverChild=null;
      if(!ready)reject(new Error(`Server konnte nicht starten (${code||signal||'unbekannt'}).`));
      if(ready&&!stopping&&!shuttingDown&&!installing){
        console.error('[FirmenPlaner] Server beendet; Neustart in 3 Sekunden.');
        setTimeout(()=>{if(!serverChild&&!shuttingDown&&!installing)void startServer().catch(e=>console.error(e));},3000);
      }
    });
  });
}
function answer(child,id,data,error){
  if(child.connected){try{child.send({type:'update:response',id,data,error:error?.message});}catch{}}
}
async function handleRequest(child,message){
  const {id,action,payload}=message;
  if(!id||typeof action!=='string')return;
  try{
    if(action==='status')return answer(child,id,publicStatus());
    if(action==='check'){const result=await checkUpdates();return answer(child,id,result);}
    if(action==='config'){
      if(installing)throw new Error('Während eines Updates nicht möglich');
      const repo=String(payload?.repo||'').trim();if(repo)validateRepo(repo);
      if(typeof payload?.autoOnStart!=='boolean')throw new Error('Ungültige Update-Einstellungen');
      settings={repo,autoOnStart:payload.autoOnStart};saveSettings();latest=null;
      status={phase:repo?'idle':'not-configured',lastChecked:null,message:repo?'Updatequelle gespeichert.':'Keine Updatequelle eingerichtet.'};
      answer(child,id,publicStatus());
      if(repo)void checkUpdates();return;
    }
    if(action==='install'){
      if(installing)throw new Error('Ein Update läuft bereits.');
      if(!latest||compareVersions(latest.version,currentVersion())<=0)throw new Error('Kein neues Update vorhanden. Bitte zuerst prüfen.');
      answer(child,id,{started:true,version:latest.version});
      setImmediate(()=>{void installUpdate().catch(err=>{
        console.error('[Update] Installation fehlgeschlagen:',err);
        status.phase='error';status.message='Update fehlgeschlagen: '+err.message;
      });});return;
    }
    throw new Error('Update-Aktion unbekannt');
  }catch(err){answer(child,id,null,err);}
}
async function installUpdate(){
  if(installing)throw new Error('Update läuft bereits');
  const release=latest;if(!release||compareVersions(release.version,currentVersion())<=0)return;
  installing=true;let backup=null;
  try{
    status.phase='downloading';status.message=`Lade Version ${release.version} sicher herunter ...`;
    const archive=await fetchBytes(release.zipUrl,20*1024*1024);
    if(sha256(archive)!==release.sha256)throw new Error('SHA-256-Prüfsumme stimmt nicht. Update verworfen.');
    status.phase='installing';status.message='Erstelle Sicherung und installiere das Update ...';
    await stopServer();
    backup=applyUpdate(ROOT,DATA_DIR,archive,release.version);
    await startServer();
    latest=null;status.phase='current';status.lastChecked=new Date().toISOString();
    status.message=`Version ${release.version} installiert. Daten wurden beibehalten.`;
    console.log('[Update] Installation erfolgreich. Sicherung:',backup.backup);
  }catch(err){
    if(backup){
      console.error('[Update] Neue Version konnte nicht gestartet werden. Rolle zurück ...');
      await stopServer();backup.restore();
      try{await startServer();}catch(restoreErr){console.error('[Update] Wiederhergestellter Server startet nicht:',restoreErr);}
    }else if(!serverChild&&!shuttingDown){
      try{await startServer();}catch(e){console.error('[Update] Server-Neustart fehlgeschlagen:',e);}
    }
    throw err;
  }finally{installing=false;}
}
async function start(){
  // On normal Windows launch, optionally install a new release BEFORE opening the UI.
  if(settings.repo&&settings.autoOnStart){
    await checkUpdates();
    if(latest&&compareVersions(latest.version,currentVersion())>0){
      try{await installUpdate();}catch(e){console.error('[Update] Auto-Update:',e.message);}
    }
  }
  if(!serverChild)await startServer();
  if(settings.repo&&!settings.autoOnStart)void checkUpdates();
  setInterval(()=>{if(settings.repo&&!installing)void checkUpdates();},6*60*60*1000).unref();
  console.log('[FirmenPlaner] Update-Manager aktiv. Version:',currentVersion());
}
process.on('SIGINT',()=>{shuttingDown=true;void stopServer().then(()=>process.exit(0));});
process.on('SIGTERM',()=>{shuttingDown=true;void stopServer().then(()=>process.exit(0));});
if(require.main===module){start().catch(e=>{console.error('[FirmenPlaner] Start fehlgeschlagen:',e);process.exitCode=1;});}
module.exports={publicStatus,checkUpdates};
