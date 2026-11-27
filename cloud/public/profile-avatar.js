import {playerRank} from "./game-progression.js";
export const AVATAR_MAX=96000;
export function validAvatar(value){return typeof value==="string"&&value.length<=AVATAR_MAX&&/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(value)?value:null;}
export function profileInfo(user,members,record){
 const name=String((members||[]).find(m=>m.user_id===user?.id)?.display_name||"").trim()||"Mein Profil";
 const initials=name.split(/\s+/).slice(0,2).map(s=>Array.from(s)[0]||"").join("").toLocaleUpperCase("de-AT");
 const rank=playerRank(record);
 return {name,initials,level:record===undefined?"Level …":"Level "+new Intl.NumberFormat("de-AT").format(rank.level)+(rank.stage==="master"?" · Prestige-Meister":rank.prestige>0?" · Prestige "+rank.prestige:"")};
}
export async function prepareAvatar(file){
 if(!file||!["image/jpeg","image/png","image/webp"].includes(file.type)||!file.size||file.size>10*1024*1024)throw new Error("Bitte ein JPG-, PNG- oder WEBP-Bild bis 10 MB auswählen.");
 const url=URL.createObjectURL(file),img=new Image();
 try{
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error("Bild konnte nicht gelesen werden."));img.src=url;});
  if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>40000000)throw new Error("Bild ist zu groß oder ungültig.");
  const canvas=document.createElement("canvas");canvas.width=canvas.height=256;
  const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Bildverarbeitung nicht verfügbar.");
  const side=Math.min(img.naturalWidth,img.naturalHeight);
  ctx.fillStyle="#241b33";ctx.fillRect(0,0,256,256);
  ctx.drawImage(img,(img.naturalWidth-side)/2,(img.naturalHeight-side)/2,side,side,0,0,256,256);
  for(const quality of [.88,.75,.60,.45,.30]){
   const data=validAvatar(canvas.toDataURL("image/jpeg",quality));if(data)return data;
  }
  throw new Error("Bild konnte nicht ausreichend verkleinert werden.");
 }finally{URL.revokeObjectURL(url);}
}
export function createProfile({document,db,userId,info,notice,onAvatarChange=()=>{},prepare=prepareAvatar}){
 const el=id=>document.getElementById(id),dialog=el("tp-avatar-dialog"),input=el("tp-avatar-file"),msg=el("tp-avatar-message"),preview=el("tp-avatar-preview"),save=el("tp-avatar-save"),remove=el("tp-avatar-remove");
 let avatar=null,draft=null,epoch=0,revision=0,busy=false,ready=false,reading=0;
 function paint(node,value,initials){
  node.replaceChildren();
  const src=validAvatar(value);
  if(src){const img=document.createElement("img");img.alt="";img.src=src;img.onerror=()=>{if(node.contains(img))node.textContent=initials;};node.append(img);}else node.textContent=initials;
 }
 function render(){
  const p=info();
  for(const node of document.querySelectorAll("[data-profile-name]"))node.textContent=p.name;
  for(const node of document.querySelectorAll("[data-profile-level]"))node.textContent=p.level;
  for(const node of document.querySelectorAll("[data-profile-picture]"))paint(node,avatar,p.initials);
 }
 function controls(){input.disabled=busy;save.disabled=busy||!draft;remove.disabled=busy||!ready||!avatar;el("tp-avatar-cancel").disabled=busy;}
 function reset(){epoch++;revision++;reading++;avatar=null;draft=null;ready=false;busy=false;input.value="";msg.textContent="";if(dialog.open)dialog.close();for(const n of document.querySelectorAll("[data-profile-picture],[data-profile-name],[data-profile-level]"))n.replaceChildren();preview.replaceChildren();controls();}
 async function load(uid){
  const e=epoch,r=revision,request=++reading;
  try{
   const {data,error}=await db.from("tp_profile_avatars").select("avatar").eq("owner_id",uid).maybeSingle();
   if(epoch!==e||revision!==r||reading!==request||userId()!==uid)return;
   if(error)throw error;
   avatar=validAvatar(data?.avatar);ready=true;render();if(dialog.open)controls();
  }catch{if(epoch===e&&revision===r&&reading===request&&userId()===uid){ready=false;if(dialog.open){msg.textContent="Profilbild konnte nicht geladen werden. Bitte erneut öffnen.";controls();}}}
 }
 function open(){
  if(!userId()||busy)return;
  draft=null;input.value="";msg.textContent="";paint(preview,avatar,info().initials);controls();
  if(!dialog.open)dialog.showModal();
  if(!ready)load(userId());
 }
 document.querySelectorAll("[data-profile-picture]").forEach(b=>b.onclick=open);
 input.onchange=async()=>{
  if(busy)return;
  draft=null;controls();const file=input.files?.[0];if(!file)return;
  const e=epoch,uid=userId();busy=true;controls();msg.textContent="Bild wird vorbereitet …";
  try{const result=await prepare(file);if(epoch!==e||userId()!==uid)return;draft=validAvatar(result);if(!draft)throw new Error("Ungültiges Bild.");paint(preview,draft,info().initials);msg.textContent="Vorschau · zum Übernehmen speichern.";}
  catch(err){if(epoch===e&&userId()===uid)msg.textContent=err.message||"Bild konnte nicht verarbeitet werden.";}
  finally{if(epoch===e&&userId()===uid){busy=false;controls();}}
 };
 async function persist(value){
  const uid=userId(),e=epoch;if(!uid||busy)return;
  busy=true;revision++;controls();msg.textContent="Wird gespeichert …";
  try{
   const table=db.from("tp_profile_avatars");
   const {data,error}=value?await table.upsert({owner_id:uid,avatar:value},{onConflict:"owner_id"}).select("avatar").single():await table.delete().eq("owner_id",uid).select("owner_id");
   if(error||value&&!validAvatar(data?.avatar))throw error||new Error("Speicherung nicht bestätigt");
   if(epoch!==e||userId()!==uid)return;
   avatar=value?validAvatar(data.avatar):null;draft=null;ready=true;render();onAvatarChange();dialog.close();notice(value?"Profilbild gespeichert.":"Profilbild entfernt.");
  }catch{if(epoch===e&&userId()===uid)msg.textContent="Profilbild konnte nicht gespeichert werden. Bitte erneut versuchen.";}
  finally{if(epoch===e&&userId()===uid){busy=false;controls();}}
 }
 el("tp-avatar-form").onsubmit=e=>{e.preventDefault();if(draft)persist(draft);};
 remove.onclick=()=>{if(!busy&&ready&&avatar&&globalThis.confirm("Profilbild entfernen?"))persist(null);};
 el("tp-avatar-cancel").onclick=()=>{if(!busy)dialog.close();};
 dialog.addEventListener("cancel",e=>{if(busy)e.preventDefault();});
 dialog.addEventListener("close",()=>{draft=null;input.value="";preview.replaceChildren();msg.textContent="";});
 return {render,reset,load,open};
}

