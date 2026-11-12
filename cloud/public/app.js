import {createClient} from "https://esm.sh/@supabase/supabase-js@2.95.3?bundle";
const cfg=window.TRUMMPLANER_CONFIG||{};
const db=createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
let inviteFlow=new URLSearchParams(location.hash.slice(1)).get("type")==="invite";
const state={user:null,companies:[],entries:[],view:"dashboard",search:"",filter:"all",isAdmin:false,invites:[],inviteLink:null,solutions:[],pushSubs:[]};
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=x=>x?new Date(x).toLocaleString("de-AT",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"–";
const inDate=x=>{if(!x)return "";const d=new Date(x),p=x=>String(x).padStart(2,"0");return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+"T"+p(d.getHours())+":"+p(d.getMinutes());};
const iso=x=>x?new Date(x).toISOString():null;
const company=id=>state.companies.find(c=>c.id===id)?.name||"Unbekannte Firma";
const active=()=>state.entries.filter(x=>x.kind==="task"&&x.status==="open");
const overdue=e=>e.kind==="task"&&e.status==="open"&&e.due_at&&Date.parse(e.due_at)<Date.now();
const today=e=>e.due_at&&new Date(e.due_at).toDateString()===new Date().toDateString();
let toastTimer,installPrompt;
function notice(msg){$("toast").textContent=msg;$("toast").classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("toast").classList.remove("show"),6000);}
function fail(e){console.error(e);notice("Fehler: "+(e?.message||String(e)));}
async function load(){
 if(!state.user)return;
 const [a,b,adminStatus,sol,pushDevices]=await Promise.all([
  db.from("tp_companies").select("*").order("name"),
  db.from("tp_entries").select("*").order("created_at",{ascending:false}),
  db.from("tp_app_admins").select("user_id").eq("user_id",state.user.id).maybeSingle(),
  db.from("tp_solutions").select("*").order("updated_at",{ascending:false}),
  db.from("tp_push_subscriptions").select("id,endpoint,device_name").eq("owner_id",state.user.id)
 ]);
 if(a.error)throw a.error;
 if(b.error)throw b.error;
 if(adminStatus.error)throw adminStatus.error;
 if(sol.error)throw sol.error;
 if(pushDevices.error)throw pushDevices.error;
 state.solutions=sol.data||[];
 state.pushSubs=pushDevices.data||[];
 state.companies=a.data||[];
 state.entries=b.data||[];
 state.isAdmin=!!adminStatus.data;
 if(state.isAdmin){
  const invites=await db.from("tp_invites").select("email,status,created_at").order("created_at",{ascending:false}).limit(40);
  if(invites.error)throw invites.error;
  state.invites=invites.data||[];
 }else state.invites=[];
 render();
}
function showApp(user){state.user=user||null;$("auth").classList.toggle("hidden",!!user);$("app").classList.toggle("hidden",!user);if(user){$("user-label").textContent=user.email||"";load().catch(fail);}else{state.companies=[];state.entries=[];state.isAdmin=false;state.invites=[];state.inviteLink=null;state.solutions=[];state.pushSubs=[];}}
async function login(){
 const emailField=$("login-email"),passwordField=$("login-password");
 if(!emailField.reportValidity()||!passwordField.reportValidity())return;
 $("login-submit").disabled=true;
 try{
  const {data,error}=await db.auth.signInWithPassword({email:emailField.value.trim(),password:passwordField.value});
  if(error)throw error;
  if(data.session?.user)showApp(data.session.user);
 }catch(e){fail(e)}
 finally{$("login-submit").disabled=false;}
}
$("auth-form").addEventListener("submit",e=>{e.preventDefault();login()});
$("signout").addEventListener("click",async()=>{try{const {error}=await db.auth.signOut();if(error)throw error;showApp(null);}catch(e){fail(e)}});
function nav(view){state.view=view;state.filter="all";state.search="";document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));render();}
document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>nav(b.dataset.view)));
function chip(value,extra){return '<span class="pill '+(extra||"")+'">'+esc(value)+"</span>";}
function row(e){let meta=chip(company(e.company_id),"gold")+chip(e.kind==="note"?"Notiz":"Aufgabe");
if(e.kind==="task")meta+=chip(e.status==="done"?"Erledigt":overdue(e)?"Überfällig":"Offen",e.status==="done"?"green":overdue(e)?"red":"");
if(e.priority==="high")meta+=chip("Dringend","red");
return '<article class="item"><div class="meta">'+meta+"</div><h3>"+esc(e.title)+"</h3>"+(e.description?"<p>"+esc(e.description)+"</p>":"")+'<div class="meta">'+(e.due_at?"<span>📅 Fällig: "+esc(fmt(e.due_at))+"</span>":"")+(e.remind_at?"<span>🔔 Erinnerung: "+esc(fmt(e.remind_at))+"</span>":"")+'</div><div class="actions"><button data-edit="'+e.id+'">Bearbeiten</button>'+(e.kind==="note"?'<button data-convert="'+e.id+'">Als Aufgabe</button>':'<button data-status="'+e.id+'">'+(e.status==="done"?"Wieder öffnen":"Erledigen")+"</button>")+'<button class="danger" data-delete="'+e.id+'">Löschen</button></div></article>';}
function list(items,empty){return items.length?items.map(row).join(""):'<div class="empty">'+esc(empty||"Keine Einträge vorhanden.")+"</div>";}
function metric(t,n,h){return '<div class="metric '+(h||"")+'"><strong>'+n+"</strong><span>"+esc(t)+"</span></div>";}
function dashboard(){const a=active(),next=[...a].sort((a,b)=>(a.due_at||"9999").localeCompare(b.due_at||"9999"));return '<div class="cards">'+metric("Offene Aufgaben",a.length)+metric("Heute fällig",a.filter(today).length,"highlight")+metric("Überfällig",a.filter(overdue).length)+metric("Firmen",state.companies.length)+'</div><div class="panel"><h2>Deine nächsten Aufgaben</h2>'+list(next.slice(0,10),"Alles erledigt! Erstelle deine erste Aufgabe.")+"</div>";}
function entries(kind){let data=state.entries.filter(e=>e.kind===kind);
data=data.filter(e=>(e.title+" "+e.description+" "+company(e.company_id)).toLowerCase().includes(state.search.toLowerCase()));
if(kind==="task"&&state.filter!=="all")data=data.filter(e=>state.filter==="overdue"?overdue(e):e.status===state.filter);
data.sort((a,b)=>(a.due_at||"9999").localeCompare(b.due_at||"9999"));
return '<div class="toolbar"><input id="search" placeholder="Titel, Firma oder Beschreibung suchen" value="'+esc(state.search)+'">'+(kind==="task"?'<select id="status-filter"><option value="all">Alle Status</option><option value="open">Offen</option><option value="done">Erledigt</option><option value="overdue">Überfällig</option></select>':"")+'<span class="counter">'+data.length+" Einträge</span></div>"+list(data);}
function solutionResults(){
 const term=state.search.toLowerCase().trim();
 const filtered=state.solutions.filter(s=>(s.problem_title+" "+s.problem_description+" "+s.solution_text+" "+s.company_name).toLowerCase().includes(term));
 return '<div class="panel"><h2>📖 Lösungsdatenbank</h2><p>Hier findest du dokumentierte Problemlösungen aus bereits erledigten Aufgaben.</p>'+
 '<input id="search" type="search" aria-label="Lösungen durchsuchen" placeholder="Problem, Fehlermeldung oder Lösungsbegriff suchen …" value="'+esc(state.search)+'">'+
 '<p class="counter" style="margin-top:10px">'+filtered.length+' Lösungen gefunden</p></div>'+
 (filtered.length?filtered.map(s=>'<article class="item"><div class="meta"><span class="pill gold">'+esc(s.company_name||"Ohne Firma")+'</span><span>'+esc(fmt(s.updated_at))+'</span></div>'+
 '<h3>'+esc(s.problem_title)+'</h3>'+
 (s.problem_description?'<p><strong>Problembeschreibung:</strong> '+esc(s.problem_description)+'</p>':'')+
 '<div style="border-left:3px solid #e2af48;padding:12px;background:#242630;border-radius:9px"><strong>✔ Lösung</strong><p style="margin:8px 0 0;white-space:pre-wrap">'+esc(s.solution_text)+'</p></div>'+
 '</article>').join(""):'<div class="empty">Noch keine passende Lösung gefunden. Erledige eine Aufgabe und dokumentiere ihre Lösung.</div>');
}
function openResolution(entry){
 if(!entry)return;
 $("solution-entry-id").value=entry.id;
 $("solution-problem-title").textContent=entry.title;
 $("solution-problem-description").textContent=entry.description||"";
 $("solution-text").value=state.solutions.find(s=>s.source_entry_id===entry.id)?.solution_text||"";
 $("solution-dialog").showModal();
 $("solution-text").focus();
}
function companies(){return '<div class="toolbar"><button id="new-company" class="primary">+ Firma anlegen</button><span class="counter">'+state.companies.length+' Firmen</span></div><div class="grid2">'+(state.companies.map(c=>'<article class="item"><h3 class="company-badge">'+esc(c.name)+'</h3><p class="muted">'+esc(c.contact||"")+(c.email?" · "+esc(c.email):"")+'</p><p>'+esc(c.phone||"")+'</p><span class="counter">'+state.entries.filter(e=>e.company_id===c.id&&e.kind==="task"&&e.status==="open").length+' offene Aufgaben</span><div class="actions"><button data-company-edit="'+c.id+'">Bearbeiten</button><button data-company-delete="'+c.id+'" class="danger">Löschen</button></div></article>').join("")||'<div class="empty">Noch keine Firma angelegt.</div>')+"</div>";}
function settings(){
 const own='<div class="panel"><h2>Dein Konto</h2><p class="muted">'+esc(state.user?.email||"")+
 '</p><p>Deine Firmen und Aufgaben sind durch Benutzerrechte geschützt. Neue Konten erhalten nur eingeladene Personen.</p></div>';
 const admin=state.isAdmin?
 '<div class="panel"><h2>Benutzer einladen</h2><p>Nur du als Administrator kannst weitere Personen freischalten. Sie erhalten einen Einladungslink per E-Mail und legen danach ihr eigenes Passwort fest.</p>'+
 '<form id="invite-form"><label>E-Mail-Adresse des neuen Benutzers<input type="email" id="invite-email" required autocomplete="off" placeholder="person@firma.at"></label><button class="primary" type="submit">Einladung senden</button></form>'+
 (state.inviteLink?'<div class="warning" style="margin-top:18px"><strong>Einladungslink erstellt</strong><p>Der SMTP-Versand ist für diese Adresse nicht verfügbar. Kopiere diesen vertraulichen Link und sende ihn ausschließlich an die eingeladene Person.</p><input type="text" id="invite-share-link" readonly value="'+esc(state.inviteLink)+'"><button type="button" class="subtle" id="copy-invite-link" style="margin-top:10px">Einladungslink kopieren</button></div>':'')+
 '<h3 style="margin-top:24px">Bisherige Einladungen</h3>'+
 (state.invites.length?state.invites.map(i=>'<p class="muted">'+esc(i.email)+' · '+esc(i.status==="sent"?"Gesendet":i.status==="pending"?"In Bearbeitung":"Fehlgeschlagen")+' · '+esc(fmt(i.created_at))+'</p>').join(""):'<p class="muted">Noch keine Einladungen</p>')+
 '</div>':"";
 const password='<div class="panel"><h2>Passwort festlegen oder ändern</h2><p>Nach der ersten Einladung hier dein Passwort erstellen. Das geht nur nach erfolgreicher Anmeldung über den Einladungslink.</p><form id="password-form"><label>Neues Passwort<input id="new-password" type="password" autocomplete="new-password" minlength="8" required></label><button class="subtle" type="submit">Passwort speichern</button></form></div>';
 const reminder='<div class="panel"><h2>Erinnerungen</h2><p>Hinweise funktionieren bei geöffneter App. Erinnerungen bei geschlossener PWA benötigen noch den Hintergrund-Push-Dienst.</p><div class="settings-actions"><button class="primary" id="enable-notifications">Benachrichtigungen erlauben</button><button class="subtle" id="test-notification">Testmeldung</button></div></div>';
 const install='<div class="panel"><h2>Als App installieren</h2><p>Auf iPhone: Safari → Teilen → Zum Home-Bildschirm. Auf Android: Chrome → App installieren.</p><button class="primary" id="install-app">App installieren</button><p class="install-tip">TrummPlaner Cloud – Zugang nur per Einladung</p></div>';
 const backup='<div class="panel"><h2>Datensicherung</h2><p>Firmen und Aufgaben als JSON sichern.</p><button class="subtle" id="export-json">Daten exportieren</button></div>';
 return own+admin+password+reminder+install+backup;
}
function render(){if(!state.user)return;const names={dashboard:"Übersicht",tasks:"Aufgaben",notes:"Notizen",solutions:"Lösungen",companies:"Firmen",settings:"Einstellungen"};
$("page-title").textContent=names[state.view];$("new-entry").style.display=["settings","solutions"].includes(state.view)?"none":"block";
$("content").innerHTML=state.view==="dashboard"?dashboard():state.view==="tasks"?entries("task"):state.view==="notes"?entries("note"):state.view==="solutions"?solutionResults():state.view==="companies"?companies():settings();
const search=$("search");if(search)search.addEventListener("input",e=>{state.search=e.target.value;const pos=e.target.selectionStart;render();const n=$("search");n?.focus();n?.setSelectionRange(pos,pos);});
const filter=$("status-filter");if(filter){filter.value=state.filter;filter.addEventListener("change",e=>{state.filter=e.target.value;render()})}}
function openCompany(c){$("company-id").value=c?.id||"";$("company-name").value=c?.name||"";$("company-contact").value=c?.contact||"";$("company-phone").value=c?.phone||"";$("company-email").value=c?.email||"";$("company-editor").showModal();}
function openEntry(e){if(!state.companies.length){nav("companies");notice("Bitte zuerst eine Firma anlegen.");return;}const x=e||{};$("entry-id").value=x.id||"";$("entry-kind").value=x.kind||"task";$("entry-title").value=x.title||"";$("entry-description").value=x.description||"";$("entry-company").innerHTML=state.companies.map(c=>'<option value="'+c.id+'">'+esc(c.name)+"</option>").join("");$("entry-company").value=x.company_id||state.companies[0].id;$("entry-priority").value=x.priority||"normal";$("entry-status").value=x.status||"open";$("entry-due").value=inDate(x.due_at);$("entry-remind").value=inDate(x.remind_at);$("entry-heading").textContent=x.id?"Eintrag bearbeiten":"Neuen Eintrag erstellen";$("editor").showModal();}
$("new-entry").addEventListener("click",()=>openEntry());
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>b.closest("dialog").close()));
$("content").addEventListener("click",async event=>{const b=event.target.closest("button");if(!b)return;try{
if(b.id==="new-company")return openCompany();
if(b.dataset.edit)return openEntry(state.entries.find(e=>e.id===b.dataset.edit));
if(b.dataset.convert)return openEntry({...state.entries.find(e=>e.id===b.dataset.convert),kind:"task"});
if(b.dataset.companyEdit)return openCompany(state.companies.find(c=>c.id===b.dataset.companyEdit));
if(b.dataset.companyDelete){const c=state.companies.find(x=>x.id===b.dataset.companyDelete);if(!confirm("Firma "+c.name+" und alle zugehörigen Aufgaben löschen?"))return;const {error}=await db.from("tp_companies").delete().eq("id",c.id);if(error)throw error;return await load();}
if(b.dataset.delete){if(!confirm("Diesen Eintrag endgültig löschen?"))return;const {error}=await db.from("tp_entries").delete().eq("id",b.dataset.delete);if(error)throw error;return await load();}
if(b.dataset.status){
 const x=state.entries.find(e=>e.id===b.dataset.status);
 if(!x)return;
 if(x.status!=="done")return openResolution(x);
 const {error}=await db.from("tp_entries").update({status:"open",updated_at:new Date().toISOString()}).eq("id",x.id);
 if(error)throw error;
 notice("Aufgabe wurde wieder geöffnet. Die Lösung bleibt in der Wissensdatenbank.");
 return await load();
}
if(b.id==="copy-invite-link"){
 if(!state.isAdmin||!state.inviteLink)return;
 await navigator.clipboard.writeText(state.inviteLink);
 notice("Einladungslink kopiert. Nur privat weitergeben.");
 return;
}
if(b.id==="enable-notifications"){if(!("Notification" in window))return notice("Browser unterstützt keine Benachrichtigungen.");return notice("Berechtigung: "+await Notification.requestPermission());}
if(b.id==="test-notification"){if(!("Notification" in window)||Notification.permission!=="granted")return notice("Bitte zuerst Benachrichtigungen erlauben.");await showNotification("TrummPlaner","Dies ist eine Testbenachrichtigung.");return notice("Testbenachrichtigung ausgelöst.");}
if(b.id==="install-app"){if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;}else notice("Im Browsermenü App installieren / Zum Home-Bildschirm wählen.");}
if(b.id==="export-json"){const json=JSON.stringify({exported_at:new Date().toISOString(),companies:state.companies,entries:state.entries},null,2),url=URL.createObjectURL(new Blob([json],{type:"application/json"})),a=document.createElement("a");a.href=url;a.download="trummplaner-backup-"+new Date().toISOString().slice(0,10)+".json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}catch(e){fail(e)}});
$("content").addEventListener("submit",async event=>{
 if(event.target.id==="invite-form"){
  event.preventDefault();
  if(!state.isAdmin)return notice("Keine Administratorberechtigung.");
  const email=$("invite-email").value.trim().toLowerCase(),btn=event.target.querySelector('button[type="submit"]');
  btn.disabled=true;
  try{
   const {data:{session}}=await db.auth.getSession();
   if(!session?.access_token)throw new Error("Bitte neu anmelden.");
   const res=await fetch(cfg.supabaseUrl+"/functions/v1/tp-invite-user",{
    method:"POST",
    headers:{"content-type":"application/json","apikey":cfg.supabasePublishableKey,"authorization":"Bearer "+session.access_token},
    body:JSON.stringify({email})
   });
   const body=await res.json().catch(()=>({error:"Ungültige Serverantwort"}));
   if(!res.ok)throw new Error(body.error||"Einladung fehlgeschlagen (HTTP "+res.status+")");
   state.inviteLink=body.delivery==="manual"&&typeof body.link==="string"?body.link:null;
   notice(state.inviteLink?"Einladungslink erstellt. Bitte unten kopieren und privat versenden.":"Einladung wurde an "+email+" versendet.");
   await load();
  }catch(err){fail(err)}
  finally{btn.disabled=false;}
 }
 if(event.target.id==="password-form"){
  event.preventDefault();
  const btn=event.target.querySelector('button[type="submit"]');
  btn.disabled=true;
  try{
   const pwd=$("new-password").value;
   if(pwd.length<8)throw new Error("Mindestens acht Zeichen verwenden.");
   const {error}=await db.auth.updateUser({password:pwd});
   if(error)throw error;
   $("new-password").value="";
   notice("Dein Passwort wurde gespeichert.");
  }catch(err){fail(err)}
  finally{btn.disabled=false;}
 }
});
$("solution-form").addEventListener("submit",async event=>{
 event.preventDefault();
 const entryId=$("solution-entry-id").value,solution=$("solution-text").value.trim();
 if(solution.length<3)return notice("Bitte mindestens drei Zeichen für die Lösung eingeben.");
 const submit=event.target.querySelector('button[type="submit"]');
 submit.disabled=true;
 try{
  const {error}=await db.rpc("tp_complete_task",{p_entry_id:entryId,p_solution:solution});
  if(error)throw error;
  $("solution-dialog").close();
  await load();
  notice("Aufgabe erledigt. Die Lösung wurde gespeichert und ist jetzt durchsuchbar.");
 }catch(err){fail(err)}
 finally{submit.disabled=false;}
});
$("company-form").addEventListener("submit",async event=>{event.preventDefault();const id=$("company-id").value,values={owner_id:state.user.id,name:$("company-name").value.trim(),contact:$("company-contact").value.trim(),phone:$("company-phone").value.trim(),email:$("company-email").value.trim()};try{const r=id?await db.from("tp_companies").update(values).eq("id",id):await db.from("tp_companies").insert(values);if(r.error)throw r.error;$("company-editor").close();await load();notice("Firma gespeichert.");}catch(e){fail(e)}});
$("entry-form").addEventListener("submit",async event=>{event.preventDefault();const id=$("entry-id").value,kind=$("entry-kind").value,values={owner_id:state.user.id,company_id:$("entry-company").value,title:$("entry-title").value.trim(),description:$("entry-description").value,priority:$("entry-priority").value,status:$("entry-status").value,kind,due_at:kind==="note"?null:iso($("entry-due").value),remind_at:kind==="note"?null:iso($("entry-remind").value),reminder_sent_at:null,updated_at:new Date().toISOString()};if(values.remind_at&&!values.due_at)return notice("Bitte einen Fälligkeitstermin auswählen.");try{const r=id?await db.from("tp_entries").update(values).eq("id",id):await db.from("tp_entries").insert(values);if(r.error)throw r.error;$("editor").close();await load();notice("Eintrag gespeichert.");}catch(e){fail(e)}});
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();installPrompt=e;});
window.addEventListener("appinstalled",()=>{installPrompt=null;notice("TrummPlaner installiert.");});
async function showNotification(title,body){const opts={body,icon:"./icons/icon-192.png"};if("serviceWorker" in navigator){const reg=await navigator.serviceWorker.ready;return reg.showNotification(title,opts)}return new Notification(title,opts);}
async function checkReminders(){if(!state.user||!("Notification" in window)||Notification.permission!=="granted")return;const key="trummplaner-notified-"+state.user.id,sent=JSON.parse(localStorage.getItem(key)||"[]");for(const e of active()){const mark=e.id+"|"+e.remind_at;if(e.remind_at&&Date.parse(e.remind_at)<=Date.now()&&!sent.includes(mark)){await showNotification("TrummPlaner: "+e.title,company(e.company_id)+" · Fällig: "+fmt(e.due_at));sent.push(mark);}}localStorage.setItem(key,JSON.stringify(sent.slice(-200)));}
setInterval(()=>checkReminders().catch(console.warn),30000);
setInterval(()=>{if(state.user&&!document.hidden&&navigator.onLine)load().catch(console.warn)},90000);
window.addEventListener("online",()=>state.user&&load().catch(console.warn));
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&state.user)load().catch(console.warn);});
db.auth.onAuthStateChange((event,session)=>{
 if(event==="SIGNED_OUT")showApp(null);
 else if(session?.user){
  if(!state.user||state.user.id!==session.user.id)showApp(session.user);
  if(inviteFlow){inviteFlow=false;nav("settings");notice("Einladung angenommen! Bitte in Einstellungen ein neues Passwort festlegen.");}
 }
});
db.auth.getUser().then(r=>showApp(r.data.user||null)).catch(fail);
if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(console.warn);
