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
export function createTicketCenter({db,userId,isAdmin,notice,fail,refreshApp}){
 let data=null,tab="all",firm="",status="",search="",busy=false,epoch=0,focusId="",polling=false;
 const pageSize=500;
 const root=()=>document.getElementById("tp-ticket-root");
 const uid=()=>userId();
 const name=id=>data?.members.find(m=>m.user_id===id)?.display_name||"Unbekannt";
 const company=id=>data?.companies.find(c=>String(c.id)===String(id))?.name||"Unbekannt";
 const date=s=>s?new Date(s).toLocaleString("de-AT"):"";
 const options=(o,val)=>Object.entries(o).map(([k,v])=>'<option value="'+esc(k)+'"'+(String(val)===k?" selected":"")+'>'+esc(v)+'</option>').join("");
 const memberOptions=()=>data.members.filter(m=>m.active).map(m=>'<label class="tp-ticket-check"><input type="checkbox" name="candidate" value="'+esc(m.user_id)+'"> '+esc(m.display_name)+'</label>').join("");
 function count(category){return data?countActiveTickets(data.tickets,data.candidates,uid(),category):null}
 function syncMenu(){
  document.querySelectorAll("[data-ticket-category]").forEach(button=>{
   const key=button.dataset.ticketCategory;
   button.setAttribute("aria-pressed",String(tab===key));
   button.classList.toggle("active",tab===key);
   const n=button.querySelector(".tp-ticket-subnav-count");
   if(n)n.textContent=String(count(key)??"–");
  });
 }
 function setMenuVisible(visible){
  const menu=document.getElementById("tp-ticket-subnav");
  if(menu)menu.hidden=!visible;
  document.querySelector('#nav [data-view="tickets"]')?.setAttribute("aria-expanded",String(visible));
  syncMenu();
 }
 function selectCategory(key){
  if(!ticketCategories.some(([id])=>id===key)||!root()||busy)return;
  tab=key;firm="";status="";search="";focusId="";draw();syncMenu();
 }
 document.getElementById("tp-ticket-subnav")?.addEventListener("click",e=>{
  const button=e.target.closest("[data-ticket-category]");
  if(button)selectCategory(button.dataset.ticketCategory);
 });
 function reset(){epoch++;focusId="";data=null;tab="all";firm="";status="";search="";busy=false;setMenuVisible(false)}
 async function read(background=false){
  const u=uid(),token=++epoch;if(!u)return;
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
  const changed=JSON.stringify(data)!==JSON.stringify(next);
  if(background&&(busy||root()?.querySelector('dialog[open]')||root()?.contains(document.activeElement)&&document.activeElement?.matches('input,textarea,select,summary')))return;
  data=next;syncMenu();
  if(!background||changed){
   if(background&&(busy||root()?.querySelector("dialog[open]")||root()?.contains(document.activeElement)&&document.activeElement?.matches("input,textarea,select,summary")))return;
   const expanded=[...root()?.querySelectorAll("article details[open]")||[]].map(d=>d.closest("article")?.dataset.ticketId);
   draw();
   root()?.querySelectorAll("article details").forEach(d=>{if(expanded.includes(d.closest("article")?.dataset.ticketId))d.open=true});
  }
 }
 function page(){return '<section id="tp-ticket-root" class="tp-ticket-center"><p>Tickets werden geladen …</p></section>'}
 function error(e){if(root())root().innerHTML='<div class="tp-ticket-panel"><p>Ticket-Center nicht verfügbar. Die Enterprise-Datenbank muss eingerichtet sein.</p><button type="button" id="tp-ticket-retry">Erneut laden</button></div>';document.getElementById("tp-ticket-retry")?.addEventListener("click",()=>open());fail(e)}
 function open(id=""){if(id){focusId=String(id);tab="all";firm="";status="";search=""}syncMenu();if(data)draw();return read().catch(error)}
 function draw(){
  const el=root();if(!el||!data)return;
  const list=filterTickets(data.tickets,data.candidates,uid(),tab,firm,status,search);
  const categoryLabel=ticketCategories.find(([key])=>key===tab)?.[1]||"All Tickets";
  el.innerHTML='<div class="tp-ticket-panel"><div class="tp-ticket-head"><div><small>RHTFLOW · ENTERPRISE</small><h2>'+esc(categoryLabel)+'</h2></div><button type="button" class="primary" data-tp-action="create">+ Neues Ticket</button></div><div class="tp-ticket-mobile-subnav" role="group" aria-label="Ticket-Kategorien">'+ticketCategories.map(([k,n])=>'<button type="button" class="tp-ticket-subnav-button" data-ticket-category="'+k+'" aria-pressed="'+(tab===k)+'"><span>'+n+'</span><span class="tp-ticket-subnav-count">'+count(k)+'</span></button>').join("")+'</div><div class="tp-ticket-filters"><select id="tp-ticket-firm" aria-label="Firma">'+options({"":"Alle Firmen",...Object.fromEntries(data.companies.map(c=>[c.id,c.name]))},firm)+'</select><select id="tp-ticket-status" aria-label="Status">'+options({"":"Alle Status",...statuses},status)+'</select><input id="tp-ticket-search" placeholder="Tickets suchen" value="'+esc(search)+'"><button type="button" data-tp-action="refresh">Aktualisieren</button></div></div>'+
  (data.notifications.length?'<details class="tp-ticket-panel"><summary>Benachrichtigungen ('+data.notifications.filter(n=>!n.read_at).length+' ungelesen)</summary><button type="button" data-tp-action="read-notifications">Alle als gelesen markieren</button>'+data.notifications.slice(0,20).map(n=>'<p>'+esc(n.message)+' <small>'+esc(date(n.created_at))+'</small></p>').join("")+'</details>':'')+
  '<div class="tp-ticket-list">'+(list.map(t=>{
   const cs=data.candidates.filter(c=>String(c.ticket_id)===String(t.id));
   const can=t.status==="open"&&cs.some(c=>c.user_id===uid()&&c.response==="pending");
   const finish=t.status==="accepted"&&(t.assignee_id===uid()||isAdmin());
   const imported=data.taskLinks?.some(l=>String(l.ticket_id)===String(t.id));
   const comment=t.creator_id===uid()||t.assignee_id===uid()||can||isAdmin();
   const events=data.events.filter(e=>String(e.ticket_id)===String(t.id));
   return '<article data-ticket-id="'+esc(t.id)+'" class="tp-ticket-panel tp-ticket-card '+esc(t.priority)+'"><div class="tp-ticket-head"><small>#'+esc(t.id)+' · '+esc(company(t.company_id))+'</small><span class="tp-ticket-priority">'+esc(priorities[t.priority]||t.priority)+'</span></div><h3>'+esc(t.title)+'</h3><p class="tp-ticket-description">'+esc(t.description)+'</p><div class="tp-ticket-meta"><b>'+esc(statuses[t.status]||t.status)+'</b><span>Erstellt von: '+esc(name(t.creator_id))+'</span><span>'+esc(date(t.created_at))+'</span>'+(t.assignee_id?'<span>Bearbeiter: '+esc(name(t.assignee_id))+'</span>':'')+'</div><details><summary>Zuweisungen und Verlauf</summary>'+cs.map(c=>'<p>'+esc(name(c.user_id))+' · '+esc(({pending:"Wartet",accepted:"Angenommen",declined:"Abgelehnt",withdrawn:"Anderweitig vergeben"})[c.response]||c.response)+'</p>').join("")+events.map(e=>'<div class="tp-ticket-event"><small>'+esc(date(e.created_at))+' · '+esc(e.actor_id?name(e.actor_id):"System")+' · '+esc(({created:"Erstellt",accepted:"Angenommen",declined:"Abgelehnt",closed:"Abgeschlossen",comment:"Kommentar",five_day_reminder:"5-Tage-Erinnerung"})[e.kind]||e.kind)+'</small><p>'+esc(e.message)+'</p></div>').join("")+'</details>'+(t.resolution?'<div class="tp-ticket-resolution"><b>Lösung</b><p>'+esc(t.resolution)+'</p></div>':'')+'<div class="tp-ticket-actions">'+(can?'<button type="button" data-tp-action="accept" data-id="'+esc(t.id)+'">✓ Annehmen</button><button type="button" data-tp-action="decline" data-id="'+esc(t.id)+'">× Ablehnen</button>':'')+(finish?'<button type="button" data-tp-action="close" data-id="'+esc(t.id)+'">Ticket abschließen</button>':'')+(t.status==="accepted"&&t.assignee_id===uid()?'<button type="button" data-tp-action="task" data-id="'+esc(t.id)+'" '+(imported?'disabled':'')+'>'+(imported?'Als Aufgabe übernommen':'Als Aufgabe übernehmen')+'</button>':'')+(t.status==="closed"&&(t.assignee_id===uid()||isAdmin())?'<button type="button" data-tp-action="publish" data-id="'+esc(t.id)+'">Lösung veröffentlichen</button>':'')+(comment?'<button type="button" data-tp-action="comment" data-id="'+esc(t.id)+'">Kommentar</button>':'')+((t.status!=="closed"&&(t.creator_id===uid()||t.assignee_id===uid()||isAdmin()))?'<button type="button" data-tp-action="reassign" data-id="'+esc(t.id)+'">Weiterleiten</button>':'')+'<button type="button" data-tp-action="files" data-id="'+esc(t.id)+'">Anhänge</button>'+'</div></article>';
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
 function action(a,id,b){
  if(a==="refresh"){open();return}
  if(a==="read-notifications"){call("tp_read_ticket_notifications",{},b);return}
  if(a==="task"){call("tp_import_ticket_task",{p_ticket:id},b);return}
  if(a==="publish"){call("tp_publish_ticket_solution",{p_ticket:id},b);return}
  if(a==="reassign"){dialog("Ticket weiterleiten",'<fieldset><legend>Neue zuständige Mitarbeiter</legend>'+memberOptions()+'</fieldset>',(f,btn)=>{const users=f.getAll("candidate");if(!users.length){notice("Bitte Mitarbeiter auswählen.");return}call("tp_reassign_ticket",{p_ticket:id,p_users:users},btn)});return}
  if(a==="files"){showFiles(id).catch(fail);return}
  if(a==="accept"||a==="decline"){call("tp_respond_ticket",{p_ticket:id,p_accept:a==="accept"},b);return}
  if(a==="create"){
   if(!data.companies.length||!data.members.some(m=>m.active)){notice("Zuerst müssen Firmen und Mitarbeiter eingerichtet werden.");return}
   dialog("Neues Ticket",'<label>Titel<input name="title" required maxlength="200"></label><label>Firma<select name="company" required>'+options(Object.fromEntries(data.companies.map(c=>[c.id,c.name])),"")+'</select></label><label>Priorität<select name="priority">'+options(priorities,"normal")+'</select></label><label>Problembeschreibung<textarea name="description" required maxlength="20000" rows="5"></textarea></label><fieldset><legend>Zuständige Mitarbeiter</legend>'+memberOptions()+'</fieldset>',(f,btn)=>{const users=f.getAll("candidate");if(!users.length){notice("Bitte mindestens einen Mitarbeiter auswählen.");return}call("tp_create_ticket",{p_company:f.get("company"),p_title:f.get("title"),p_description:f.get("description"),p_priority:f.get("priority"),p_users:users},btn)});
  }else if(a==="close"||a==="comment"){
   dialog(a==="close"?"Ticket abschließen":"Kommentar hinzufügen",'<label>'+(a==="close"?"Lösungsbeschreibung":"Kommentar")+'<textarea name="message" required maxlength="'+(a==="close"?20000:10000)+'" rows="6"></textarea></label>',(f,btn)=>call(a==="close"?"tp_close_ticket":"tp_ticket_comment",a==="close"?{p_ticket:id,p_resolution:f.get("message")}:{p_ticket:id,p_message:f.get("message")},btn));
  }
 }
 async function showFiles(id){
  const u=uid(),t=data.tickets.find(x=>String(x.id)===String(id));if(!t||!u)return;
  const bucket=db.storage.from("tp-ticket-attachments");
  const dirs=await bucket.list(String(id),{limit:100});if(dirs.error)throw dirs.error;
  const files=[];
  for(const dir of dirs.data||[]){const path=id+"/"+dir.name;const r=await bucket.list(path,{limit:100});if(r.error)throw r.error;for(const f of r.data||[])if(f.id)files.push({path:path+"/"+f.name,name:f.name.slice(37)})}
  if(uid()!==u||!root())return;
  const d=document.getElementById("tp-ticket-dialog");
  const can=t.status!=="closed"&&(t.creator_id===u||t.assignee_id===u||isAdmin()||data.candidates.some(c=>String(c.ticket_id)===String(id)&&c.user_id===u&&c.response==="pending"));
  d.innerHTML='<h2>Anhänge</h2>'+files.map((f,i)=>'<p><button type="button" data-file-index="'+i+'">'+esc(f.name)+'</button></p>').join("")+(can?'<form id="tp-attachment-form"><input type="file" required accept="image/png,image/jpeg,image/webp,application/pdf,text/plain"><button type="submit">Hochladen</button></form>':'')+'<button type="button" id="tp-ticket-cancel">Schließen</button>';
  d.querySelector("#tp-ticket-cancel").onclick=()=>d.close();
  d.querySelectorAll("[data-file-index]").forEach(b=>b.onclick=async()=>{try{const f=files[Number(b.dataset.fileIndex)];const r=await bucket.download(f.path);if(r.error)throw r.error;if(uid()!==u)return;const url=URL.createObjectURL(r.data),link=document.createElement("a");link.href=url;link.download=f.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}catch(e){fail(e)}});
  const form=d.querySelector("form");
  if(form)form.onsubmit=async e=>{e.preventDefault();e.stopPropagation();const btn=form.querySelector("button"),file=form.querySelector("input").files[0];if(!file||file.size>10485760){notice("Maximal 10 MB pro Anhang.");return}btn.disabled=true;try{const path=id+"/"+u+"/"+crypto.randomUUID()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,120);const r=await bucket.upload(path,file,{upsert:false,contentType:file.type});if(r.error)throw r.error;if(uid()!==u)return;d.close();await showFiles(id)}catch(e){fail(e)}finally{btn.disabled=false}};
  d.showModal();
 }
 async function poll(){
  if(polling||busy||!uid()||!root()||document.hidden||root().querySelector("dialog[open]"))return;
  if(root().contains(document.activeElement)&&document.activeElement?.matches("input,textarea,select,summary"))return;
  polling=true;try{await read(true)}catch(e){console.warn("Ticket refresh failed",e)}finally{polling=false}
 }
 setInterval(poll,15000);
 return {page,open,reset,poll,setMenuVisible};
}
