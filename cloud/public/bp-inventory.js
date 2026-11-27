import {rewardArtPath,rewardArtwork,artSource} from "./bp-art.js";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const slots={banner:"Visitenkarte",title:"Titel",showcase:"Trophäe",frame:"Profilbildrahmen"};
const rarities={common:"Gewöhnlich",rare:"Selten",epic:"Episch",legendary:"Legendär"};
const valid=r=>r&&Number.isInteger(r.season_id)&&r.season_id>0&&Number.isInteger(r.level)&&r.level>=1&&r.level<=30&&Object.hasOwn(slots,r.slot);
const items=rows=>(Array.isArray(rows)?rows:[]).filter(valid);
export function equippedRewards(rows){return Object.fromEntries(items(rows).filter(r=>r.equipped===true).map(r=>[r.slot,r]));}
const categories=[["banner","Visitenkarten"],["title","Titel"],["showcase","Trophäen"],["frame","Profilbildrahmen"]];
export function normalizeInventoryCategory(category,rows){
 if(categories.some(([key])=>key===category))return category;
 const list=items(rows);return categories.find(([key])=>list.some(r=>r.slot===key))?.[0]||"banner";
}
export function inventoryRewardsMarkup(rows,name="Mein Profil",category="auto",season="all"){
 const list=items(rows),active=equippedRewards(list),selected=normalizeInventoryCategory(category,list),visible=list.filter(r=>r.slot===selected&&(season==="all"||String(r.season_id)===String(season)));
 const options=categories;
 const card=r=>'<article class="tp-bp-reward '+(Object.hasOwn(rarities,r.rarity)?r.rarity:"common")+' unlocked"><small>SEASON '+r.season_id+' · STUFE '+r.level+'</small>'+(r.slot==="banner"?callingCardMarkup(name,{...active,banner:r}):rewardArtwork(r))+'<strong>'+esc(r.name)+'</strong><small>'+esc(slots[r.slot])+' · '+esc(rarities[r.rarity]||"")+'</small><button type="button" data-bp-equip="'+r.season_id+':'+r.level+'" data-bp-active="'+(r.equipped===true?'true':'false')+'">'+(r.equipped===true?'✓ Ablegen':'Ausrüsten')+'</button></article>';
 return '<div class="tp-bp-section" id="tp-inventory-rewards"><h3>Freigeschaltete Belohnungen</h3><p>Wähle eine Kategorie und rüste deine Lieblingsbelohnung aus.</p><div class="tp-inventory-filter"><label for="tp-inventory-category">Kategorie</label><select id="tp-inventory-category" data-inventory-category>'+options.map(([key,label])=>'<option value="'+key+'"'+(key===selected?' selected':'')+'>'+esc(label)+' ('+list.filter(r=>r.slot===key).length+')</option>').join("")+'</select><label for="tp-inventory-season">Season</label><select id="tp-inventory-season" data-inventory-season><option value="all">Alle Seasons</option>'+[...new Map(list.map(r=>[r.season_id,r.season||"Season "+r.season_id]))].map(([id,label])=>'<option value="'+id+'"'+(String(id)===String(season)?' selected':'')+'>'+esc(label)+'</option>').join("")+'</select><small aria-live="polite">'+visible.length+' von '+list.length+' Belohnungen</small></div>'+(visible.length?'<div class="tp-bp-collection">'+visible.map(card).join("")+'</div>':'<p class="tp-inventory-empty">'+(list.length?'In dieser Kategorie hast du noch keine Belohnung freigeschaltet.':'Erreiche die erste Battle-Pass-Stufe, um deine erste Belohnung freizuschalten.')+'</p>')+'</div>';
}
export function inventoryMarkup(rows,ready=true,name="Mein Profil",category="auto",season="all"){
 if(!ready)return '<section class="tp-ticket-panel"><h2>Inventar</h2><p>Belohnungen werden geladen oder sind gerade nicht verfügbar.</p><button type="button" data-inventory-refresh>Aktualisieren</button></section>';
 const list=items(rows),active=equippedRewards(list);

 return '<section class="tp-bp tp-inventory"><div class="tp-bp-hero"><small>RHTFLOW · SEASON-KOLLEKTION</small><h2>Mein Inventar</h2><p>'+list.length+' Belohnungen freigeschaltet · '+Object.keys(active).length+' ausgerüstet</p><button type="button" data-inventory-refresh>Aktualisieren</button></div><div class="tp-bp-section"><h3>Deine Visitenkarte</h3>'+callingCardMarkup(name,active)+'<h3>Aktive Ausrüstung</h3>'+(Object.keys(active).length?'<div class="tp-inventory-active">'+Object.entries(active).map(([slot,r])=>'<span><small>'+esc(slots[slot])+'</small><b>'+rewardArtwork(r,"tp-bp-active-art")+esc(r.name)+'</b></span>').join("")+'</div>':'<p>Du hast noch nichts ausgerüstet.</p>')+'</div>'+inventoryRewardsMarkup(list,name,category,season)+'<div class="tp-bp-section"><small>Visitenkarten, Titel und Profilbildrahmen sind für aktive Kollegen sichtbar. Trophäen können als Sammlerstück im eigenen Profil ausgestellt werden. Deine Karriere-XP bleiben unverändert.</small></div></section>';
}
export async function readInventory(db){const {data,error}=await db.rpc("tp_bp_inventory");if(error)throw error;return items(data);}
export async function equipReward(db,season,level,equip){const {data,error}=await db.rpc("tp_bp_equip",{p_season:season,p_level:level,p_equip:equip});if(error)throw error;return items(data);}
const artLevels=new Set([3,11,21,30]);
export function callingCardArt(level){return artLevels.has(Number(level))?Number(level):0;}
export function callingCardMarkup(name="Mein Profil",active={}){
 const banner=active.banner,title=active.title;const src=banner?.season_id!==1?artSource(banner):null;
 return '<div class="tp-calling-card tp-premium-card" data-card-art="'+callingCardArt(banner?.season_id>1?0:banner?.level)+'"'+(src?' style="--card-art:url(&quot;'+esc(src)+'&quot;)"':'')+' data-card-frame="'+profileFrameLevel(active)+'"><div class="tp-calling-text"><strong>'+esc(name||"Mein Profil")+'</strong>'+(title?'<span class="tp-calling-title">['+esc(title.name)+']</span>':'')+'</div>'+'</div>';
}
export function profileFrameLevel(active){return active?.frame?.season_id>1?31:[5,10,17,20,26,27].includes(active?.frame?.level)?active.frame.level:0;}
export function applyFrameArt(node,active){const src=active?.frame?.season_id>1?artSource(active.frame):null;if(src)node.style.setProperty('--bp-frame-art','url("'+src+'")');else node.style.removeProperty('--bp-frame-art');}
export function applyEquipment(doc,rows){
 const active=equippedRewards(rows),body=doc.body;
 const frame=profileFrameLevel(active);
 for(const node of doc.querySelectorAll("[data-profile-picture],#tp-avatar-preview")){if(frame)node.dataset.memberFrame=String(frame);else delete node.dataset.memberFrame;applyFrameArt(node,active);}
 for(const slot of ["frame","background","effect","color","theme","comment","menu","master"]){delete body.dataset["bp"+slot[0].toUpperCase()+slot.slice(1)];}
 for(const el of doc.querySelectorAll(".tp-user-profile")){
  el.querySelector(".tp-equipped-cosmetics")?.remove();
  const info=el.querySelector(".tp-profile-info"),name=info?.querySelector("[data-profile-name]");
  if(!info||!name)continue;
  info.querySelectorAll(".tp-calling-title,.tp-calling-emblem,.tp-equipped-showcase").forEach(n=>n.remove());
  const banner=active.banner,title=active.title;
  el.classList.add("tp-profile-calling-card","tp-premium-card");
  el.dataset.cardArt=String(callingCardArt(banner?.season_id>1?0:banner?.level));const src=banner?.season_id>1?artSource(banner):null;if(src)el.style.setProperty("--card-art",'url("'+src+'")');else el.style.removeProperty("--card-art");
  el.dataset.cardFrame=String(frame);
  if(title){const line=doc.createElement("span");line.className="tp-calling-title";line.textContent="["+title.name+"]";name.after(line);}
  if(active.showcase){const medal=doc.createElement("span");medal.className="tp-equipped-showcase";const src=artSource(active.showcase);if(src){const image=doc.createElement("img");image.className="tp-bp-showcase-art";image.src=src;image.alt="";medal.append(image);}medal.append(doc.createTextNode(active.showcase.name));info.append(medal);}

 }
}
