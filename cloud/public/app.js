import {createProfile,profileInfo,memberLabel,createMemberAvatars} from "./profile-avatar.js";
import {normalizeMenu,applyMenu,createMenuEditor} from "./menu-preferences.js";
import {createMfa,mfaStatus} from "./mfa.js";
import {validFavorites,showcasePanel,readAllShowcases} from "./trophy-showcases.js";
import {createActivation} from "./activation.js";
import {solutionDeleteButton,deleteSolution} from "./solution-admin.js";
import {createRecovery} from "./recovery.js";

import {createFeatures} from "./extended.js";
import {installDictation} from "./dictation.js";
import {createTaskProjectSelector} from "./task-projects.js";
import {installDueDatePresets} from "./due-presets.js";
import {careerCard,careerPage,playerRank} from "./game-progression.js";
import {careerChallengeMarkup,dailyChallengeMarkup,readCareerEvents} from "./rhtflow-21.js";
import {trophyCabinet,toggleFavorite,announceTrophies} from "./trophies.js";
import {createTicketCenter} from "./tickets.js";
import {createAdminCenter} from "./admin.js";
import {ticketAwardsPanel} from "./ticket-awards.js";

let trophyItems=[],trophyFilter="all",trophyCategory="all",trophyFavorites=[],trophyError=false,trophySound=false;
const trophyKey=()=> (cfg.staging?"rhtflow-test-trophy-prefs-":"tp-trophy-prefs-")+state.user?.id;
function readTrophyPrefs(){try{const p=JSON.parse(localStorage.getItem(trophyKey())||"{}");trophyFavorites=Array.isArray(p.favorites)?p.favorites.filter(Number.isInteger).slice(0,3):[];trophySound=p.sound===true}catch{trophyFavorites=[];trophySound=false}}
function saveTrophyPrefs(){try{localStorage.setItem(trophyKey(),JSON.stringify({favorites:trophyFavorites,sound:trophySound}))}catch{}}
async function syncTrophies(){const uid=state.user?.id;if(!uid)return;try{const {data,error}=await db.rpc("tp_sync_trophies");if(state.user?.id!==uid)return;if(error)throw error;trophyItems=Array.isArray(data?.trophies)?data.trophies:[];if(data?.profile)state.gameProfile=data.profile;trophyError=false;announceTrophies(trophyItems,data?.new||[],trophySound)}catch(e){if(state.user?.id===uid){trophyError=true;console.warn("Trophäen-Sync",e)}}}
let showcaseRows=[],showcaseCatalog=[],showcaseReady=false,showcaseBusy=false,showcaseError=false,showcaseEpoch=0;
function resetShowcases(){showcaseEpoch++;showcaseRows=[];showcaseCatalog=[];showcaseReady=false;showcaseBusy=false;showcaseError=false;}
function showcaseMarkup(){return showcasePanel(state.members||[],showcaseRows,showcaseCatalog,state.user?.id,showcaseError,!showcaseReady&&!showcaseError);}
function redrawShowcases(){
 const panel=$("tp-colleague-showcases");if(panel){panel.outerHTML=showcaseMarkup();bindShowcases();}
 const cabinet=$("tp-trophy-cabinet");if(cabinet){cabinet.outerHTML=trophyCabinet(trophyItems,trophyFilter,trophyCategory,trophyFavorites,trophyError,trophySound);bindTrophies();}
}
function bindShowcases(){const button=$("tp-showcase-refresh");if(button){button.disabled=showcaseBusy;button.onclick=()=>syncShowcases();}}
async function syncShowcases(){
 const uid=state.user?.id,epoch=showcaseEpoch;if(!uid||showcaseBusy)return;
 const current=()=>state.user?.id===uid&&showcaseEpoch===epoch;
 showcaseBusy=true;bindShowcases();
 try{
  let rows=await readAllShowcases(db);if(!current())return;
  let own=rows.find(r=>r.owner_id===uid);
  if(!own&&trophyItems.length&&!trophyError){
   const ids=validFavorites(trophyFavorites,trophyItems);
   const {error}=await db.from("tp_trophy_showcases").insert({owner_id:uid,trophy_ids:ids});
   if(error&&error.code!=="23505")throw error;
   rows=await readAllShowcases(db);if(!current())return;
   own=rows.find(r=>r.owner_id===uid);
  }
  if(!own&&(!trophyItems.length||trophyError)){showcaseReady=false;showcaseError=!!trophyError;return;}
  if(own&&trophyItems.length&&!trophyError){trophyFavorites=validFavorites(own.trophy_ids,trophyItems);saveTrophyPrefs();}
  const ids=[...new Set(rows.flatMap(r=>r.trophy_ids||[]))].filter(id=>Number.isInteger(id)&&id>=1&&id<=50);
  let catalog=[];
  if(ids.length){const {data,error}=await db.from("tp_trophy_definitions").select("id,title,rarity").in("id",ids);if(error)throw error;catalog=data||[];}
  if(!current())return;
  showcaseRows=rows;showcaseCatalog=catalog;showcaseReady=!!own&&trophyItems.length>0&&!trophyError;showcaseError=!!trophyError;
 }catch(e){if(current()){showcaseError=true;showcaseReady=false;console.warn("Vitrinen-Sync",e)}}
 finally{if(current()){showcaseBusy=false;if(state.view==="career")redrawShowcases();}}
}
async function changeShowcase(id){
 if(showcaseBusy||!showcaseReady){notice("Vitrine wird noch geladen. Bitte aktualisieren.");return;}
 const next=toggleFavorite(trophyFavorites,id,trophyItems);
 if(next===trophyFavorites){notice("Deine Vitrine hat Platz für drei freigeschaltete Trophäen.");return;}
 const uid=state.user?.id,epoch=showcaseEpoch;if(!uid)return;
 showcaseBusy=true;bindShowcases();document.querySelectorAll("[data-trophy-favorite]").forEach(b=>b.disabled=true);
 try{
  const {error}=await db.from("tp_trophy_showcases").upsert({owner_id:uid,trophy_ids:next},{onConflict:"owner_id"});
  if(error)throw error;
  if(uid!==state.user?.id||epoch!==showcaseEpoch)return;
  trophyFavorites=next;saveTrophyPrefs();
  notice("Vitrine gespeichert und für Kollegen sichtbar.");
 }catch(e){if(uid===state.user?.id&&epoch===showcaseEpoch)fail(e)}
 finally{if(uid===state.user?.id&&epoch===showcaseEpoch){showcaseBusy=false;if(state.view==="career")redrawShowcases();}}
 if(uid===state.user?.id&&epoch===showcaseEpoch)await syncShowcases();
}
function bindTrophies(){const root=$("tp-trophy-cabinet");if(!root)return;const redraw=()=>{root.outerHTML=trophyCabinet(trophyItems,trophyFilter,trophyCategory,trophyFavorites,trophyError,trophySound);bindTrophies()};$("tp-trophy-filter").onchange=e=>{trophyFilter=e.target.value;redraw()};$("tp-trophy-category").onchange=e=>{trophyCategory=e.target.value;redraw()};$("tp-trophy-sound").onchange=e=>{trophySound=e.target.checked;saveTrophyPrefs()};root.querySelectorAll("[data-trophy-favorite]").forEach(b=>{b.disabled=showcaseBusy||!showcaseReady;b.onclick=()=>changeShowcase(Number(b.dataset.trophyFavorite))});const retry=$("tp-trophy-retry");if(retry)retry.onclick=async()=>{retry.disabled=true;await syncTrophies();render()}}
const {createClient}=globalThis.supabase;
const cfg=window.TRUMMPLANER_CONFIG||{};
if(!cfg.supabaseUrl||!cfg.supabasePublishableKey||(cfg.staging&&cfg.supabaseUrl.includes("ilmwoapvcluoravpsrjv"))){
 document.getElementById("setup-warning")?.classList.remove("hidden");
 document.querySelectorAll("#auth-form input,#auth-form button").forEach(el=>el.disabled=true);
 throw new Error("Supabase connection is not configured for this build");
}
const projectRef=new URL(cfg.supabaseUrl).hostname.split(".")[0];
// Preserve the Supabase project-specific production session key; TEST uses its own ref.
const db=createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{storageKey:"sb-"+projectRef+"-auth-token",persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
let menuPrefs=normalizeMenu(),menuRevision=0,menuReady=false;
let challengeEvents=[],challengeReady=false,challengeRequest=0;
const menuEditor=createMenuEditor({document,db,userId:()=>state.user?.id,isAdmin:()=>state.isAdmin,onSaved:p=>{menuRevision++;menuPrefs=p;applyMenu(document,menuPrefs,state.isAdmin,state.view);notice("Dein Menü wurde gespeichert.");},onError:fail});
function openMenuEditor(onlyTickets=false){if(!state.user)return;if(!menuReady){notice("Menüeinstellungen konnten noch nicht geladen werden. Bitte aktualisieren.");load().catch(fail);return;}menuEditor.open(menuPrefs,onlyTickets);}
document.querySelectorAll("[data-menu-customize]").forEach(b=>b.onclick=()=>openMenuEditor());
async function loadMenuPreferences(uid){
 const revision=menuRevision;
 try{
  const {data,error}=await db.from("tp_menu_preferences").select("menu_order,hidden_items,ticket_order").eq("owner_id",uid).maybeSingle();
  if(state.user?.id!==uid||revision!==menuRevision)return;
  if(error)throw error;
  if(!menuEditor.isOpen())menuPrefs=normalizeMenu(data);
  menuReady=true;
 }catch(e){if(state.user?.id===uid&&revision===menuRevision){menuReady=false;console.warn("Menüeinstellungen konnten nicht geladen werden",e);}}
}
const ticketCenter=createTicketCenter({db,userId:()=>state.user?.id,isAdmin:()=>state.isAdmin,notice,fail,refreshApp:load,ticketOrder:()=>menuPrefs.ticket_order,customizeOrder:()=>openMenuEditor(true)});
const adminCenter=createAdminCenter({db,userId:()=>state.user?.id,isAdmin:()=>state.isAdmin,notice,fail,settingsPanel:()=>invitePanel(),cancelInvitation:async row=>{
 const {data:{session}}=await db.auth.getSession();
 if(!session?.access_token)throw new Error("Bitte neu anmelden.");
 const res=await fetch(cfg.supabaseUrl+"/functions/v1/tp-activation-invite",{method:"POST",headers:{"content-type":"application/json","apikey":cfg.supabasePublishableKey,"authorization":"Bearer "+session.access_token},body:JSON.stringify({action:"cancel",user_id:row.user_id,email:row.email})});
 const body=await res.json().catch(()=>({}));
 if(!res.ok||!body.ok)throw new Error(body.error||"Einladung konnte nicht gelöscht werden.");
 state.inviteLink=null;await load();
},resetPassword:async email=>{const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});if(error)throw error}});
const $=id=>document.getElementById(id);
let inviteFlow=["invite","recovery"].includes(new URLSearchParams(location.hash.slice(1)).get("type"));
const state={user:null,companies:[],entries:[],view:"dashboard",search:"",filter:"all",isAdmin:false,invites:[],inviteLink:null,solutions:[],pushSubs:[],gameProfile:null,gameEvents:[]};
let profileRankReady=false;
const memberAvatars=createMemberAvatars({document,db,userId:()=>state.user?.id});
const profile=createProfile({document,db,userId:()=>state.user?.id,info:()=>profileInfo(state.user,state.members,profileRankReady?state.gameProfile:undefined),notice,onAvatarChange:()=>memberAvatars.refresh()});
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=x=>x?new Date(x).toLocaleString("de-AT",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"–";
const inDate=x=>{if(!x)return "";const d=new Date(x),p=x=>String(x).padStart(2,"0");return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+"T"+p(d.getHours())+":"+p(d.getMinutes());};
const iso=x=>x?new Date(x).toISOString():null;
const company=id=>state.companies.find(c=>c.id===id)?.name||"Unbekannte Firma";
const active=()=>state.entries.filter(x=>x.kind==="task"&&x.status==="open");
const overdue=e=>e.kind==="task"&&e.status==="open"&&e.due_at&&Date.parse(e.due_at)<Date.now();
const today=e=>e.due_at&&new Date(e.due_at).toDateString()===new Date().toDateString();
let toastTimer,installPrompt;
let xpToastTimer;
function showTaskXp(entryId,previousEventId){
 const gained=(state.gameEvents||[]).find(ev=>ev.entry_id===entryId&&Number(ev.id)>Number(previousEventId||0));
 if(!gained)return;
 const reward=$("tp-xp-reward");
 const levelUp=Number(gained.rank_after)>Number(gained.rank_before);
 const rank=playerRank(state.gameProfile);
 reward.innerHTML='<strong>+'+Number(gained.xp)+' XP</strong>'+
  '<span>Mission abgeschlossen!</span>'+
  (levelUp?'<em>★ LEVELAUFSTIEG! Level '+rank.level+'</em>':'')+
  (rank.ready?'<em>✦ Prestige bereit!</em>':'');
 reward.classList.remove("hidden");
 clearTimeout(xpToastTimer);
 xpToastTimer=setTimeout(()=>reward.classList.add("hidden"),6500);
}
function openPrestigeDialog(){
 const p=playerRank(state.gameProfile);
 if(!p.ready)return notice("Prestige wird erst ab Level 55 freigeschaltet.");
 $("tp-prestige-dialog-title").textContent=p.next+"?";
 $("tp-prestige-dialog-message").textContent=p.prestige===10
  ?"Du hast Prestige 10 auf Level 55 geschafft! Jetzt wird Prestige-Meister freigeschaltet. Dein Level bleibt bei 55 und wächst danach ohne weiteren Prestige-Reset bis Level 1000. Gesamt-XP, Abzeichen und Aufgaben bleiben erhalten."
  :"Du startest Prestige "+(p.prestige+1)+" wieder auf Level 1. Gesammelte Gesamt-XP, abgeschlossene Aufgaben und bisherige Prestige-Abzeichen bleiben erhalten. Diesen Schritt kannst du nicht rückgängig machen.";
 $("tp-prestige-dialog").showModal();
}
function closePrestigeDialog(){if($("tp-prestige-dialog").open)$("tp-prestige-dialog").close();}

function notice(msg){$("toast").textContent=msg;$("toast").classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("toast").classList.remove("show"),6000);}
function fail(e){console.error(e);notice("Fehler: "+(e?.message||String(e)));}
const features=createFeatures({
 db,state,esc,fmt,notice,fail,refresh:load,company,
 openTask:({entryId,projectId,companyId})=>{
  if(entryId)return openEntry(state.entries.find(e=>e.id===entryId));
  return openEntry({kind:"task",company_id:companyId,project_id:projectId});
 },
 showProjectTasks:({companyId,projectId})=>{
  features.taskCompany=companyId;
  features.taskProject=projectId;
  nav("tasks");
 }
});
async function load(){
 if(!state.user)return;
 const loadingUser=state.user.id;
 try{const status=await mfaStatus(db);if(state.user?.id!==loadingUser)return;if(!status.active||!status.fresh){await checkMfaAccess();return;}}catch{if(state.user?.id===loadingUser){showApp(null);displayMfa("Sicherheitsprüfung derzeit nicht verfügbar. Bitte erneut prüfen.");}return;}
 const membership=await db.from("tp_members").select("active").eq("user_id",state.user.id).maybeSingle();
 if(state.user?.id!==loadingUser)return;
 if(membership.error)throw membership.error;
 if(!membership.data?.active){await db.auth.signOut();showApp(null);notice("Konto noch nicht freigeschaltet oder gesperrt.");return;}
 const [a,b,adminStatus,sol,pushDevices,gameProfile,xpEvents,members,awardRows,closedTickets]=await Promise.all([
  db.from("tp_companies").select("*").order("name"),
  db.from("tp_entries").select("*").order("created_at",{ascending:false}),
  db.from("tp_app_admins").select("user_id").eq("user_id",state.user.id).maybeSingle(),
  db.from("tp_solutions").select("*").order("updated_at",{ascending:false}),
  db.from("tp_push_subscriptions").select("id,endpoint,device_name").eq("owner_id",state.user.id),
  db.from("tp_game_profiles").select("*").eq("owner_id",state.user.id).maybeSingle(),
  db.from("tp_game_xp_events").select("id,entry_id,entry_title,xp,rank_before,rank_after,prestige,stage,awarded_at").eq("owner_id",state.user.id).order("id",{ascending:false}).limit(30),
  db.from("tp_members").select("user_id,display_name,active"),
  db.from("tp_ticket_awards").select("threshold,awarded_at").eq("owner_id",state.user.id),
  db.from("tp_tickets").select("id",{count:"exact",head:true}).eq("assignee_id",state.user.id).eq("status","closed")
 ]);
 if(state.user?.id!==loadingUser)return;
 if(a.error)throw a.error;
 if(b.error)throw b.error;
 if(adminStatus.error)throw adminStatus.error;
 if(sol.error)throw sol.error;
 if(pushDevices.error)throw pushDevices.error;
 if(gameProfile.error)throw gameProfile.error;
 if(xpEvents.error)throw xpEvents.error;
 if(members.error)throw members.error;
 state.members=members.data||[];
 if(awardRows.error)throw awardRows.error;if(closedTickets.error)throw closedTickets.error;
 state.ticketAwards=awardRows.data||[];state.closedTickets=closedTickets.count||0;
 state.solutions=sol.data||[];
 state.pushSubs=pushDevices.data||[];
 state.gameProfile=gameProfile.data||null;profileRankReady=true;profile.render();
 state.gameEvents=xpEvents.data||[];
 state.companies=a.data||[];
 state.entries=b.data||[];
 state.isAdmin=!!adminStatus.data;
 await Promise.all([loadMenuPreferences(loadingUser),profile.load(loadingUser)]);
 if(state.user?.id!==loadingUser)return;
 if(new URLSearchParams(location.search).has("ticket"))state.view="tickets";
 if(state.isAdmin){
  const invites=await db.from("tp_invites").select("email,status,created_at").order("created_at",{ascending:false}).limit(40);
  if(state.user?.id!==loadingUser)return;
  if(invites.error)throw invites.error;
  state.invites=invites.data||[];
 }else state.invites=[];
 await features.load();
 if(state.user?.id!==loadingUser)return;
 await syncTrophies();
 if(state.user?.id!==loadingUser)return;
 await refreshCareerChallenges(loadingUser);
 if(state.user?.id!==loadingUser)return;
 render();memberAvatars.refresh();
}
function showApp(user){if(state.user?.id!==user?.id){$("content").replaceChildren();state.view="dashboard";state.search="";state.filter="all";state.isAdmin=false;state.entries=[];state.companies=[];state.solutions=[];state.members=[];state.invites=[];state.inviteLink=null;state.gameProfile=null;state.gameEvents=[];state.ticketAwards=[];state.closedTickets=0;state.pushSubs=[];document.querySelectorAll('[data-view="admin"]').forEach(b=>b.hidden=true);ticketCenter.reset();challengeRequest++;challengeEvents=[];challengeReady=false;adminCenter.reset();resetShowcases();menuEditor.reset();profile.reset();memberAvatars.reset();profileRankReady=false;menuRevision++;menuPrefs=normalizeMenu();menuReady=false;applyMenu(document,menuPrefs,false,"dashboard");trophyItems=[];trophyError=false;trophyFilter="all";trophyCategory="all";document.getElementById("tp-trophy-popup")?.remove()}state.user=user||null;readTrophyPrefs();$("auth").classList.toggle("hidden",!!user);$("app").classList.toggle("hidden",!user);if(user){profile.render();load().catch(fail);}else{state.companies=[];state.entries=[];state.isAdmin=false;state.invites=[];state.inviteLink=null;state.solutions=[];state.members=[];state.ticketAwards=[];state.closedTickets=0;state.pushSubs=[];state.gameProfile=null;state.gameEvents=[];}}
async function login(){
 const emailField=$("login-email"),passwordField=$("login-password");
 if(!emailField.reportValidity()||!passwordField.reportValidity())return;
 $("login-submit").disabled=true;
 try{
  const {data,error}=await db.auth.signInWithPassword({email:emailField.value.trim(),password:passwordField.value});
  if(error)throw error;
  if(data.session?.user){passwordField.value="";await checkMfaAccess();}
 }catch(e){fail(e)}
 finally{$("login-submit").disabled=false;}
}
$("auth-form").addEventListener("submit",e=>{e.preventDefault();login()});
const recoveryClient=createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{storageKey:"sb-"+projectRef+"-recovery-only",persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const recoveryUI={
 message:m=>{$("recovery-message").textContent=m},
 busy:v=>document.querySelectorAll("#recovery-panel button,#recovery-panel input").forEach(el=>el.disabled=v),
 open:value=>{$("activation-open").classList.add("hidden");$("auth-form").classList.add("hidden");$("recovery-open").classList.add("hidden");$("recovery-panel").classList.remove("hidden");$("recovery-request").classList.remove("hidden");$("recovery-code-form").classList.add("hidden");$("recovery-password-form").classList.add("hidden");$("recovery-email").value=value;$("recovery-code").value="";$("recovery-password").value="";$("recovery-repeat").value="";$("recovery-message").textContent="";},
 code:()=>{$("recovery-code-form").classList.remove("hidden");$("recovery-code").value="";$("recovery-code").focus()},
 password:()=>{$("recovery-request").classList.add("hidden");$("recovery-code-form").classList.add("hidden");$("recovery-code").value="";$("recovery-password-form").classList.remove("hidden");$("recovery-password").focus()},
 done:()=>{$("activation-open").classList.remove("hidden");$("recovery-panel").classList.add("hidden");$("auth-form").classList.remove("hidden");$("recovery-open").classList.remove("hidden");$("recovery-code").value="";$("recovery-password").value="";$("recovery-repeat").value=""}
};
const recovery=createRecovery(recoveryClient.auth,recoveryUI,new URL("./",location.href).href);
$("recovery-open").onclick=()=>recovery.open($("login-email").value);
$("recovery-request").onsubmit=e=>{e.preventDefault();recovery.request($("recovery-email").value)};
$("recovery-code-form").onsubmit=e=>{e.preventDefault();recovery.verify($("recovery-code").value.trim())};
$("recovery-password-form").onsubmit=e=>{e.preventDefault();recovery.save($("recovery-password").value,$("recovery-repeat").value)};
$("recovery-cancel").onclick=()=>recovery.cancel();
const activationClient=createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{storageKey:"sb-"+projectRef+"-activation-only",persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const activation=createActivation(activationClient.auth,async()=>{
 const {data:who,error}=await activationClient.auth.getUser();
 if(error||!who.user)return false;
 const status=await mfaStatus(activationClient);
 return status.active===true;
});
function activationScreen(open){
 $("activation-panel").classList.toggle("hidden",!open);
 $("auth-form").classList.toggle("hidden",open);
 $("activation-open").classList.toggle("hidden",open);
 $("recovery-open").classList.toggle("hidden",open);
 if(!open){$("activation-code").value="";$("activation-password").value="";$("activation-repeat").value="";}
}
$("activation-open").onclick=()=>{$("activation-email").value=$("login-email").value;$("activation-message").textContent="";activationScreen(true)};
$("activation-cancel").onclick=async()=>{await activation.cancel();activationScreen(false)};
$("activation-form").onsubmit=async e=>{
 e.preventDefault();const fields=[...e.currentTarget.querySelectorAll("input,button")];fields.forEach(x=>x.disabled=true);
 try{const email=$("activation-email").value;const ok=await activation.activate({email,code:$("activation-code").value.trim(),password:$("activation-password").value,repeat:$("activation-repeat").value});if(ok){activationScreen(false);$("login-email").value=email;notice("Konto aktiviert. Bitte mit deinem neuen Passwort anmelden.");}}
 catch(err){$("activation-message").textContent=err.message||"Aktivierung fehlgeschlagen.";}
 finally{fields.forEach(x=>x.disabled=false);}
};


const mfa=createMfa(db.auth);
let mfaJob=null,mfaEpoch=0,mfaDeadline=null,mfaBusy=false,mfaFactorUser=null;
function clearMfaScreen(){
 clearTimeout(mfaDeadline);mfaDeadline=null;mfa.clear();mfaFactorUser=null;
 $("mfa-qr").removeAttribute("src");$("mfa-secret").textContent="";$("mfa-code").value="";$("mfa-factor").replaceChildren();
 $("mfa-enrollment").classList.add("hidden");$("mfa-panel").classList.add("hidden");$("mfa-enroll").classList.add("hidden");$("mfa-verify-form").classList.add("hidden");
}
function displayMfa(message=""){
 $("auth").classList.remove("hidden");$("app").classList.add("hidden");
 for(const id of ["auth-form","activation-open","activation-panel","recovery-open","recovery-panel"])$(id).classList.add("hidden");
 $("mfa-panel").classList.remove("hidden");$("mfa-message").textContent=message;
}
function mfaLoginScreen(){
 clearMfaScreen();$("auth-form").classList.remove("hidden");$("activation-open").classList.remove("hidden");$("recovery-open").classList.remove("hidden");
}
function setMfaBusy(value){
 mfaBusy=value;for(const e of $("mfa-panel").querySelectorAll("input,button,select"))e.disabled=value;
}
function setMfaFactors(factors){
 const select=$("mfa-factor");select.replaceChildren();
 for(const f of factors){const opt=document.createElement("option");opt.value=f.id;opt.textContent=f.friendly_name||"Authenticator";select.append(opt);}
 $("mfa-verify-form").classList.toggle("hidden",!factors.length);
 $("mfa-enroll").classList.toggle("hidden",!!factors.length);
}
async function checkMfaAccess(){
 if(mfaJob)return mfaJob;
 const epoch=mfaEpoch;
 mfaJob=(async()=>{
  try{
   const {data:{session},error}=await db.auth.getSession();if(error)throw error;
   if(epoch!==mfaEpoch)return;
   if(!session?.user){if(state.user)showApp(null);if(!$("mfa-panel").classList.contains("hidden"))mfaLoginScreen();return;}
   const status=await mfaStatus(db);if(epoch!==mfaEpoch)return;
   if(!status.active){await db.auth.signOut({scope:"local"});if(epoch===mfaEpoch){showApp(null);mfaLoginScreen();notice("Konto noch nicht freigeschaltet oder gesperrt.");}return;}
   if(status.fresh){
    clearMfaScreen();
    if(state.user?.id!==session.user.id)showApp(session.user);
    const seconds=Number(status.remaining_seconds);
    mfaDeadline=setTimeout(()=>checkMfaAccess(),Math.max(1,seconds+1)*1000);
    return;
   }
   if(state.user)showApp(null);
   displayMfa();
   if(mfaBusy)return;
   // Preserve an in-progress enrollment on refresh/auth events in the same session.
   if(mfaFactorUser===session.user.id&&!$("mfa-enrollment").classList.contains("hidden"))return;
   if(mfaFactorUser!==session.user.id){mfa.clear();mfaFactorUser=session.user.id;$("mfa-qr").removeAttribute("src");$("mfa-secret").textContent="";$("mfa-enrollment").classList.add("hidden");}
   const factors=await mfa.factors();if(epoch!==mfaEpoch)return;
   setMfaFactors(factors.verified);
   $("mfa-intro").textContent=factors.verified.length?"Bitte bestätige deine Anmeldung mit dem aktuellen Code aus deiner Authenticator-App.":"Richte deine Authenticator-App einmalig ein. Danach wird die Prüfung spätestens alle fünf Tage fällig.";
  }catch{
   if(epoch===mfaEpoch){if(state.user)showApp(null);displayMfa("Sicherheitsprüfung derzeit nicht verfügbar. Bitte erneut prüfen.");}
  }
 })();
 try{await mfaJob;}finally{mfaJob=null;}
}
$("mfa-enroll").onclick=async()=>{
 if(mfaBusy)return;setMfaBusy(true);const epoch=mfaEpoch;
 try{
  const factor=await mfa.enroll();if(epoch!==mfaEpoch)return;
  const qr=String(factor.qr||"");
  if(qr.startsWith("data:image/svg+xml")||qr.startsWith("data:image/png;base64,"))$("mfa-qr").src=qr;
  else if(qr.startsWith("<svg"))$("mfa-qr").src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(qr);
  else $("mfa-qr").removeAttribute("src");
  $("mfa-secret").textContent=factor.secret;$("mfa-enrollment").classList.remove("hidden");
  setMfaFactors([{id:factor.id,friendly_name:"RHTFLOW"}]);$("mfa-message").textContent="Nach dem Scannen bitte den aktuellen Code eingeben.";
 }catch(e){if(epoch===mfaEpoch)$("mfa-message").textContent=e.message;}
 finally{if(epoch===mfaEpoch)setMfaBusy(false);}
};
$("mfa-verify-form").onsubmit=async e=>{
 e.preventDefault();if(mfaBusy)return;setMfaBusy(true);const epoch=mfaEpoch;
 try{
  await mfa.verify($("mfa-factor").value,$("mfa-code").value.trim());if(epoch!==mfaEpoch)return;
  $("mfa-code").value="";$("mfa-qr").removeAttribute("src");$("mfa-secret").textContent="";$("mfa-enrollment").classList.add("hidden");
  if(mfaJob)await mfaJob;
  await checkMfaAccess();
  if(epoch===mfaEpoch&&!state.user)$("mfa-message").textContent="Code bestätigt, aber Sitzung noch nicht freigegeben. Bitte abmelden und neu anmelden.";
 }catch(e){if(epoch===mfaEpoch)$("mfa-message").textContent=e.message;}
 finally{if(epoch===mfaEpoch)setMfaBusy(false);}
};
$("mfa-retry").onclick=()=>checkMfaAccess();
$("mfa-signout").onclick=async()=>{if(mfaBusy)return;try{const {error}=await db.auth.signOut({scope:"local"});if(error)throw error;}catch{ $("mfa-message").textContent="Abmelden fehlgeschlagen. Bitte erneut versuchen."; }};
const authError=new URLSearchParams(location.hash.slice(1)).get("error_code");
if(authError){recovery.open();recoveryUI.message("Der Link ist ungültig oder abgelaufen. Fordere einen E-Mail-Code an.");history.replaceState(null,"",location.pathname+location.search);}

$("signout").addEventListener("click",async()=>{try{const {error}=await db.auth.signOut();if(error)throw error;showApp(null);}catch(e){fail(e)}});
function nav(view){if(view==="admin"&&!state.isAdmin)return;state.view=view;state.filter=view==="tasks"?"open":"all";state.search="";document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));render();if(view==="dashboard"&&state.user)refreshCareerChallenges(state.user.id);}
document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>nav(b.dataset.view)));
function chip(value,extra){return '<span class="pill '+(extra||"")+'">'+esc(value)+"</span>";}
function row(e){let meta=chip(company(e.company_id),"gold")+chip(e.kind==="note"?"Notiz":"Aufgabe");
if(e.kind==="task"&&e.project_id)meta+=chip("📁 "+features.projectName(e.project_id),"");
if(e.kind==="task")meta+=chip(e.status==="done"?"Erledigt":overdue(e)?"Überfällig":"Offen",e.status==="done"?"green":overdue(e)?"red":"");
if(e.priority==="high")meta+=chip("Dringend","red");
return '<article class="item"><div class="meta">'+meta+"</div><h3>"+esc(e.title)+"</h3>"+(e.description?"<p>"+esc(e.description)+"</p>":"")+'<div class="meta">'+(e.due_at?"<span>📅 Fällig: "+esc(fmt(e.due_at))+"</span>":"")+(e.remind_at?"<span>🔔 Erinnerung: "+esc(fmt(e.remind_at))+"</span>":"")+'</div><div class="actions"><button data-edit="'+e.id+'">Bearbeiten / Dateien</button>'+(e.kind==="note"?'<button data-convert="'+e.id+'">Als Aufgabe</button>':'<button data-status="'+e.id+'">'+(e.status==="done"?"Wieder öffnen":"Erledigen")+"</button>")+'<button class="danger" data-delete="'+e.id+'">Löschen</button></div></article>';}
function list(items,empty){return items.length?items.map(row).join(""):'<div class="empty">'+esc(empty||"Keine Einträge vorhanden.")+"</div>";}
function metric(t,n,h){return '<div class="metric '+(h||"")+'"><strong>'+n+"</strong><span>"+esc(t)+"</span></div>";}
async function refreshCareerChallenges(uid){
 const request=++challengeRequest;
 try{const rows=await readCareerEvents(db,uid);if(state.user?.id!==uid||request!==challengeRequest)return;challengeEvents=rows;challengeReady=true;}catch(e){if(state.user?.id!==uid||request!==challengeRequest)return;challengeEvents=[];challengeReady=false;console.warn("Karriere-Herausforderungen",e);}
 if(state.view==="dashboard"){const tile=document.getElementById("tp21-daily-challenges");if(tile)tile.outerHTML=dailyChallengeMarkup(challengeEvents,uid,challengeReady);}
}
function dashboard(){const a=active(),next=[...a].sort((a,b)=>(a.due_at||"9999").localeCompare(b.due_at||"9999"));return careerCard(state.gameProfile)+dailyChallengeMarkup(challengeEvents,state.user.id,challengeReady)+'<div class="cards">'+metric("Offene Aufgaben",a.length)+metric("Heute fällig",a.filter(today).length,"highlight")+metric("Überfällig",a.filter(overdue).length)+metric("Firmen",state.companies.length)+'</div><div class="panel"><h2>Deine nächsten Aufgaben</h2>'+list(next.slice(0,10),"Alles erledigt! Erstelle deine erste Aufgabe.")+"</div>";}
function entries(kind){let data=state.entries.filter(e=>e.kind===kind);
if(kind==="task"&&features.taskCompany)data=data.filter(e=>e.company_id===features.taskCompany);
if(kind==="task"&&features.taskProject)data=data.filter(e=>
 features.taskProject==="__none__"?!e.project_id:e.project_id===features.taskProject
);
data=data.filter(e=>(e.title+" "+e.description+" "+company(e.company_id)+" "+(e.project_id?features.projectName(e.project_id):"")).toLowerCase().includes(state.search.toLowerCase()));
if(kind==="task"&&state.filter!=="all")data=data.filter(e=>state.filter==="overdue"?overdue(e):e.status===state.filter);
data.sort((a,b)=>(a.due_at||"9999").localeCompare(b.due_at||"9999"));
return '<div class="toolbar tp-task-filter-toolbar">'+(kind==="task"?'<select id="task-company-filter" aria-label="Firma auswählen">'+features.optionCompanies(features.taskCompany,"Alle Firmen")+'</select><select id="task-project-filter" aria-label="Projekt auswählen">'+features.projectOptions(features.taskCompany,features.taskProject)+'</select>':'')+'<input id="search" placeholder="Titel, Firma oder Beschreibung suchen" value="'+esc(state.search)+'">'+(kind==="task"?'<select id="status-filter"><option value="all">Alle Status</option><option value="open">Offen</option><option value="done">Erledigt</option><option value="overdue">Überfällig</option></select>':"")+'<span class="counter">'+data.length+" Einträge</span></div>"+list(data);}
function solutionResults(){
 const term=state.search.toLowerCase().trim();
 const filtered=state.solutions.filter(s=>(s.problem_title+" "+s.problem_description+" "+s.solution_text+" "+s.company_name).toLowerCase().includes(term));
 return '<div class="panel"><h2>📖 Lösungsdatenbank</h2><p>Hier findest du dokumentierte Problemlösungen aus bereits erledigten Aufgaben.</p>'+
 '<input id="search" type="search" aria-label="Lösungen durchsuchen" placeholder="Problem, Fehlermeldung oder Lösungsbegriff suchen …" value="'+esc(state.search)+'">'+
 '<p class="counter" style="margin-top:10px">'+filtered.length+' Lösungen gefunden</p></div>'+
 (filtered.length?filtered.map(s=>'<article class="item"><div class="meta"><span class="pill gold">'+esc(s.company_name||"Ohne Firma")+'</span><span>'+esc(fmt(s.updated_at))+'</span></div>'+
 '<h3>'+esc(s.problem_title)+'</h3><p class="muted">Erstellt von: '+memberLabel(s.owner_id,state.members?.find(m=>m.user_id===s.owner_id)?.display_name||"Ehemaliger Mitarbeiter")+'</p>'+
 (s.problem_description?'<p><strong>Problembeschreibung:</strong> '+esc(s.problem_description)+'</p>':'')+
 '<div style="border-left:3px solid #e2af48;padding:12px;background:#242630;border-radius:9px"><strong>✔ Lösung</strong><p style="margin:8px 0 0;white-space:pre-wrap">'+esc(s.solution_text)+'</p></div>'+
 solutionDeleteButton(s,state.isAdmin,esc)+'</article>').join(""):'<div class="empty">Noch keine passende Lösung gefunden. Erledige eine Aufgabe und dokumentiere ihre Lösung.</div>');
}
function toggleSolutionFields(){
 const enabled=$("solution-save-to-library").checked;
 $("solution-fields").classList.toggle("hidden",!enabled);
 $("solution-skip-note").classList.toggle("hidden",enabled);
 $("solution-text").required=enabled;
 $("solution-confirm").textContent=enabled?"Erledigen & Lösung speichern":"Nur erledigen";
}
$("solution-save-to-library").addEventListener("change",()=>{
 toggleSolutionFields();
 if($("solution-save-to-library").checked)$("solution-text").focus();
});
function openResolution(entry){
 if(!entry)return;
 $("solution-entry-id").value=entry.id;
 $("solution-problem-title").textContent=entry.title;
 $("solution-problem-description").textContent=entry.description||"";
 const previousSolution=state.solutions.find(s=>s.source_entry_id===entry.id);
 $("solution-text").value=previousSolution?.solution_text||"";
 $("solution-save-to-library").checked=!!previousSolution;
 toggleSolutionFields();
 $("solution-dialog").showModal();
}
function companies(){return '<div class="toolbar"><button id="new-company" class="primary">+ Firma anlegen</button><span class="counter">'+state.companies.length+' gemeinsame Firmen</span></div><div class="grid2">'+(state.companies.map(c=>'<article class="item"><h3 class="company-badge">'+esc(c.name)+'</h3><p class="muted">'+esc(c.contact||"")+(c.email?" · "+esc(c.email):"")+'</p><p>'+esc(c.phone||"")+'</p><span class="counter">'+state.entries.filter(e=>e.company_id===c.id&&e.kind==="task"&&e.status==="open").length+' eigene offene Aufgaben</span><div class="actions">'+((state.isAdmin||c.owner_id===state.user.id)?'<button data-company-edit="'+c.id+'">Bearbeiten</button>':'')+(state.isAdmin?'<button data-company-delete="'+c.id+'" class="danger">Löschen</button>':'')+'</div></article>').join("")||'<div class="empty">Noch keine Firma angelegt.</div>')+"</div>";}
function invitePanel(){
 const admin=state.isAdmin?
 '<div class="panel"><h2>Benutzer einladen</h2><p>Nur du als Administrator kannst weitere Personen freischalten. Erstelle einen persönlichen Aktivierungscode und übergib ihn vertraulich. Neue Konten erhalten die Mitarbeiterrolle.</p>'+
 '<form id="invite-form"><label>Vor- und Nachname<input id="invite-name" required maxlength="120" autocomplete="off"></label><label>E-Mail-Adresse des neuen Benutzers<input type="email" id="invite-email" required autocomplete="off" placeholder="person@firma.at"></label><button class="primary" type="submit">Aktivierungscode erstellen</button></form>'+
 (state.inviteLink?'<div class="warning" style="margin-top:18px"><strong>Aktivierungscode erstellt</strong><p>Nur privat an die eingeladene Person übergeben. Der Code ist einmalig gültig.</p><input type="text" id="invite-share-link" readonly value="'+esc(state.inviteLink)+'"><button type="button" class="subtle" id="copy-invite-link" style="margin-top:10px">Aktivierungscode kopieren</button><button type="button" id="clear-invite-code">Code ausblenden</button></div>':'')+
 '<h3 style="margin-top:24px">Bisherige Einladungen</h3>'+
 (state.invites.length?state.invites.map(i=>'<p class="muted">'+esc(i.email)+' · '+esc(i.status==="sent"?"Gesendet":i.status==="pending"?"In Bearbeitung":"Fehlgeschlagen")+' · '+esc(fmt(i.created_at))+'</p>').join(""):'<p class="muted">Noch keine Einladungen</p>')+
 '</div>':"";

 return admin;
}
function settings(){
 const own='<div class="panel"><h2>Dein Konto</h2><p class="muted">'+esc(state.user?.email||"")+
 '</p><p>Deine Firmen und Aufgaben sind durch Benutzerrechte geschützt. Neue Konten erhalten nur eingeladene Personen.</p></div>';
 const password='<div class="panel"><h2>Passwort festlegen oder ändern</h2><p>Nach der ersten Einladung hier dein Passwort erstellen. Das geht nur nach erfolgreicher Anmeldung über den Einladungslink.</p><form id="password-form"><label>Neues Passwort<input id="new-password" type="password" autocomplete="new-password" minlength="8" required></label><button class="subtle" type="submit">Passwort speichern</button></form></div>';
 const permission=typeof Notification==="undefined"?"Nicht unterstützt":Notification.permission==="granted"?"Erlaubt":Notification.permission==="denied"?"Blockiert":"Noch nicht erlaubt";
 const reminder='<div class="panel"><h2>🔔 Hintergrund-Push-Benachrichtigungen</h2>'+
 '<p>Erinnerungen werden im Hintergrund über Supabase versendet – auch wenn RHTFLOW geschlossen ist. Die Prüfung erfolgt ungefähr einmal pro Minute.</p>'+
 '<p class="muted">Browserberechtigung: <strong>'+esc(permission)+'</strong> · Hinterlegte Geräte: '+state.pushSubs.length+'</p>'+
 '<div class="settings-actions"><button class="primary" id="enable-notifications">Push auf diesem Gerät aktivieren</button>'+
 '<button class="subtle" id="test-notification">Echten Push testen</button><button class="subtle" id="disable-push">Auf diesem Gerät deaktivieren</button></div>'+
 '<p class="install-tip">iPhone: zuerst RHTFLOW über Safari zum Home-Bildschirm hinzufügen und die installierte App öffnen. Danach hier Push aktivieren.</p></div>';
 const install='<div class="panel"><h2>Als App installieren</h2><p>Auf iPhone: Safari → Teilen → Zum Home-Bildschirm. Auf Android: Chrome → App installieren.</p><button class="primary" id="install-app">App installieren</button><p class="install-tip">RHTFLOW – Zugang nur per Einladung</p></div>';
 const backup='<div class="panel"><h2>Datensicherung</h2><p>Firmen und Aufgaben als JSON sichern.</p><button class="subtle" id="export-json">Daten exportieren</button></div>';
 return own+'<div class="panel"><h2>Persönliches Menü</h2><p>Reihenfolge ändern, Menüpunkte aus- und wieder einblenden.</p><button type="button" id="tp-settings-menu" class="primary">Menü anpassen</button></div>'+password+reminder+install+backup;
}
function render(){if(!state.user)return;profile.render();if(state.view==="admin"&&!state.isAdmin)state.view="dashboard";ticketCenter.setMenuVisible(state.view==="tickets");document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===state.view));const names={dashboard:"Übersicht",career:"Karriere",tickets:"Tickets",statistics:"Statistikcenter",admin:"Benutzerverwaltung",tasks:"Aufgaben",notes:"Notizen",solutions:"Lösungen",projects:"Projekte",documents:"Word-Dokumente",companies:"Firmen",settings:"Einstellungen"};
$("page-title").textContent=names[state.view];const menuArt=$("page-menu-art");if(menuArt&&Object.hasOwn(names,state.view)){const src="./icons/hd-"+state.view+".svg";if(menuArt.getAttribute("src")!==src)menuArt.src=src;}$("new-entry").style.display=["settings","solutions","projects","documents","career","tickets","statistics","admin"].includes(state.view)?"none":"block";
// Keep the actual dialog DOM, including editor selection and FileList, during background refresh.
if(state.view==="tickets"&&ticketCenter.hasOpenDialog()){applyMenu(document,menuPrefs,state.isAdmin,state.view);return;}
$("content").innerHTML=state.view==="dashboard"?dashboard():state.view==="career"?careerPage(state.gameProfile,state.gameEvents,esc,fmt,trophyCabinet(trophyItems,trophyFilter,trophyCategory,trophyFavorites,trophyError,trophySound)+ticketAwardsPanel(state.ticketAwards,state.closedTickets)+careerChallengeMarkup(challengeEvents,state.user.id,challengeReady)+showcaseMarkup()):state.view==="admin"?adminCenter.page():["tickets","statistics"].includes(state.view)?ticketCenter.page(state.view):state.view==="tasks"?entries("task"):state.view==="notes"?entries("note"):state.view==="solutions"?solutionResults():state.view==="projects"?features.projectsPage():state.view==="documents"?features.documentsPage():state.view==="companies"?companies():settings();
if(state.view==="career"){bindTrophies();bindShowcases();syncShowcases();}
if(state.view==="tickets"){const deep=new URLSearchParams(location.search).get("ticket");ticketCenter.open(deep||"");if(deep){const url=new URL(location.href);url.searchParams.delete("ticket");history.replaceState(null,"",url)}}
if(state.view==="statistics")ticketCenter.open();
if(state.view==="admin")adminCenter.open();
applyMenu(document,menuPrefs,state.isAdmin,state.view);
if($("tp-settings-menu"))$("tp-settings-menu").onclick=()=>{if(menuReady)menuEditor.open(menuPrefs);else {notice("Menüeinstellungen konnten noch nicht geladen werden.");load().catch(fail);}};
const search=$("search");if(search)search.addEventListener("input",e=>{state.search=e.target.value;const pos=e.target.selectionStart;render();const n=$("search");n?.focus();n?.setSelectionRange(pos,pos);});
const filter=$("status-filter");if(filter){filter.value=state.filter;filter.addEventListener("change",e=>{state.filter=e.target.value;render()})}
const firmFilter=$("task-company-filter");if(firmFilter){firmFilter.value=features.taskCompany;firmFilter.addEventListener("change",e=>{
 features.taskCompany=e.target.value;
 if(features.taskProject!=="__none__"&&features.taskProject&&!state.projects.some(p=>p.id===features.taskProject&&(!features.taskCompany||p.company_id===features.taskCompany)))features.taskProject="";
 state.filter="open";render();
 });}
