const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const slots={emblem:"Emblem",title:"Titel",banner:"Profilbanner",frame:"Profilrahmen",background:"Übersicht",stamp:"Stempel",effect:"Abschlusseffekt",color:"Namensfarbe",theme:"App-Design",comment:"Kommentarstil",menu:"Menüdesign",showcase:"Vitrinenobjekt",master:"Master-Paket"};
const rarities={common:"Gewöhnlich",rare:"Selten",epic:"Episch",legendary:"Legendär"};
const valid=r=>r&&Number.isInteger(r.season_id)&&r.season_id>0&&Number.isInteger(r.level)&&r.level>=1&&r.level<=30&&Object.hasOwn(slots,r.slot);
const items=rows=>(Array.isArray(rows)?rows:[]).filter(valid);
export function equippedRewards(rows){return Object.fromEntries(items(rows).filter(r=>r.equipped===true).map(r=>[r.slot,r]));}
export function inventoryMarkup(rows,ready=true){
 if(!ready)return '<section class="tp-ticket-panel"><h2>Inventar</h2><p>Belohnungen werden geladen oder sind gerade nicht verfügbar.</p><button type="button" data-inventory-refresh>Aktualisieren</button></section>';
 const list=items(rows),active=equippedRewards(list);
 const card=r=>'<article class="tp-bp-reward '+(Object.hasOwn(rarities,r.rarity)?r.rarity:"common")+' unlocked"><small>SEASON '+r.season_id+' · STUFE '+r.level+'</small><span class="tp-bp-glyph" aria-hidden="true">'+esc(r.glyph)+'</span><strong>'+esc(r.name)+'</strong><small>'+esc(slots[r.slot])+' · '+esc(rarities[r.rarity]||"")+'</small><button type="button" data-bp-equip="'+r.season_id+':'+r.level+'" data-bp-active="'+(r.equipped===true?'true':'false')+'">'+(r.equipped===true?'✓ Ablegen':'Ausrüsten')+'</button></article>';
 return '<section class="tp-bp tp-inventory"><div class="tp-bp-hero"><small>RHTFLOW · VICE CITY</small><h2>Mein Inventar</h2><p>'+list.length+' Belohnungen freigeschaltet · '+Object.keys(active).length+' ausgerüstet</p><button type="button" data-inventory-refresh>Aktualisieren</button></div><div class="tp-bp-section"><h3>Aktive Ausrüstung</h3>'+(Object.keys(active).length?'<div class="tp-inventory-active">'+Object.entries(active).map(([slot,r])=>'<span><small>'+esc(slots[slot])+'</small><b>'+esc(r.glyph)+' '+esc(r.name)+'</b></span>').join("")+'</div>':'<p>Du hast noch nichts ausgerüstet.</p>')+'</div><div class="tp-bp-section"><h3>Freigeschaltete Belohnungen</h3><p>Wähle je Kategorie eine Belohnung. Deine Auswahl wird geräteübergreifend gespeichert.</p>'+(list.length?'<div class="tp-bp-collection">'+list.map(card).join("")+'</div>':'<p>Erreiche die erste Battle-Pass-Stufe, um dein erstes Emblem freizuschalten.</p>')+'</div><div class="tp-bp-section"><small>Alle Belohnungen sind kosmetisch und nur für deine eigene App-Ansicht wirksam. Deine Trophäen und XP bleiben unverändert.</small></div></section>';
}
export async function readInventory(db){const {data,error}=await db.rpc("tp_bp_inventory");if(error)throw error;return items(data);}
export async function equipReward(db,season,level,equip){const {data,error}=await db.rpc("tp_bp_equip",{p_season:season,p_level:level,p_equip:equip});if(error)throw error;return items(data);}
const bodySlots=["frame","background","effect","color","theme","comment","menu","master"];
export function applyEquipment(doc,rows){
 const active=equippedRewards(rows),body=doc.body;
 for(const slot of bodySlots){const key="bp"+slot[0].toUpperCase()+slot.slice(1);if(active[slot])body.dataset[key]=String(active[slot].level);else delete body.dataset[key];}
 for(const el of doc.querySelectorAll(".tp-user-profile")){
  el.querySelector(".tp-equipped-cosmetics")?.remove();
  if(!Object.keys(active).length)continue;
  const info=el.querySelector(".tp-profile-info");if(!info)continue;
  const block=doc.createElement("div");block.className="tp-equipped-cosmetics";
  const master=active.master;
  const emblem=active.emblem||master,title=active.title||master,banner=active.banner||master,showcase=active.showcase;
  if(banner){const b=doc.createElement("span");b.className="tp-equipped-banner";b.dataset.reward=String(banner.level);b.textContent=banner.name;block.append(b);}
  if(emblem||title){const line=doc.createElement("span");line.className="tp-equipped-title";line.textContent=[emblem?.glyph,title?(title===master?"Vice City Elite":title.name):null].filter(Boolean).join(" ");block.append(line);}
  if(showcase){const medal=doc.createElement("span");medal.className="tp-equipped-showcase";medal.textContent=showcase.glyph+" "+showcase.name;block.append(medal);}
  if(block.childElementCount)info.append(block);
 }
}
export function cosmeticFeedback(doc,rows,kind){
 const active=equippedRewards(rows),reward=kind==="ticket-closed"?active.effect||active.master:kind==="comment"?active.stamp:null;
 if(!reward)return;
 const toast=doc.getElementById("toast");if(!toast)return;
 toast.classList.remove("tp-bp-flash");void toast.offsetWidth;toast.classList.add("tp-bp-flash");
 const mark=doc.createElement("span");mark.className="tp-bp-feedback";mark.textContent=" "+reward.glyph+" "+reward.name;toast.append(mark);
}
