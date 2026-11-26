import {memberLabel} from "./profile-avatar.js";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function createAdminCenter({db,userId,isAdmin,notice,fail,settingsPanel,resetPassword,cancelInvitation}){
 let rows=[],generation=0,busy=false;
 const root=()=>document.getElementById("tp-admin-root");
 function reset(){generation++;rows=[];busy=false}
 function page(){return '<section id="tp-admin-root" class="tp-ticket-center"><p>Benutzer werden geladen …</p></section>'}
 async function open(){
  if(!isAdmin()||!userId())return;
  const token=++generation,u=userId();
  try{
   const a=await db.rpc("tp_admin_directory");
   if(token!==generation||u!==userId()||!isAdmin()||!root())return;
   if(a.error)throw a.error;
   rows=a.data||[];draw();
  }catch(e){if(token===generation&&root()){root().textContent="Benutzerverwaltung nicht verfügbar. Enterprise-Datenbank prüfen.";fail(e)}}
 }
 function draw(){
  const el=root();if(!el||!isAdmin())return;
  el.innerHTML='<div class="tp-ticket-panel"><small>TRUMMPLANER · ADMINISTRATION</small><h2>Benutzerverwaltung</h2><div class="tp-ticket-meta"><b>'+rows.length+' Konten</b><span>'+rows.filter(r=>r.active).length+' aktiv</span><span>'+rows.filter(r=>!r.active).length+' nicht freigeschaltet</span></div><p>Neue Mitarbeiter aktivieren ihr Konto selbst mit dem persönlichen Code. Standardrolle ist Benutzer.</p><button type="button" id="tp-admin-refresh">Aktualisieren</button></div>'+settingsPanel()+'<div class="tp-ticket-panel"><h3>Benutzerkonten</h3>'+rows.map(r=>'<form class="tp-admin-member" data-user="'+esc(r.user_id)+'"><strong>'+memberLabel(r.user_id,r.display_name||r.email)+'</strong><small>'+esc(r.email)+'</small><label>Anzeigename<input name="name" required maxlength="120" value="'+esc(r.display_name)+'"></label><label>Rolle<select name="role"><option value="member"'+(!r.is_admin?' selected':'')+'>Benutzer</option><option value="admin"'+(r.is_admin?' selected':'')+'>Administrator</option></select></label><label class="tp-ticket-check"><input type="checkbox" name="active"'+(r.active?' checked':'')+'> Aktiv</label>'+(r.user_id===userId()?'<p>Dein eigenes Administratorkonto (geschützt)</p>':(r.pending_activation?'<p>Aktivierung ausstehend</p><button type="button" class="danger" data-cancel-user="'+esc(r.user_id)+'">Einladung löschen</button>':'<button type="submit">Speichern</button><button type="button" data-reset-email="'+esc(r.email)+'">Passwort-Reset</button>'))+'</form>').join("")+'</div><div class="tp-ticket-panel"><h3>Firmenstamm</h3><p>Firmen werden zentral im Menü Firmen angelegt und stehen für Aufgaben und Tickets zur Verfügung.</p></div>';
  el.querySelector("#tp-admin-refresh").onclick=open;
  el.querySelectorAll("[data-reset-email]").forEach(b=>b.onclick=async()=>{if(!isAdmin())return;b.disabled=true;try{await resetPassword(b.dataset.resetEmail);notice("Passwort-Reset angefordert.")}catch(e){fail(e)}finally{b.disabled=false}});
  el.querySelectorAll("[data-cancel-user]").forEach(b=>b.onclick=async()=>{
   const row=rows.find(r=>r.user_id===b.dataset.cancelUser);
   if(busy||!isAdmin()||!row?.pending_activation||row.user_id===userId()||!confirm("Einladung für "+row.email+" endgültig löschen? Der alte Aktivierungscode wird ungültig."))return;
   busy=true;b.disabled=true;const u=userId();
   try{await cancelInvitation(row);if(u===userId()){notice("Einladung gelöscht. Du kannst die richtige E-Mail neu einladen.");await open()}}catch(e){if(u===userId())fail(e)}finally{if(u===userId()){busy=false;b.disabled=false}}
  });
  el.querySelectorAll(".tp-admin-member").forEach(form=>{if(form.dataset.user===userId()||rows.find(r=>r.user_id===form.dataset.user)?.pending_activation){form.querySelectorAll("input,select").forEach(x=>x.disabled=true);return}form.onsubmit=e=>{e.preventDefault();e.stopPropagation();const f=new FormData(form);save("tp_admin_member",{p_user:form.dataset.user,p_name:f.get("name"),p_active:f.has("active"),p_admin:f.get("role")==="admin"},form)}});
 }
 async function save(fn,args,form){
  if(busy||!isAdmin())return;busy=true;const u=userId(),button=form.querySelector('[type="submit"]');if(button)button.disabled=true;
  try{const r=await db.rpc(fn,args);if(r.error)throw r.error;if(u!==userId())return;notice("Änderung gespeichert.");await open()}catch(e){if(u===userId())fail(e)}finally{if(u===userId()){busy=false;if(button)button.disabled=false}}
 }
 return {page,open,reset};
}