const projectFilter=$("task-project-filter");if(projectFilter){projectFilter.value=features.taskProject;projectFilter.addEventListener("change",e=>{
 features.taskProject=e.target.value;render();
 });}
}
function openCompany(c){$("company-id").value=c?.id||"";$("company-name").value=c?.name||"";$("company-contact").value=c?.contact||"";$("company-phone").value=c?.phone||"";$("company-email").value=c?.email||"";$("company-editor").showModal();}
const taskProjectSelector=createTaskProjectSelector({
 db,
 companySelect:$("entry-company"),
 kindSelect:$("entry-kind"),
 projectSelect:$("entry-project"),
 projectField:$("entry-project-field"),
 hint:$("entry-project-hint"),
 ownerId:()=>state.user?.id,
 submitButton:$("entry-form").querySelector('button.primary'),
 onError:fail
});
const duePresets=installDueDatePresets(document);
function openEntry(e){
 if(!state.companies.length){nav("companies");notice("Bitte zuerst eine Firma anlegen.");return;}
 const x=e||{};
 $("entry-id").value=x.id||"";
 $("entry-kind").value=x.kind||"task";
 $("entry-title").value=x.title||"";
 $("entry-description").value=x.description||"";
 $("entry-company").innerHTML=state.companies.map(c=>'<option value="'+c.id+'">'+esc(c.name)+"</option>").join("");
 $("entry-company").value=x.company_id||state.companies[0].id;
 taskProjectSelector.refresh(x.project_id||"");
 $("entry-priority").value=x.priority||"normal";
 $("entry-status").value=x.status||"open";
 $("entry-due").value=inDate(x.due_at);
 $("entry-remind").value=inDate(x.remind_at);
 duePresets.sync();
 $("entry-heading").textContent=x.id?"Eintrag bearbeiten":"Neuen Eintrag erstellen";
 features.setEntryAttachments(x.id||null);
 $("editor").showModal();
}
$(`entry-company`).addEventListener("change",()=>taskProjectSelector.refresh());
$(`entry-kind`).addEventListener("change",()=>taskProjectSelector.refresh($("entry-project").value));
$("new-entry").addEventListener("click",()=>openEntry());
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>b.closest("dialog").close()));
$("content").addEventListener("click",async event=>{const b=event.target.closest("button");if(!b)return;try{
if("openCareer" in b.dataset){nav("career");return;}
if(b.id==="tp-enter-prestige"){openPrestigeDialog();return;}
if(b.id==="new-company")return openCompany();
if(b.dataset.edit)return openEntry(state.entries.find(e=>e.id===b.dataset.edit));
if(b.dataset.convert)return openEntry({...state.entries.find(e=>e.id===b.dataset.convert),kind:"task"});
if(b.dataset.companyEdit)return openCompany(state.companies.find(c=>c.id===b.dataset.companyEdit));
if(b.dataset.solutionDelete){
 const solution=state.solutions.find(s=>s.id===b.dataset.solutionDelete);
 if(!state.isAdmin||!solution||b.disabled)return;
 b.disabled=true;
 try{
  const removed=await deleteSolution({db,solution,isAdmin:state.isAdmin,confirmDelete:message=>confirm(message)});
  if(removed){notice("Lösung wurde gelöscht.");await load();}
 }finally{b.disabled=false;}
 return;
}
if(b.dataset.companyDelete){const c=state.companies.find(x=>x.id===b.dataset.companyDelete);if(!state.isAdmin||!c||!confirm("Gemeinsame Firma "+c.name+" löschen? Nur unbenutzte Firmen können gelöscht werden."))return;const {data,error}=await db.from("tp_companies").delete().eq("id",c.id).select("id");if(error?.code==="23503")return notice("Firma wird noch in Aufgaben, Projekten oder Tickets verwendet und kann nicht gelöscht werden.");if(error)throw error;if(!data?.length)return notice("Firma konnte nicht gelöscht werden.");return await load();}
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
if(b.id==="clear-invite-code"){state.inviteLink=null;render();return;}
if(b.id==="copy-invite-link"){
 if(!state.isAdmin||!state.inviteLink)return;
 await navigator.clipboard.writeText(state.inviteLink);
 notice("Aktivierungscode kopiert. Nur privat weitergeben.");
 return;
}
if(b.id==="enable-notifications")return await enablePush();
if(b.id==="test-notification")return await testPush();
if(b.id==="disable-push")return await disablePush();
if(b.id==="install-app"){if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;}else notice("Im Browsermenü App installieren / Zum Home-Bildschirm wählen.");}
if(b.id==="export-json"){const json=JSON.stringify({exported_at:new Date().toISOString(),companies:state.companies,entries:state.entries},null,2),url=URL.createObjectURL(new Blob([json],{type:"application/json"})),a=document.createElement("a");a.href=url;a.download="trummplaner-backup-"+new Date().toISOString().slice(0,10)+".json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}catch(e){fail(e)}});
$("content").addEventListener("submit",async event=>{
 if(event.target.id==="invite-form"){
  event.preventDefault();
  if(!state.isAdmin)return notice("Keine Administratorberechtigung.");
  const name=$("invite-name").value.trim(),email=$("invite-email").value.trim().toLowerCase(),btn=event.target.querySelector('button[type="submit"]');
  btn.disabled=true;
  try{
   const {data:{session}}=await db.auth.getSession();
   if(!session?.access_token)throw new Error("Bitte neu anmelden.");
   const res=await fetch(cfg.supabaseUrl+"/functions/v1/tp-activation-invite",{
    method:"POST",
    headers:{"content-type":"application/json","apikey":cfg.supabasePublishableKey,"authorization":"Bearer "+session.access_token},
    body:JSON.stringify({email,name})
   });
   const body=await res.json().catch(()=>({error:"Ungültige Serverantwort"}));
   if(!res.ok)throw new Error(body.error||"Einladung fehlgeschlagen (HTTP "+res.status+")");
   state.inviteLink=typeof body.code==="string"?body.code:null;
   notice("Aktivierungscode für "+email+" erstellt. Bitte vertraulich weitergeben.");
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
$("tp-prestige-cancel").addEventListener("click",closePrestigeDialog);
$("tp-prestige-dialog").addEventListener("cancel",event=>{event.preventDefault();closePrestigeDialog();});
$("tp-prestige-confirm").addEventListener("click",async()=>{
 const button=$("tp-prestige-confirm");
 button.disabled=true;
 try{
  const before=playerRank(state.gameProfile);
  if(!before.ready)throw new Error("Prestige ist noch nicht freigeschaltet.");
  const {error}=await db.rpc("tp_game_enter_prestige");
  if(error)throw error;
  closePrestigeDialog();
  await load();
  const after=playerRank(state.gameProfile);
  notice(after.stage==="master"?
   "👑 Prestige-Meister freigeschaltet! Dein Weg bis Level 1000 beginnt.":
   "✦ Prestige "+after.prestige+" erreicht! Du startest wieder bei Level 1.");
 }catch(e){fail(e)}
 finally{button.disabled=false;}
});
$("solution-form").addEventListener("submit",async event=>{
 event.preventDefault();
 const entryId=$("solution-entry-id").value;
 const saveSolution=$("solution-save-to-library").checked;
 const solution=$("solution-text").value.trim();
 if(saveSolution&&solution.length<3)return notice("Bitte mindestens drei Zeichen für die Lösung eingeben.");
 const lastXpEventId=state.gameEvents[0]?.id||0;
 const submit=event.target.querySelector('button[type="submit"]');
 submit.disabled=true;
 try{
  if(saveSolution){
   const {error}=await db.rpc("tp_complete_task",{p_entry_id:entryId,p_solution:solution});
   if(error)throw error;
  }else{
   const {data,error}=await db.from("tp_entries")
    .update({status:"done",updated_at:new Date().toISOString()})
    .eq("id",entryId).eq("owner_id",state.user.id).eq("kind","task")
    .select("id").single();
   if(error)throw error;
   if(!data)throw new Error("Aufgabe wurde nicht gefunden.");
  }
  $("solution-dialog").close();
  await load();
  showTaskXp(entryId,lastXpEventId);
  notice(saveSolution
   ?"Aufgabe erledigt. Die Lösung ist jetzt in der Lösungsdatenbank durchsuchbar."
   :"Aufgabe erledigt – keine neue Lösung gespeichert.");
 }catch(err){fail(err)}
 finally{submit.disabled=false;}
});
$("company-form").addEventListener("submit",async event=>{event.preventDefault();const id=$("company-id").value,values={name:$("company-name").value.trim(),contact:$("company-contact").value.trim(),phone:$("company-phone").value.trim(),email:$("company-email").value.trim()};try{const r=id?await db.from("tp_companies").update(values).eq("id",id).select("id"):await db.from("tp_companies").insert({...values,owner_id:state.user.id}).select("id");if(r.error)throw r.error;if(!r.data?.length)throw new Error("Keine Berechtigung, diese Firma zu ändern.");$("company-editor").close();await load();notice("Firma gespeichert.");}catch(e){fail(e)}});
$("entry-form").addEventListener("submit",async event=>{event.preventDefault();const lastXpEventId=state.gameEvents[0]?.id||0;const id=$("entry-id").value,kind=$("entry-kind").value,values={owner_id:state.user.id,company_id:$("entry-company").value,title:$("entry-title").value.trim(),description:$("entry-description").value,priority:$("entry-priority").value,status:$("entry-status").value,kind,project_id:kind==="task"?($("entry-project").value||null):null,due_at:kind==="note"?null:iso($("entry-due").value),remind_at:kind==="note"?null:iso($("entry-remind").value),reminder_sent_at:null,updated_at:new Date().toISOString()};if(values.remind_at&&!values.due_at)return notice("Bitte einen Fälligkeitstermin auswählen.");try{const r=id?await db.from("tp_entries").update(values).eq("id",id):await db.from("tp_entries").insert(values);if(r.error)throw r.error;$("editor").close();await load();if(kind==="task"&&values.status==="done")showTaskXp(id||state.gameEvents[0]?.entry_id,lastXpEventId);notice("Eintrag gespeichert.");}catch(e){fail(e)}});
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();installPrompt=e;});
window.addEventListener("appinstalled",()=>{installPrompt=null;notice("RHTFLOW installiert.");});
const pushEndpoint=cfg.supabaseUrl+"/functions/v1/tp-background-push";
function decodeBase64Url(input){
 const value=input.replace(/-/g,"+").replace(/_/g,"/");
 const raw=atob(value+"=".repeat((4-value.length%4)%4));
 return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
async function callPushApi(action){
 const {data:{session},error}=await db.auth.getSession();
 if(error||!session?.access_token)throw new Error("Bitte erneut anmelden.");
 const res=await fetch(pushEndpoint,{method:"POST",headers:{"Content-Type":"application/json","apikey":cfg.supabasePublishableKey,"Authorization":"Bearer "+session.access_token},body:JSON.stringify({action})});
 const result=await res.json().catch(()=>({error:"Keine gültige Serverantwort"}));
 if(!res.ok)throw new Error(result.error||"Push-Dienst meldet HTTP "+res.status);
 return result;
}
async function enablePush(){
 if(!("serviceWorker" in navigator)||!("PushManager" in window)||!("Notification" in window))throw new Error("Dein Browser unterstützt Web Push nicht.");
 const ios=/iPhone|iPad|iPod/.test(navigator.userAgent);
 const installed=window.matchMedia?.("(display-mode: standalone)").matches||navigator.standalone===true;
 if(ios&&!installed)throw new Error("Auf dem iPhone zuerst über Safari zum Home-Bildschirm hinzufügen und die installierte RHTFLOW-App öffnen.");
 const perm=await Notification.requestPermission();
 if(perm!=="granted")throw new Error("Benachrichtigungen sind nicht erlaubt. Bitte in den Browser-/Systemeinstellungen freigeben.");
 const reg=await navigator.serviceWorker.ready;
 const info=await fetch(pushEndpoint,{headers:{"apikey":cfg.supabasePublishableKey}}).then(r=>r.json());
 const configured=info.ready?info:await callPushApi("setup");
 const publicKey=configured.publicKey;
 if(!publicKey)throw new Error("Kein öffentlicher Push-Schlüssel verfügbar.");
 let subscription=await reg.pushManager.getSubscription();
 if(subscription){
  const key=subscription.options?.applicationServerKey;
  const existingKey=key?Array.from(new Uint8Array(key)):[];
  const wantedKey=Array.from(decodeBase64Url(publicKey));
  if(existingKey.length!==wantedKey.length||existingKey.some((x,i)=>x!==wantedKey[i])){
   await subscription.unsubscribe();
   subscription=null;
  }
 }
 if(!subscription)subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeBase64Url(publicKey)});
 const obj=subscription.toJSON();
 if(!obj.endpoint||!obj.keys?.auth||!obj.keys?.p256dh)throw new Error("Push-Gerätedaten sind unvollständig.");
 const infoDevice=(navigator.userAgent||"Browser").slice(0,220);
 const {error}=await db.from("tp_push_subscriptions").upsert({
  owner_id:state.user.id,endpoint:obj.endpoint,p256dh:obj.keys.p256dh,auth_secret:obj.keys.auth,device_name:infoDevice,updated_at:new Date().toISOString()
 },{onConflict:"endpoint"});
 if(error)throw error;
 await load();
 notice("Push für dieses Gerät aktiviert. Teste die Zustellung mit „Echten Push testen“.");
}
async function testPush(){
 if(!("Notification" in window)||Notification.permission!=="granted")throw new Error("Bitte Push auf diesem Gerät zuerst aktivieren.");
 const result=await callPushApi("test");
 notice(result.sent+" Push-Nachricht(en) an deine angemeldeten Geräte geschickt.");
}
async function disablePush(){
 if(!("serviceWorker" in navigator))throw new Error("Service Worker nicht verfügbar.");
 const reg=await navigator.serviceWorker.ready;
 const subscription=await reg.pushManager.getSubscription();
 if(!subscription)return notice("Auf diesem Gerät ist kein Push aktiviert.");
 const {error}=await db.from("tp_push_subscriptions").delete().eq("endpoint",subscription.endpoint);
 if(error)throw error;
 await subscription.unsubscribe();
 await load();
 notice("Hintergrund-Push auf diesem Gerät deaktiviert.");
}
setInterval(()=>{if(state.user&&!document.hidden&&navigator.onLine)load().catch(console.warn)},90000);
window.addEventListener("online",()=>state.user&&load().catch(console.warn));
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&state.user)load().catch(console.warn);});
db.auth.onAuthStateChange((event,session)=>{
 if(event==="SIGNED_OUT"){mfaEpoch++;showApp(null);mfaLoginScreen();setMfaBusy(false);}
 else if(session?.user){setTimeout(()=>checkMfaAccess(),0);}
});
features.init();
installDictation(document,window);
window.addEventListener("tp-refresh-view",()=>render());
checkMfaAccess();
setInterval(()=>{if(state.user&&!document.hidden)checkMfaAccess();},30000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&state.user)checkMfaAccess();});
if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js",{scope:"./",updateViaCache:"none"}).catch(console.warn);