const memberEscape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function memberAvatarMarkup(id,name){
 const label=String(name||"Unbekannt"),initials=label.trim().split(/\s+/).slice(0,2).map(s=>Array.from(s)[0]||"").join("").toLocaleUpperCase("de-AT")||"?";
 return '<span class="tp-member-avatar" aria-hidden="true" data-member-avatar="'+memberEscape(id||"")+'" data-initials="'+memberEscape(initials)+'">'+memberEscape(initials)+'</span>';
}
export function memberLabel(id,name){
 const label=String(name||"Unbekannt");
 return '<span class="tp-member-label" data-member-label="'+memberEscape(id||"")+'">'+memberAvatarMarkup(id,label)+'<span class="tp-member-identity"><span data-member-name>'+memberEscape(label)+'</span></span></span>';
}
export function createMemberAvatars({document,db,userId}){
 let cache=new Map(),painted=new WeakMap(),epoch=0,running=false,scheduled=false;
 const nodes=()=>[...document.querySelectorAll("[data-member-avatar]")];
 function paint(node,value){
  if(painted.has(node)&&painted.get(node)===value)return;
  painted.set(node,value);node.textContent=node.dataset.initials||"?";
  if(value){const img=document.createElement("img");img.alt="";img.loading="lazy";img.src=value;img.onerror=()=>{if(node.contains(img))node.textContent=node.dataset.initials||"?";};node.replaceChildren(img);}
 }
 function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;void sync();});}
 async function sync(){
  const uid=userId(),e=epoch;if(!uid||running)return;
  const current=()=>epoch===e&&userId()===uid;
  const visible=nodes();
  for(const node of visible)if(cache.has(node.dataset.memberAvatar))paint(node,cache.get(node.dataset.memberAvatar));
  const ids=[...new Set(visible.map(n=>n.dataset.memberAvatar).filter(id=>id&&!cache.has(id)))];
  if(!ids.length)return;
  running=true;
  try{
   for(let i=0;i<ids.length;i+=50){
    const batch=ids.slice(i,i+50);
    const {data,error}=await db.from("tp_profile_avatars").select("owner_id,avatar").in("owner_id",batch);
    if(!current())return;
    for(const id of batch)cache.set(id,null);
    if(!error)for(const row of data||[])if(batch.includes(row.owner_id))cache.set(row.owner_id,validAvatar(row.avatar));
   }
  }catch{if(current())for(const id of ids)if(!cache.has(id))cache.set(id,null);}
  finally{if(current()){running=false;schedule();}}
 }
 function reset(){epoch++;running=false;cache.clear();for(const node of nodes())paint(node,null);}
 function refresh(){reset();schedule();}
 const observer=new document.defaultView.MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches("[data-member-avatar]")||n.querySelector("[data-member-avatar]")))))schedule();});
 observer.observe(document.body,{childList:true,subtree:true});
 return {refresh,reset,sync};
}
