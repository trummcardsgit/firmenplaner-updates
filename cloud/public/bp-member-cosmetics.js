import {callingCardMarkup,equippedRewards,profileFrameLevel,applyFrameArt} from "./bp-inventory.js";
import {memberAvatarMarkup} from "./profile-avatar.js";
const allowed={banner:[3,11,21,30],title:[2,4,8,9,13,16,19,23,24,28],frame:[5,10,17,20,26,27]};
const valid=r=>r&&typeof r.owner_id==="string"&&r.owner_id.length>0&&Number.isInteger(r.season_id)&&r.season_id>0&&Object.hasOwn(allowed,r.slot)&&Number.isInteger(r.level)&&r.level>=1&&r.level<=30&&(r.season_id!==1||allowed[r.slot].includes(r.level))&&r.equipped===true&&typeof r.name==="string"&&typeof r.glyph==="string";
export function memberCosmeticsMap(rows){
 const map=new Map();for(const r of Array.isArray(rows)?rows:[]){if(!valid(r))continue;if(!map.has(r.owner_id))map.set(r.owner_id,[]);map.get(r.owner_id).push(r);}return new Map([...map].map(([id,items])=>[id,equippedRewards(items)]));
}
export function cosmeticTitle(active){return active?.title?.name||"";}
export function cosmeticFrame(active){return profileFrameLevel(active);}
export function paintMemberCosmetics(doc,map){
 for(const node of doc.querySelectorAll("[data-member-avatar]")){
  const frame=cosmeticFrame(map.get(node.dataset.memberAvatar));
  if(frame)node.dataset.memberFrame=String(frame);else delete node.dataset.memberFrame;applyFrameArt(node,map.get(node.dataset.memberAvatar));
 }
 for(const node of doc.querySelectorAll("[data-member-label]")){
  const name=node.querySelector("[data-member-name]");if(!name)continue;
  const title=cosmeticTitle(map.get(node.dataset.memberLabel));
  let tag=node.querySelector(".tp-member-title");
  if(!title){tag?.remove();continue;}
  if(!tag){tag=doc.createElement("span");tag.className="tp-member-title";name.after(tag);}
  const text="["+title+"]";if(tag.textContent!==text)tag.textContent=text;
 }
}
export function colleagueCardsMarkup(members,map,uid,ready=true){
 const others=(members||[]).filter(m=>m.active&&m.user_id!==uid).sort((a,b)=>String(a.display_name).localeCompare(String(b.display_name),"de"));
 return '<section id="tp-colleague-cards" class="tp-bp-section tp-colleague-cards"><h3>Visitenkarten der Kollegen</h3><p>Ausgerüstete Visitenkarten, Titel und Profilbildrahmen aller aktiven Mitarbeiter.</p><button type="button" data-inventory-refresh>Aktualisieren</button>'+(!ready?'<p>Visitenkarten konnten noch nicht geladen werden.</p>':others.length?'<div class="tp-colleague-card-grid">'+others.map(m=>'<article class="tp-colleague-card-row">'+memberAvatarMarkup(m.user_id,m.display_name)+callingCardMarkup(m.display_name,map.get(m.user_id)||{})+'</article>').join("")+'</div>':'<p>Keine weiteren aktiven Mitarbeiter vorhanden.</p>')+'</section>';
}
export function createMemberCosmetics({document,db,userId}){
 let map=new Map(),ready=false,epoch=0,request=0,scheduled=false;
 const paint=()=>paintMemberCosmetics(document,map);
 function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;paint();});}
 const observer=new document.defaultView.MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches("[data-member-label],[data-member-avatar]")||n.querySelector("[data-member-label],[data-member-avatar]")))))schedule();});
 observer.observe(document.body,{childList:true,subtree:true});
 async function refresh(){
  const uid=userId(),e=epoch,seq=++request;if(!uid)return false;
  try{const {data,error}=await db.rpc("tp_bp_member_cosmetics");if(e!==epoch||seq!==request||userId()!==uid)return false;if(error)throw error;map=memberCosmeticsMap(data);ready=true;paint();return true;}
  catch(error){if(e===epoch&&seq===request&&userId()===uid){ready=false;map=new Map();paint();console.warn("Kollegen-Cosmetics",error);}return false;}
 }
 function own(uid,rows){if(!uid)return;request++;const safe=memberCosmeticsMap((rows||[]).map(r=>({...r,owner_id:uid})));map.set(uid,safe.get(uid)||{});paint();}
 function reset(){epoch++;request++;map=new Map();ready=false;paint();}
 return {refresh,own,reset,paint,gallery:(members,uid)=>colleagueCardsMarkup(members,map,uid,ready)};
}
