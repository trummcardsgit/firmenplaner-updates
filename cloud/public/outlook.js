// Outlook integration settings for TrummPlaner. No Microsoft credential is retained in the browser.
export function createOutlook({db,state,escapeHtml,notice,fail,refreshView,showSettings}){
 const API=(window.TRUMMPLANER_CONFIG?.supabaseUrl||"")+"/functions/v1/tp-outlook";
 const storedPrefix="tp-outlook-oauth-";
 let status={configured:false,connected:false,active:false};
 let folders=[];
 let fetching=false;
 const html=x=>escapeHtml(String(x??""));
 const $=id=>document.getElementById(id);
 async function invoke(action,payload={}){
  const {data,error}=await db.auth.getSession();
  if(error||!data.session?.access_token)throw new Error("Bitte zuerst bei TrummPlaner anmelden.");
  const res=await fetch(API,{
   method:"POST",
   headers:{"Content-Type":"application/json",
    "apikey":window.TRUMMPLANER_CONFIG.supabasePublishableKey,
    Authorization:"Bearer "+data.session.access_token},
   body:JSON.stringify({action,...payload})
  });
  const result=await res.json().catch(()=>({error:"Keine Antwort vom Outlook-Dienst."}));
  if(!res.ok)throw new Error(result.error||"Fehler beim Outlook-Dienst.");
  return result;
 }
 async function loadStatus(){
  if(!state.isAdmin){status={configured:false,connected:false,active:false};return status;}
  try{status=await invoke("status");}
  catch(error){status={...status,lastError:error.message||"Verbindung nicht erreichbar"};}
  return status;
 }
 function panel(){
  if(!state.isAdmin)return "";
  const configured=!!status.configured;
  const connected=!!status.connected;
  const active=!!status.active;
  let info="";
  if(active)info='<p class="tp-outlook-success"><strong>✓ Import aktiviert</strong> · '+html(status.email)+' · Ordner '+html(status.folder)+'</p>';
  else if(connected)info='<p class="tp-outlook-success">✓ Microsoft-Konto verbunden: '+html(status.email)+'</p>';
  else if(configured)info='<p class="tp-outlook-muted">Microsoft-App ist hinterlegt. Als Nächstes mit dem Outlook-Postfach anmelden.</p>';
  else info='<p class="tp-outlook-muted">Noch nicht eingerichtet. Dieser Import unterstützt Microsoft 365 / Exchange Online.</p>';
  const companies=state.companies.map(c=>
   '<option value="'+html(c.id)+'"'+(c.id===status.companyId?' selected':'')+'>'+html(c.name)+'</option>'
  ).join("");
  const selectFolder=connected?
   '<div class="tp-outlook-setup">'+
    '<h3>2. Unterordner und Zielfirma auswählen</h3>'+
    '<p>Nur E-Mails, die <strong>neu in diesen Unterordner gelangen</strong>, sollen Aufgaben werden. Vorhandene E-Mails werden beim ersten Abgleich grundsätzlich übersprungen.</p>'+
    '<button type="button" id="tp-outlook-folders" class="subtle">Outlook-Ordner laden</button>'+
    '<form id="tp-outlook-folder-form">'+
     '<label>Outlook-Ordner<select id="tp-outlook-folder" required>'+
       (folders.length?folders.map(f=>'<option value="'+html(f.id)+'"'+(f.id===status.folderId?' selected':'')+'>'+html(f.path)+'</option>').join(""):'<option value="">Bitte zuerst Ordner laden</option>')+
     '</select></label>'+
     '<label>Firma für neue Aufgaben<select id="tp-outlook-company" required><option value="">Firma auswählen</option>'+companies+'</select></label>'+
     '<button type="submit" class="primary"'+(!folders.length||!state.companies.length?' disabled':'')+'>Ordnerimport aktivieren</button>'+
    '</form></div>':"";
  const actions=connected?
   '<div class="tp-outlook-actions">'+
    (active?'<button type="button" class="subtle" id="tp-outlook-sync-now">Jetzt synchronisieren</button><button type="button" class="subtle" id="tp-outlook-pause">Import pausieren</button>':
      status.status==="paused"?'<button type="button" class="subtle" id="tp-outlook-resume">Import fortsetzen</button>':'')+
    '<button type="button" class="subtle danger" id="tp-outlook-disconnect">Postfach trennen</button></div>':"";
  const setup=!configured?
   '<details class="tp-outlook-details" open><summary>1. Microsoft-App registrieren und verbinden</summary>'+configForm()+'</details>':
   '<details class="tp-outlook-details"><summary>Microsoft-Appdaten ändern</summary>'+configForm()+'</details>';
  const last=status.lastSyncedAt?new Date(status.lastSyncedAt).toLocaleString("de-AT"):"Noch kein Abgleich";
  return '<div class="panel" id="tp-outlook-panel">'+
   '<h2>📨 Outlook-Unterordner → Aufgaben</h2>'+
   '<p>Übernimm neue E-Mails aus <strong>einem ausgewählten Outlook-Ordner</strong> automatisch als offene Aufgaben. Die Überprüfung erfolgt serverseitig alle fünf Minuten – auch wenn die PWA geschlossen ist.</p>'+
   info+
   (status.lastError?'<p class="warning">Letzter Fehler: '+html(status.lastError)+'</p>':'')+
   '<div class="tp-outlook-stats"><span>Importierte E-Mails: <strong>'+Number(status.imported||0)+'</strong></span><span>Letzter Abgleich: <strong>'+html(last)+'</strong></span>'+
    '<span>'+html(status.phase==="baseline"?"Einmalige Startprüfung":active?"Laufender Import":"Nicht aktiv")+'</span></div>'+
   setup+
   (configured&&!connected?'<div class="tp-outlook-actions"><button type="button" class="primary" id="tp-outlook-connect">Mit Microsoft anmelden</button></div>':'')+
   selectFolder+actions+
   '<p class="tp-outlook-muted">E-Mails werden in Outlook nicht gelöscht oder verschoben. In der Aufgabe stehen Betreff, Absender, Nachrichteninhalt und ein Link zur Originalmail. Dateianhänge bleiben vorerst im Outlook-Postfach.</p>'+
   '</div>';
 }
 function configForm(){
  return '<p class="tp-outlook-muted">Erstelle in Microsoft Entra eine App-Registrierung für ein Arbeits-/Schulkonto. Plattform: <strong>Web</strong>. Redirect-URI:</p>'+
   '<code class="tp-outlook-uri">https://trummcardsgit.github.io/firmenplaner-updates/</code>'+
   '<p class="tp-outlook-muted">Delegierte Microsoft Graph-Berechtigungen: <strong>Mail.Read</strong> und <strong>User.Read</strong>, zusätzlich <strong>offline_access</strong>. Dein Microsoft-365-Administrator muss gegebenenfalls zustimmen. Ein neues Client Secret erstellen und dessen <em>Wert</em> verwenden, nicht die Secret-ID.</p>'+
   '<form id="tp-outlook-config-form" autocomplete="off">'+
   '<label>Verzeichnis-ID (Tenant-ID)<input id="tp-outlook-tenant" type="text" required pattern="[0-9a-fA-F-]{36}" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autocapitalize="off"></label>'+
   '<label>Anwendungs-ID (Client-ID)<input id="tp-outlook-client" type="text" required pattern="[0-9a-fA-F-]{36}" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autocapitalize="off"></label>'+
   '<label>Client-Secret-Wert<input id="tp-outlook-secret" type="password" required minlength="12" autocomplete="off" placeholder="Geheimer Wert aus Microsoft Entra"></label>'+
   '<button type="submit" class="primary">Microsoft-App sicher hinterlegen</button>'+
   '</form>';
 }
 function bind(){
  const root=$("tp-outlook-panel");
  if(!root)return;
  const run=(selector,callback)=>root.querySelector(selector)?.addEventListener("click",async()=>{
   if(fetching)return;
   fetching=true;
   try{await callback();}
   catch(error){fail(error);}
   finally{fetching=false;}
  });
  root.querySelector("#tp-outlook-config-form")?.addEventListener("submit",async e=>{
   e.preventDefault();if(fetching)return;fetching=true;
   const form=e.currentTarget;
   const btn=form.querySelector('button[type="submit"]');btn.disabled=true;
   try{
    await invoke("configure",{
     tenantId:$("tp-outlook-tenant").value.trim(),
     clientId:$("tp-outlook-client").value.trim(),
     clientSecret:$("tp-outlook-secret").value
    });
    form.reset();
    folders=[];
    await loadStatus();refreshView();
    notice("Microsoft-App hinterlegt. Jetzt mit Microsoft anmelden.");
   }catch(error){fail(error)}
   finally{fetching=false;btn.disabled=false;}
  });
  run("#tp-outlook-connect",beginOAuth);
  run("#tp-outlook-folders",async()=>{
   const response=await invoke("folders");
   folders=response.folders||[];
   refreshView();
   notice(folders.length+" Outlook-Ordner geladen."+(response.truncated?" Weitere Unterordner wurden abgeschnitten.":""));
  });
  root.querySelector("#tp-outlook-folder-form")?.addEventListener("submit",async e=>{
   e.preventDefault();if(fetching)return;fetching=true;
   try{
    await invoke("selectFolder",{
     folderId:$("tp-outlook-folder").value,
     companyId:$("tp-outlook-company").value
    });
    await loadStatus();refreshView();
    notice("Outlook-Ordner gespeichert. Der automatische Import ist aktiviert.");
   }catch(error){fail(error)}
   finally{fetching=false;}
  });
  run("#tp-outlook-sync-now",async()=>{
   const data=await invoke("syncNow");
   await loadStatus();refreshView();
   notice(data.imported+" neue E-Mail-Aufgaben. "+(status.phase==="baseline"?"Erstmaliger Ordnerabgleich läuft.":"Import abgeschlossen."));
  });
  run("#tp-outlook-pause",async()=>{
   await invoke("pause");await loadStatus();refreshView();notice("Outlook-Import pausiert.");
  });
  run("#tp-outlook-resume",async()=>{
   await invoke("resume");await loadStatus();refreshView();notice("Outlook-Import fortgesetzt.");
  });
  run("#tp-outlook-disconnect",async()=>{
   if(!confirm("Outlook-Verbindung trennen? Bereits importierte Aufgaben bleiben bestehen."))return;
   await invoke("disconnect");folders=[];await loadStatus();refreshView();notice("Outlook-Verbindung getrennt.");
  });
 }
 function b64(array){
  return btoa(String.fromCharCode(...array)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
 }
 async function beginOAuth(){
  const verifier=b64(crypto.getRandomValues(new Uint8Array(48)));
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier)));
  const challenge=b64(digest);
  const stateValue=b64(crypto.getRandomValues(new Uint8Array(32)));
  sessionStorage.setItem(storedPrefix+"state",stateValue);
  sessionStorage.setItem(storedPrefix+"verifier",verifier);
  sessionStorage.setItem(storedPrefix+"user",state.user.id);
  const data=await invoke("authorize",{state:stateValue,challenge});
  location.assign(data.url);
 }
 async function finishRedirect(){
  const params=new URLSearchParams(window.location.search);
  const code=params.get("code");
  const stateValue=params.get("state");
  const error=params.get("error");
  if(!code&&!error)return false;
  if(!sessionStorage.getItem(storedPrefix+"state"))return false; // Not our callback.
  history.replaceState(null,"",location.pathname+location.hash);
  const expected=sessionStorage.getItem(storedPrefix+"state");
  const verifier=sessionStorage.getItem(storedPrefix+"verifier");
  const user=sessionStorage.getItem(storedPrefix+"user");
  for(const x of ["state","verifier","user"])sessionStorage.removeItem(storedPrefix+x);
  if(error){
   notice("Microsoft-Anmeldung abgebrochen: "+(params.get("error_description")||error).slice(0,180));
   showSettings();return true;
  }
  if(!stateValue||!expected||stateValue!==expected||!verifier||user!==state.user.id){
   notice("Outlook-Anmeldung aus Sicherheitsgründen verworfen. Bitte erneut verbinden.");
   showSettings();return true;
  }
  try{
   await invoke("exchange",{code,verifier});
   await loadStatus();
   try{folders=(await invoke("folders")).folders||[];}catch{}
   showSettings();
   notice("Microsoft 365 verbunden. Bitte Outlook-Unterordner und Firma auswählen.");
  }catch(err){fail(err);showSettings();}
  return true;
 }
 return {panel,bind,loadStatus,finishRedirect};
}
