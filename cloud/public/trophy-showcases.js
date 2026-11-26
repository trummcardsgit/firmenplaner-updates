import {memberLabel} from "./profile-avatar.js";
const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const rarities={bronze:"Bronze",silver:"Silber",gold:"Gold",platinum:"Platin"};
export function validFavorites(ids,items){
 return [...new Set(Array.isArray(ids)?ids:[])].filter(id=>Number.isInteger(id)&&id>=1&&id<=50&&items.some(t=>t.id===id&&t.unlocked_at)).slice(0,3);
}
export function showcasePanel(members=[],rows=[],catalog=[],uid="",error=false,loading=false){
 const others=members.filter(m=>m.active&&m.user_id!==uid).sort((a,b)=>String(a.display_name).localeCompare(String(b.display_name),"de"));
 const cards=others.map(m=>{
  const ids=rows.find(r=>r.owner_id===m.user_id)?.trophy_ids||[];
  const items=ids.slice(0,3).map(id=>catalog.find(t=>t.id===id&&Number.isInteger(id)&&id>=1&&id<=50&&Object.hasOwn(rarities,t.rarity))).filter(Boolean);
  return '<article class="tp-colleague-showcase"><h4>'+memberLabel(m.user_id,m.display_name)+'</h4><small>'+items.length+' / 3 Trophäen</small><div class="tp-trophy-showcase">'+[0,1,2].map(i=>{const t=items[i];return t?'<div class="'+t.rarity+'"><img width="96" height="96" loading="lazy" src="./icons/trophies/trophy-'+t.id+'.svg" alt=""><strong>'+escape(t.title)+'</strong><small>'+rarities[t.rarity]+'</small></div>':'<div class="empty-slot">☆<small>Freier Platz</small></div>'}).join("")+'</div></article>';
 }).join("");
 return '<section class="tp-game-panel tp-colleague-panel" id="tp-colleague-showcases"><div class="tp-game-panel-heading"><h3>🏆 Vitrinen der Kollegen</h3><span>TEAM SHOWCASE</span></div><p>Hier siehst du die bis zu drei Trophäen, die deine Kollegen selbst ausgewählt haben. Deine eigene Vitrine ist ebenfalls für aktive Mitarbeiter sichtbar.</p><button type="button" id="tp-showcase-refresh">Aktualisieren</button>'+(loading?'<p role="status">Vitrinen werden geladen …</p>':error?'<p role="alert">Vitrinen konnten nicht geladen werden. Bitte erneut versuchen.</p>':cards||'<p>Noch keine weiteren aktiven Mitarbeiter.</p>')+'</section>';
}
export async function readAllShowcases(db){
 const rows=[];
 for(let offset=0;;offset+=500){
  const {data,error}=await db.from("tp_trophy_showcases").select("owner_id,trophy_ids").order("owner_id").range(offset,offset+499);
  if(error)throw error;
  rows.push(...(data||[]));
  if((data||[]).length<500)return rows;
 }
}
