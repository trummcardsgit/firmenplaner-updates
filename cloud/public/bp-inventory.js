import {rewardArtPath,rewardArtwork} from "./bp-art.js";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const slots={emblem:"Emblem",title:"Titel",banner:"Profilbanner",frame:"Profilrahmen",background:"Übersicht",stamp:"Stempel",effect:"Abschlusseffekt",color:"Namensfarbe",theme:"App-Design",comment:"Kommentarstil",menu:"Menüdesign",showcase:"Vitrinenobjekt",master:"Master-Paket"};
const rarities={common:"Gewöhnlich",rare:"Selten",epic:"Episch",legendary:"Legendär"};
const valid=r=>r&&Number.isInteger(r.season_id)&&r.season_id>0&&Number.isInteger(r.level)&&r.level>=1&&r.level<=30&&Object.hasOwn(slots,r.slot);
const items=rows=>(Array.isArray(rows)?rows:[]).filter(valid);
export function equippedRewards(rows){return Object.fromEntries(items(rows).filter(r=>r.equipped===true).map(r=>[r.slot,r]));}
const categories=[["banner","Visitenkarten"],["emblem","Embleme"],["title","Titel"],["frame","Profilrahmen"],["background","Hintergründe"],["theme","App-Designs"],["menu","Menüdesigns"],["color","Namensfarben"],["stamp","Stempel"],["effect","Abschlusseffekte"],["comment","Kommentarstile"],["showcase","Trophäen & Sammlerstücke"],["master","Master-Pakete"]];
export function normalizeInventoryCategory(category,rows){
 if(category==="all"||categories.some(([key])=>key===category))return category;
 const list=items(rows);return categories.find(([key])=>list.some(r=>r.slot===key))?.[0]||"banner";
}
export function inventoryRewardsMarkup(rows,name="Mein Profil",category="auto"){
 const list=items(rows),active=equippedRewards(list),selected=normalizeInventoryCategory(category,list),visible=selected==="all"?list:list.filter(r=>r.slot===selected);
 const options=[["all","Alle Belohnungen"],...categories];
 const card=r=>'<article class="tp-bp-reward '+(Object.hasOwn(rarities,r.rarity)?r.rarity:"common")+' unlocked"><small>SEASON '+r.season_id+' · STUFE '+r.level+'</small>'+(["banner","master"].includes(r.slot)?callingCardMarkup(name,r.slot==="master"?{master:r}:{...active,banner:r}):rewardArtwork(r))+'<strong>'+esc(r.name)+'</strong><small>'+esc(slots[r.slot])+' · '+esc(rarities[r.rarity]||"")+'</small><button type="button" data-bp-equip="'+r.season_id+':'+r.level+'" data-bp-active="'+(r.equipped===true?'true':'false')+'">'+(r.equipped===true?'✓ Ablegen':'Ausrüsten')+'</button></article>';
 return '<div class="tp-bp-section" id="tp-inventory-rewards"><h3>Freigeschaltete Belohnungen</h3><p>Wähle eine Kategorie und rüste deine Lieblingsbelohnung aus.</p><div class="tp-inventory-filter"><label for="tp-inventory-category">Kategorie</label><select id="tp-inventory-category" data-inventory-category>'+options.map(([key,label])=>'<option value="'+key+'"'+(key===selected?' selected':'')+'>'+esc(label)+' ('+(key==="all"?list.length:list.filter(r=>r.slot===key).length)+')</option>').join("")+'</select><small aria-live="polite">'+visible.length+' von '+list.length+' Belohnungen</small></div>'+(visible.length?'<div class="tp-bp-collection">'+visible.map(card).join("")+'</div>':'<p class="tp-inventory-empty">'+(list.length?'In dieser Kategorie hast du noch keine Belohnung freigeschaltet.':'Erreiche die erste Battle-Pass-Stufe, um dein erstes Emblem freizuschalten.')+'</p>')+'</div>';
}
export function inventoryMarkup(rows,ready=true,name="Mein Profil",category="auto"){
 if(!ready)return '<section class="tp-ticket-panel"><h2>Inventar</h2><p>Belohnungen werden geladen oder sind gerade nicht verfügbar.</p><button type="button" data-inventory-refresh>Aktualisieren</button></section>';
 const list=items(rows),active=equippedRewards(list);

 return '<section class="tp-bp tp-inventory"><div class="tp-bp-hero"><small>RHTFLOW · VICE CITY</small><h2>Mein Inventar</h2><p>'+list.length+' Belohnungen freigeschaltet · '+Object.keys(active).length+' ausgerüstet</p><button type="button" data-inventory-refresh>Aktualisieren</button></div><div class="tp-bp-section"><h3>Deine Visitenkarte</h3>'+callingCardMarkup(name,active)+'<h3>Aktive Ausrüstung</h3>'+(Object.keys(active).length?'<div class="tp-inventory-active">'+Object.entries(active).map(([slot,r])=>'<span><small>'+esc(slots[slot])+'</small><b>'+rewardArtwork(r,"tp-bp-active-art")+esc(r.name)+'</b></span>').join("")+'</div>':'<p>Du hast noch nichts ausgerüstet.</p>')+'</div>'+inventoryRewardsMarkup(list,name,category)+'<div class="tp-bp-section"><small>Visitenkarte, Titel, Emblem und Profilrahmen sind für aktive Kollegen sichtbar. App-Designs und Effekte bleiben persönlich. Deine Trophäen und XP bleiben unverändert.</small></div></section>';
}
export async function readInventory(db){const {data,error}=await db.rpc("tp_bp_inventory");if(error)throw error;return items(data);}
export async function equipReward(db,season,level,equip){const {data,error}=await db.rpc("tp_bp_equip",{p_season:season,p_level:level,p_equip:equip});if(error)throw error;return items(data);}
const artLevels=new Set([3,11,21,30]);
export function callingCardArt(level){return artLevels.has(Number(level))?Number(level):0;}
export function callingCardMarkup(name="Mein Profil",active={}){
 const banner=active.banner||active.master,title=active.title||active.master,emblem=active.emblem||active.master;
 return '<div class="tp-calling-card tp-premium-card" data-card-art="'+callingCardArt(banner?.level)+'" data-card-frame="'+(active.frame?.level|| (active.master?30:0))+'"><div class="tp-calling-text"><strong>'+esc(name||"Mein Profil")+'</strong>'+(title?'<span class="tp-calling-title">['+esc(title===active.master?"Vice City Elite":title.name)+']</span>':'')+'</div>'+(emblem?'<span class="tp-calling-emblem">'+rewardArtwork(emblem,"tp-calling-emblem-art")+'</span>':'')+'</div>';
}
const bodySlots=["frame","background","effect","color","theme","comment","menu","master"];
export function applyEquipment(doc,rows){
 const active=equippedRewards(rows),body=doc.body;
 const frame=[5,10,20].includes(active.frame?.level)?active.frame.level:active.master?30:0;
 for(const node of doc.querySelectorAll("[data-profile-picture],#tp-avatar-preview")){if(frame)node.dataset.memberFrame=String(frame);else delete node.dataset.memberFrame;}
 for(const slot of bodySlots){const key="bp"+slot[0].toUpperCase()+slot.slice(1);if(active[slot])body.dataset[key]=String(active[slot].level);else delete body.dataset[key];}
 for(const el of doc.querySelectorAll(".tp-user-profile")){
  el.querySelector(".tp-equipped-cosmetics")?.remove();
  const info=el.querySelector(".tp-profile-info"),name=info?.querySelector("[data-profile-name]");
  if(!info||!name)continue;
  info.querySelectorAll(".tp-calling-title,.tp-calling-emblem,.tp-equipped-showcase").forEach(n=>n.remove());
  const master=active.master,banner=active.banner||master,title=active.title||master,emblem=active.emblem||master;
  el.classList.add("tp-profile-calling-card","tp-premium-card");
  el.dataset.cardArt=String(callingCardArt(banner?.level));
  el.dataset.cardFrame=String(active.frame?.level||(master?30:0));
  if(title){const line=doc.createElement("span");line.className="tp-calling-title";line.textContent="["+(title===master?"Vice City Elite":title.name)+"]";name.after(line);}
  if(emblem){const mark=doc.createElement("span");mark.className="tp-calling-emblem";const src=rewardArtPath(emblem.level);if(src){const image=doc.createElement("img");image.className="tp-calling-emblem-art";image.src=src;image.alt=emblem.name;mark.append(image);}else mark.textContent=emblem.glyph;info.append(mark);}
  if(active.showcase){const medal=doc.createElement("span");medal.className="tp-equipped-showcase";const src=rewardArtPath(active.showcase.level);if(src){const image=doc.createElement("img");image.className="tp-bp-showcase-art";image.src=src;image.alt="";medal.append(image);}medal.append(doc.createTextNode(active.showcase.name));info.append(medal);}

 }
}
export function cosmeticFeedback(doc,rows,kind){
 const active=equippedRewards(rows),reward=kind==="ticket-closed"?active.effect||active.master:kind==="comment"?active.stamp:null;
 if(!reward)return;
 const toast=doc.getElementById("toast");if(!toast)return;
 toast.classList.remove("tp-bp-flash");void toast.offsetWidth;toast.classList.add("tp-bp-flash");
 const mark=doc.createElement("span");mark.className="tp-bp-feedback";mark.textContent=" "+reward.glyph+" "+reward.name;toast.append(mark);
}
