import {memberLabel} from "./profile-avatar.js";
import {applyTicketOrder,normalizeTicketOrder,ticketMenuItems} from "./menu-preferences.js";
import {defaultTicketFilters,normalizeTicketFilters,readTicketFilters} from "./ticket-filter-preferences.js";
import {attachmentAccept,validateAttachments,uploadAttachments,canAttach} from "./ticket-attachments.js";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const priorities={low:"Niedrig",normal:"Normal",high:"Hoch",urgent:"Dringend"},statuses={open:"Offen",accepted:"In Bearbeitung",rejected:"Abgelehnt",closed:"Erledigt"};
export function filterTickets(tickets,candidates,uid,tab,firm="",status="",search=""){
 const pending=new Set(candidates.filter(c=>c.user_id===uid&&c.response==="pending").map(c=>String(c.ticket_id)));
 return tickets.filter(t=>(tab==="all"||tab==="my"&&t.assignee_id===uid||tab==="open"&&t.status==="open"&&pending.has(String(t.id)))&&(!firm||String(t.company_id)===firm)&&(!status||t.status===status)&&(!search||(t.title+" "+t.description+" "+t.id).toLowerCase().includes(search.toLowerCase())));
}
// Navigation counters represent outstanding work, not the historical list.
export function countActiveTickets(tickets,candidates,uid,category){
 return filterTickets(tickets,candidates,uid,category).filter(t=>t.status==="open"||t.status==="accepted").length;
}
export const ticketCategories=[["all","All Tickets"],["open","Open Tickets"],["my","My Tickets"]];
export function createTicketCenter({db,userId,isAdmin,notice,fail,refreshApp,ticketOrder=()=>[],customizeOrder=()=>{}}){
 let data=null,tab="all",firm="",status="open",search="",busy=false,epoch=0,focusId="",polling=false,menuVisible=false;
 let preferences=new Map(),prefsReady=false,prefsSaving=false,prefsGeneration=0,restorePending=true;
 const pageSize=500;
 function currentFilters(){return normalizeTicketFilters({company_filter:firm,status_filter:status,search_filter:search},data?.companies||[]);}
 function restoreFilters(){const p=normalizeTicketFilters(preferences.get(tab)||defaultTicketFilters(),data?.companies||[]);firm=p.company_filter;status=p.status_filter;search=p.search_filter;focusId="";}
 async function saveFilters(reset=false){
  if(prefsSaving||!prefsReady||!uid())return;
  const u=uid(),category=tab,generation=prefsGeneration;
  const p=reset?defaultTicketFilters():currentFilters();
  prefsSaving=true;draw();
  try{
   const q=db.from("tp_ticket_filter_preferences");
   const r=reset?await q.delete().eq("owner_id",u).eq("category",category).select("category"):await q.upsert({owner_id:u,category,...p},{onConflict:"owner_id,category"}).select("category").single();
   if(r.error||(!reset&&r.data?.category!==category))throw r.error||new Error("Speicherung nicht bestätigt");
   if(uid()!==u||generation!==prefsGeneration)return;
   if(reset){preferences.delete(category);if(tab===category)restoreFilters();}
   else preferences.set(category,p);
   notice(reset?"Standardfilter wiederhergestellt.":"Filter für "+ticketCategories.find(([k])=>k===category)[1]+" gespeichert.");
  }catch(e){if(uid()===u&&generation===prefsGeneration)fail(e);}
  finally{if(uid()===u&&generation===prefsGeneration){prefsSaving=false;draw();}}
 }
 const root=()=>document.getElementById("tp-ticket-root");
 const uid=()=>userId();
 const name=id=>data?.members.find(m=>m.user_id===id)?.display_name||"Unbekannt";
 const person=id=>memberLabel(id,name(id));
 const company=id=>data?.companies.find(c=>String(c.id)===String(id))?.name||"Unbekannt";
 const date=s=>s?new Date(s).toLocaleString("de-AT"):"";
 const options=(o,val)=>Object.entries(o).map(([k,v])=>'<option value="'+esc(k)+'"'+(String(val)===k?" selected":"")+'>'+esc(v)+'</option>').join("");
 const memberOptions=()=>data.members.filter(m=>m.active).map(m=>'<label class="tp-ticket-check"><input type="checkbox" name="candidate" value="'+esc(m.user_id)+'"> '+memberLabel(m.user_id,m.display_name)+'</label>').join("");
 function count(category){return data?countActiveTickets(data.tickets,data.candidates,uid(),category):null}
 function syncMenu(){
  applyTicketOrder(document,ticketOrder());
  document.querySelectorAll("[data-ticket-category]").forEach(button=>{
   const key=button.dataset.ticketCategory;
   button.setAttribute("aria-pressed",String(tab===key));
   button.classList.toggle("active",tab===key);
   const n=button.querySelector(".tp-ticket-subnav-count");
   if(n)n.textContent=String(count(key)??"–");
  });
 }
 function setMenuVisible(visible){
  if(visible&&!menuVisible){restoreFilters();restorePending=true;}
  menuVisible=visible;
  const menu=document.getElementById("tp-ticket-subnav");
  if(menu)menu.hidden=!visible;
  document.querySelector('#nav [data-view="tickets"]')?.setAttribute("aria-expanded",String(visible));
  syncMenu();
 }
 function selectCategory(key){
  if(!ticketCategories.some(([id])=>id===key)||!root()||busy||prefsSaving)return;
  tab=key;restoreFilters();restorePending=!prefsReady;draw();syncMenu();
 }
 document.getElementById("tp-ticket-subnav")?.addEventListener("click",e=>{
  const button=e.target.closest("[data-ticket-category]");
  if(button)selectCategory(button.dataset.ticketCategory);
 });
 function reset(){epoch++;prefsGeneration++;preferences=new Map();prefsReady=false;prefsSaving=false;restorePending=true;focusId="";data=null;tab="all";firm="";status="open";search="";busy=false;setMenuVisible(false)}
 async function read(background=false){
  const u=uid(),token=++epoch;if(!u)return;const filterRevision=prefsGeneration;
  const names=["tp_tickets","tp_ticket_candidates","tp_members","tp_companies","tp_ticket_events","tp_ticket_notifications","tp_ticket_task_links"];
  const keys=["tickets","candidates","members","companies","events","notifications","taskLinks"];
  const results=await Promise.all(names.map(async n=>{
   const all=[];let offset=0;
   for(;;){
    let q=db.from(n).select("*");
    if(n==="tp_ticket_notifications")q=q.eq("recipient_id",u);
    if(n==="tp_ticket_candidates")q=q.order("ticket_id").order("user_id");
    else if(n==="tp_ticket_task_links")q=q.order("ticket_id");
    else if(n==="tp_members")q=q.order("user_id");
    else if(n==="tp_companies")q=q.order("name").order("id");
    else q=q.order("id",{ascending:false});
    const r=await q.range(offset,offset+pageSize-1);
    if(r.error)throw r.error;
    if(token!==epoch||uid()!==u)return [];
    all.push(...(r.data||[]));
    if((r.data||[]).length<pageSize)break;
    offset+=pageSize;
   }
   return all;
  }));
  if(token!==epoch||uid()!==u)return;
  const next=Object.fromEntries(results.map((r,i)=>[keys[i],r]));
  if(!background&&(!prefsReady||restorePending)&&!prefsSaving){
   try{
    const p=await db.from("tp_ticket_filter_preferences").select("category,company_filter,status_filter,search_filter").eq("owner_id",u).range(0,2);
    if(token!==epoch||uid()!==u)return;
    if(filterRevision!==prefsGeneration||prefsSaving)return;
    if(p.error)throw p.error;
    preferences=readTicketFilters(p.data,next.companies);prefsReady=true;
   }catch(e){if(token!==epoch||uid()!==u)return;prefsReady=false;console.warn("Ticketfilter konnten nicht geladen werden",e);}
  }
  const changed=JSON.stringify(data)!==JSON.stringify(next);
  if(background&&(busy||root()?.querySelector('dialog[open]')||root()?.contains(document.activeElement)&&document.activeElement?.matches('input,textarea,select,summary')))return;
  data=next;if(restorePending){restoreFilters();restorePending=!prefsReady;}syncMenu();
  if(!background||changed){
   if(background&&(busy||root()?.querySelector("dialog[open]")||root()?.contains(document.activeElement)&&document.activeElement?.matches("input,textarea,select,summary")))return;
   const expanded=[...root()?.querySelectorAll("article details[open]")||[]].map(d=>d.closest("article")?.dataset.ticketId);
   draw();
   root()?.querySelectorAll("article details").forEach(d=>{if(expanded.includes(d.closest("article")?.dataset.ticketId))d.open=true});
  }
 }
 function page(){return '<section id="tp-ticket-root" class="tp-ticket-center"><p>Tickets werden geladen …</p></section>'}
 function error(e){if(root())root().innerHTML='<div class="tp-ticket-panel"><p>Ticket-Center nicht verfügbar. Die Enterprise-Datenbank muss eingerichtet sein.</p><button type="button" id="tp-ticket-retry">Erneut laden</button></div>';document.getElementById("tp-ticket-retry")?.addEventListener("click",()=>open());fail(e)}
 function open(id=""){if(id){restorePending=false;focusId=String(id);tab="all";firm="";status="";search=""}syncMenu();if(data)draw();return read().catch(error)}
 function draw(){
  const el=root();if(!el||!data)return;
  const list=filterTickets(data.tickets,data.candidates,uid(),tab,firm,status,search);
  const categoryLabel=ticketCategories.find(([key])=>key===tab)?.[1]||"All Tickets";
  el.innerHTML='<div class="tp-ticket-panel"><div class="tp-ticket-head"><div><small>RHTFLOW · ENTERPRISE</small><h2>'+esc(categoryLabel)+'</h2></div><button type="button" class="primary" data-tp-action="create">+ Neues Ticket</button></div><div class="tp-ticket-mobile-subnav" role="group" aria-label="Ticket-Kategorien">'+normalizeTicketOrder(ticketOrder()).map(k=>[k,ticketMenuItems[k]]).map(([k,n])=>'<button type="button" class="tp-ticket-subnav-button" data-ticket-category="'+k+'" aria-pressed="'+(tab===k)+'"><span>'+n+'</span><span class="tp-ticket-subnav-count">'+count(k)+'</span></button>').join("")+'</div><div class="tp-ticket-filters"><select id="tp-ticket-firm" aria-label="Firma">'+options({"":"Alle Firmen",...Object.fromEntries(data.companies.map(c=>[c.id,c.name]))},firm)+'</select><select id="tp-ticket-status" aria-label="Status">'+options({"":"Alle Status",...statuses},status)+'</select><input id="tp-ticket-search" placeholder="Tickets suchen" maxlength="200" value="'+esc(search)+'"><button type="button" data-tp-action="customize-order">☷ Reihenfolge anpassen</button><button type="button" data-tp-action="refresh">Aktualisieren</button><button type="button" data-tp-action="save-filter" '+(!prefsReady||prefsSaving?'disabled':'')+'>Filter speichern</button><button type="button" data-tp-action="reset-filter" '+(!prefsReady||prefsSaving?'disabled':'')+'>Standardfilter</button></div><small class="tp-filter-state" role="status">'+(!prefsReady?'Gespeicherte Filter konnten noch nicht geladen werden. Bitte aktualisieren.':prefsSaving?'Filter werden gespeichert …':JSON.stringify(currentFilters())===JSON.stringify(preferences.get(tab))?'Persönlicher Filter gespeichert':preferences.has(tab)?'Filter geändert · zum Übernehmen speichern':'Noch kein persönlicher Filter gespeichert')+'</small></div>'+
  (data.notifications.length?'<details class="tp-ticket-panel"><summary>Benachrichtigungen ('+data.notifications.filter(n=>!n.read_at).length+' ungelesen)</summary><button type="button" data-tp-action="read-notifications">Alle als gelesen markieren</button>'+data.notifications.slice(0,20).map(n=>'<p>'+esc(n.message)+' <small>'+esc(date(n.created_at))+'</small></p>').join("")+'</details>':'')+
  '<div class="tp-ticket-list">'+(list.map(t=>{
   const cs=data.candidates.filter(c=>String(c.ticket_id)===String(t.id));
   const can=t.status==="open"&&cs.some(c=>c.user_id===uid()&&c.response==="pending");
   const finish=t.status==="accepted"&&(t.assignee_id===uid()||isAdmin());
   const imported=data.taskLinks?.some(l=>String(l.ticket_id)===String(t.id));
   const comment=t.creator_id===uid()||t.assignee_id===uid()||can||isAdmin();
   const events=data.events.filter(e=>String(e.ticket_id)===String(t.id));
   return '<article data-ticket-id="'+esc(t.id)+'" class="tp-ticket-panel tp-ticket-card '+esc(t.priority)+'"><div class="tp-ticket-head"><small>#'+esc(t.id)+' · '+esc(company(t.company_id))+'</small><span class="tp-ticket-priority">'+esc(priorities[t.priority]||t.priority)+'</span></div><h3>'+esc(t.title)+'</h3><p class="tp-ticket-description">'+esc(t.description)+'</p><div class="tp-ticket-meta"><b>'+esc(statuses[t.status]||t.status)+'</b><span>Erstellt von: '+person(t.creator_id)+'</span><span>'+esc(date(t.created_at))+'</span>'+(t.assignee_id?'<span>Bearbeiter: '+person(t.assignee_id)+'</span>':'')+'</div><details><summary>Zuweisungen und Verlauf</summary>'+cs.map(c=>'<p>'+person(c.user_id)+' · '+esc(({pending:"Wartet",accepted:"Angenommen",declined:"Abgelehnt",withdrawn:"Anderweitig vergeben"})[c.response]||c.response)+'</p>').join("")+events.map(e=>'<div class="tp-ticket-event"><small>'+esc(date(e.created_at))+' · '+(e.actor_id?person(e.actor_id):"System")+' · '+esc(({created:"Erstellt",accepted:"Angenommen",declined:"Abgelehnt",closed:"Abgeschlossen",comment:"Kommentar",five_day_reminder:"5-Tage-Erinnerung"})[e.kind]||e.kind)+'</small><p>'+esc(e.message)+'</p></div>').join("")+'</details>'+(t.resolution?'<div class="tp-ticket-resolution"><b>Lösung</b><p>'+esc(t.resolution)+'</p></div>':'')+'<div class="tp-ticket-actions">'+(can?'<button type="button" data-tp-action="accept" data-id="'+esc(t.id)+'">✓ Annehmen</button><button type="button" data-tp-action="decline" data-id="'+esc(t.id)+'">× Ablehnen</button>':'')+(finish?'<button type="button" data-tp-action="close" data-id="'+esc(t.id)+'">Ticket abschließen</button>':'')+(t.status==="accepted"&&t.assignee_id===uid()?'<button type="button" data-tp-action="task" data-id="'+esc(t.id)+'" '+(imported?'disabled':'')+'>'+(imported?'Als Aufgabe übernommen':'Als Aufgabe übernehmen')+'</button>':'')+(t.status==="closed"&&(t.assignee_id===uid()||isAdmin())?'<button type="button" data-tp-action="publish" data-id="'+esc(t.id)+'">Lösung veröffentlichen</button>':'')+(comment?'<button type="button" data-tp-action="comment" data-id="'+esc(t.id)+'">Kommentar</button>':'')+((t.status!=="closed"&&(t.creator_id===uid()||t.assignee_id===uid()||isAdmin()))?'<button type="button" data-tp-action="reassign" data-id="'+esc(t.id)+'">Weiterleiten</button>':'')+'<button type="button" data-tp-action="files" data-id="'+esc(t.id)+'">📎 Anhänge</button>'+'</div></article>';
  }).join("")||'<p class="tp-ticket-panel">Keine Tickets in dieser Ansicht.</p>')+'</div><dialog id="tp-ticket-dialog" class="tp-ticket-dialog"></dialog>';
  if(focusId){const match=[...el.querySelectorAll("[data-ticket-id]")].find(x=>x.dataset.ticketId===focusId);if(match){match.scrollIntoView({block:"center"});focusId=""}}
  el.querySelectorAll("[data-ticket-category]").forEach(b=>b.onclick=()=>selectCategory(b.dataset.ticketCategory));
  syncMenu();
  el.querySelector("#tp-ticket-firm").onchange=e=>{firm=e.target.value;draw()};
  el.querySelector("#tp-ticket-status").onchange=e=>{status=e.target.value;draw()};
  el.querySelector("#tp-ticket-search").oninput=e=>{search=e.target.value;const p=e.target.selectionStart;draw();const input=root()?.querySelector("#tp-ticket-search");input?.focus();input?.setSelectionRange(p,p)};
  el.querySelectorAll("[data-tp-action]").forEach(b=>b.onclick=()=>action(b.dataset.tpAction,b.dataset.id,b));
 }
 async function call(fn,args,button){
  if(busy)return;busy=true;const u=uid();if(button)button.disabled=true;
  try{const r=await db.rpc(fn,args);if(r.error)throw r.error;if(uid()!==u)return;document.getElementById("tp-ticket-dialog")?.close();notice("Ticket aktualisiert.");if(["tp_import_ticket_task","tp_close_ticket","tp_publish_ticket_solution","tp_reassign_ticket"].includes(fn)&&refreshApp){await refreshApp();if(uid()===u&&root())await read()}else await read()}
  catch(e){if(uid()===u){fail(e);if(fn==="tp_respond_ticket")await read().catch(error)}}
  finally{if(uid()===u){busy=false;if(button)button.disabled=false}}
 }
 function dialog(title,body,submit){
  const d=document.getElementById("tp-ticket-dialog");if(!d)return;
  d.innerHTML='<form id="tp-ticket-local-form"><h2>'+esc(title)+'</h2>'+body+'<div class="tp-ticket-actions"><button type="button" id="tp-ticket-cancel">Abbrechen</button><button type="submit" class="primary">Speichern</button></div></form>';
  d.querySelector("#tp-ticket-cancel").onclick=()=>d.close();
  d.querySelector("form").onsubmit=e=>{e.preventDefault();e.stopPropagation();submit(new FormData(e.currentTarget),e.currentTarget.querySelector('[type="submit"]'))};
  d.showModal();
 }
 const attachmentPicker='<label>Dateien anhängen (optional)<input name="attachments" type="file" multiple accept="'+attachmentAccept+'"><small>PDF, Bilder, Word, Excel, PowerPoint, CSV und Text · maximal 10 MB pro Datei</small></label>';
 async function createWithAttachments(f,btn){
  if(busy)return;
  const users=f.getAll("candidate"),files=f.getAll("attachments").filter(file=>file.name);
  if(!users.length){notice("Bitte mindestens einen Mitarbeiter auswählen.");return}
  try{validateAttachments(files)}catch(e){fail(e);return}
  const u=uid();if(!u)return;
  busy=true;btn.disabled=true;
  const d=document.getElementById("tp-ticket-dialog"),cancel=d?.querySelector("#tp-ticket-cancel");
  if(cancel)cancel.disabled=true;
  const preventClose=e=>e.preventDefault();d?.addEventListener("cancel",preventClose);
  let createdId=null;
  try{
   const r=await db.rpc("tp_create_ticket",{p_company:f.get("company"),p_title:f.get("title"),p_description:f.get("description"),p_priority:f.get("priority"),p_users:users});
   if(r.error)throw r.error;
   createdId=r.data;
   if(uid()!==u)return;
   if(createdId===null||createdId===undefined)throw new Error("Ticket-ID fehlt.");
   const result=files.length?await uploadAttachments(db.storage.from("tp-ticket-attachments"),createdId,u,files,()=>uid()===u):{uploaded:[],failed:[]};
   if(uid()!==u)return;
   d?.close();
   notice(result.failed.length?"Ticket #"+createdId+" erstellt. "+result.failed.length+" Anhang/Anhänge fehlgeschlagen. Bitte im Ticket erneut hinzufügen.":"Ticket erstellt"+(files.length?" · "+result.uploaded.length+" Anhänge gespeichert.":"."));
   await read();
   if(result.failed.length&&uid()===u&&root())await showFiles(createdId,result.failed.map(x=>x.file.name+": "+x.error));
  }catch(e){
   if(uid()===u){
    if(createdId!==null){d?.close();notice("Ticket #"+createdId+" wurde erstellt. Anhänge bitte im Ticket prüfen.");}
    else fail(e);
   }
  }finally{d?.removeEventListener("cancel",preventClose);if(uid()===u){busy=false;btn.disabled=false;if(cancel)cancel.disabled=false;}}
 }
 function action(a,id,b){
  if(a==="customize-order"){customizeOrder();return}
  if(a==="save-filter"){return saveFilters()}
  if(a==="reset-filter"){return saveFilters(true)}
  if(a==="refresh"){open();return}
  if(a==="read-notifications"){call("tp_read_ticket_notifications",{},b);return}
  if(a==="task"){call("tp_import_ticket_task",{p_ticket:id},b);return}
  if(a==="publish"){call("tp_publish_ticket_solution",{p_ticket:id},b);return}
  if(a==="reassign"){dialog("Ticket weiterleiten",'<fieldset><legend>Neue zuständige Mitarbeiter</legend>'+memberOptions()+'</fieldset>',(f,btn)=>{const users=f.getAll("candidate");if(!users.length){notice("Bitte Mitarbeiter auswählen.");return}call("tp_reassign_ticket",{p_ticket:id,p_users:users},btn)});return}
  if(a==="files"){showFiles(id).catch(fail);return}
  if(a==="accept"||a==="decline"){call("tp_respond_ticket",{p_ticket:id,p_accept:a==="accept"},b);return}
  if(a==="create"){
   if(!data.companies.length||!data.members.some(m=>m.active)){notice("Zuerst müssen Firmen und Mitarbeiter eingerichtet werden.");return}
   dialog("Neues Ticket",'<label>Titel<input name="title" required maxlength="200"></label><label>Firma<select name="company" required>'+options(Object.fromEntries(data.companies.map(c=>[c.id,c.name])),"")+'</select></label><label>Priorität<select name="priority">'+options(priorities,"normal")+'</select></label><label>Problembeschreibung<textarea name="description" required maxlength="20000" rows="5"></textarea></label><fieldset><legend>Zuständige Mitarbeiter</legend>'+memberOptions()+'</fieldset>'+attachmentPicker,createWithAttachments);
  }else if(a==="close"||a==="comment"){
   dialog(a==="close"?"Ticket abschließen":"Kommentar hinzufügen",'<label>'+(a==="close"?"Lösungsbeschreibung":"Kommentar")+'<textarea name="message" required maxlength="'+(a==="close"?20000:10000)+'" rows="6"></textarea></label>',(f,btn)=>call(a==="close"?"tp_close_ticket":"tp_ticket_comment",a==="close"?{p_ticket:id,p_resolution:f.get("message")}:{p_ticket:id,p_message:f.get("message")},btn));
  }
 }
 async function showFiles(id,errors=[]){
  const u=uid(),t=data.tickets.find(x=>String(x.id)===String(id));if(!t||!u)return;
  const bucket=db.storage.from("tp-ticket-attachments");
  const listAll=async path=>{const rows=[];for(let offset=0;;offset+=100){const r=await bucket.list(path,{limit:100,offset,sortBy:{column:"name",order:"asc"}});if(r.error)throw r.error;rows.push(...(r.data||[]));if((r.data||[]).length<100)return rows;}};
  const dirs=await listAll(String(id)),files=[];
  for(const dir of dirs){if(dir.id)continue;const path=id+"/"+dir.name;for(const f of await listAll(path))if(f.id)files.push({path:path+"/"+f.name,name:f.name.slice(37)})}
  if(uid()!==u||!root())return;
  const d=document.getElementById("tp-ticket-dialog");
  const can=canAttach(t,u,isAdmin(),data.candidates);
  d.innerHTML='<h2>Dateianhänge · Ticket #'+esc(id)+'</h2>'+ (errors.length?'<p role="alert">Nicht hochgeladen:</p><ul>'+errors.map(e=>'<li>'+esc(e)+'</li>').join("")+'</ul>':"") + (files.length?files.map((f,i)=>'<p><button type="button" data-file-index="'+i+'">↓ '+esc(f.name)+'</button></p>').join(""):'<p>Keine Anhänge vorhanden.</p>')+(can?'<form id="tp-attachment-form">'+attachmentPicker+'<button type="submit" class="primary">Dateien hochladen</button></form>':'<p>Für dieses Ticket können keine weiteren Anhänge hochgeladen werden.</p>')+'<button type="button" id="tp-ticket-cancel">Schließen</button>';
  d.querySelector("#tp-ticket-cancel").onclick=()=>d.close();
  d.querySelectorAll("[data-file-index]").forEach(b=>b.onclick=async()=>{try{const f=files[Number(b.dataset.fileIndex)];const r=await bucket.download(f.path);if(r.error)throw r.error;if(uid()!==u)return;const url=URL.createObjectURL(r.data),link=document.createElement("a");link.href=url;link.download=f.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}catch(e){fail(e)}});
  const form=d.querySelector("form");
  if(form)form.onsubmit=async e=>{
   e.preventDefault();e.stopPropagation();if(busy)return;
   const btn=form.querySelector("button"),input=form.querySelector("input"),selected=Array.from(input.files);
   if(!selected.length){notice("Bitte Dateien auswählen.");return}
   try{validateAttachments(selected)}catch(e){fail(e);return}
   const cancel=d.querySelector("#tp-ticket-cancel");const preventClose=e=>e.preventDefault();
   busy=true;btn.disabled=true;input.disabled=true;cancel.disabled=true;d.addEventListener("cancel",preventClose);
   try{
    const result=await uploadAttachments(bucket,id,u,selected,()=>uid()===u);
    if(uid()!==u)return;
    notice(result.uploaded.length+" Datei(en) hochgeladen"+(result.failed.length?" · "+result.failed.length+" fehlgeschlagen.":"."));
    d.close();await showFiles(id,result.failed.map(x=>x.file.name+": "+x.error));
   }catch(e){if(uid()===u)fail(e)}
   finally{d.removeEventListener("cancel",preventClose);if(uid()===u){busy=false;btn.disabled=false;input.disabled=false;cancel.disabled=false;}}
  };
  d.showModal();
 }
 async function poll(){
  if(polling||busy||prefsSaving||!uid()||!root()||document.hidden||root().querySelector("dialog[open]"))return;
  if(root().contains(document.activeElement)&&document.activeElement?.matches("input,textarea,select,summary"))return;
  polling=true;try{await read(true)}catch(e){console.warn("Ticket refresh failed",e)}finally{polling=false}
 }
 setInterval(poll,15000);
 return {page,open,reset,poll,setMenuVisible};
}
