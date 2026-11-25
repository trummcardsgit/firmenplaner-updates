const rarities={bronze:"Bronze",silver:"Silber",gold:"Gold",platinum:"Platin"};
const categories={tasks:"Aufgaben",time:"Zeitmanagement",knowledge:"Wissen & Projekte",career:"Karriere",secret:"Geheim"};
const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const num=v=>Math.max(0,Math.floor(Number(v)||0));
const valid=t=>Number.isInteger(t.id)&&t.id>=1&&t.id<=50&&Object.hasOwn(rarities,t.rarity);
const art=t=>t.title==="???"?'<span class="tp-trophy-unknown" aria-hidden="true">?</span>':'<img width="96" height="96" loading="lazy" src="./icons/trophies/trophy-'+t.id+'.svg" alt="">';
export function toggleFavorite(current,id,items){
 if(!items.some(t=>t.id===id&&t.unlocked_at))return current;
 if(current.includes(id))return current.filter(x=>x!==id);
 return current.length<3?[...current,id]:current;
}
export function trophyCabinet(items=[],filter="all",category="all",favorites=[],error=false,sound=false){
 const ts=items.filter(valid),unlocked=ts.filter(t=>t.unlocked_at);
 const pct=Math.round(unlocked.length/50*100);
 const choices=[["all","Alle"],["unlocked","Freigeschaltet"],["locked","Gesperrt"],...Object.entries(rarities)];
 const visible=ts.filter(t=>(filter==="all"||filter==="unlocked"&&t.unlocked_at||filter==="locked"&&!t.unlocked_at||filter===t.rarity)&&(category==="all"||category===t.category));
 const select=(id,opts,value)=>'<select id="'+id+'" aria-label="'+(id==="tp-trophy-filter"?"Status und Seltenheit":"Kategorie")+'">'+opts.map(([k,n])=>'<option value="'+k+'"'+(k===value?' selected':'')+'>'+n+'</option>').join("")+'</select>';
 const card=t=>{const won=!!t.unlocked_at,secret=t.title==="???",target=Math.max(1,num(t.target)),progress=Math.min(target,num(t.progress)),percent=won?100:Math.round(progress/target*100);return '<article class="tp-trophy-card '+t.rarity+(won?' won':' locked')+'">'+art(t)+'<span class="tp-trophy-rarity">'+rarities[t.rarity]+'</span><strong>'+safe(t.title)+'</strong><small>'+safe(t.description)+'</small><span class="tp-trophy-xp">+'+num(t.xp_reward)+' XP</span>'+(secret?'':('<progress max="100" value="'+percent+'" aria-label="Trophäenfortschritt"></progress><small>'+(won?'Freigeschaltet '+safe(new Date(t.unlocked_at).toLocaleDateString("de-AT")):progress+' / '+target)+'</small>'))+(won?'<button type="button" data-trophy-favorite="'+t.id+'" aria-pressed="'+favorites.includes(t.id)+'">'+(favorites.includes(t.id)?"★ Aus Vitrine entfernen":"☆ In Vitrine")+'</button>':'<small>🔒 Gesperrt</small>')+'</article>';};
 const display=favorites.map(id=>unlocked.find(t=>t.id===id)).filter(Boolean).slice(0,3);
 const latest=[...unlocked].sort((a,b)=>String(b.unlocked_at).localeCompare(String(a.unlocked_at))).slice(0,3);
 return '<div class="tp-game-panel tp-trophy-cabinet" id="tp-trophy-cabinet"><div class="tp-game-panel-heading"><h3>🏆 Trophäenschrank</h3><span>TROPHY HUNTER</span></div><p>Deine persönlichen Errungenschaften bleiben über alle Prestige-Stufen erhalten.</p>'+(error?'<p role="status">Trophäen konnten nicht synchronisiert werden. <button type="button" id="tp-trophy-retry">Erneut versuchen</button></p>':'')+'<div class="tp-trophy-overview"><strong>'+unlocked.length+' / 50</strong><span>'+pct+' % abgeschlossen</span></div><progress class="tp-trophy-total" max="50" value="'+unlocked.length+'" aria-label="Gesamtfortschritt"></progress><div class="tp-trophy-counts">'+Object.entries(rarities).map(([k,n])=>'<div class="'+k+'"><b>'+unlocked.filter(t=>t.rarity===k).length+' / '+ts.filter(t=>t.rarity===k).length+'</b><span>'+n+'</span></div>').join("")+'</div><h4>Meine Vitrine · '+display.length+' / 3</h4><div class="tp-trophy-showcase">'+[0,1,2].map(i=>display[i]?'<div>'+art(display[i])+'<strong>'+safe(display[i].title)+'</strong></div>':'<div class="empty-slot">☆<small>Freier Platz</small></div>').join("")+'</div><h4>Zuletzt freigeschaltet</h4><div class="tp-trophy-latest">'+(latest.length?latest.map(t=>'<div>'+art(t)+'<span>'+safe(t.title)+'</span></div>').join(""):'<p>Noch keine Trophäen freigeschaltet.</p>')+'</div><div class="tp-trophy-filters">'+select("tp-trophy-filter",choices,filter)+select("tp-trophy-category",[["all","Alle Kategorien"],...Object.entries(categories)],category)+'<label><input type="checkbox" id="tp-trophy-sound"'+(sound?' checked':'')+'> Sound</label></div><div class="tp-trophy-grid">'+(visible.length?visible.map(card).join(""):'<p>Keine Trophäen in dieser Auswahl.</p>')+'</div></div>';
}
export function announceTrophies(items,ids,sound=false){
 const won=items.filter(t=>ids.includes(t.id)&&valid(t)&&t.unlocked_at);
 if(!won.length)return;
 document.getElementById("tp-trophy-popup")?.remove();
 const popup=document.createElement("aside");popup.id="tp-trophy-popup";popup.className="tp-trophy-popup";popup.setAttribute("role","status");
 popup.innerHTML='<small>✦ TROPHÄE FREIGESCHALTET ✦</small>'+art(won[0])+'<strong>'+safe(won[0].title)+'</strong><span>'+ (won.length>1?'Und '+(won.length-1)+' weitere Trophäen':safe(won[0].description))+'</span><b>+'+won.reduce((n,t)=>n+num(t.xp_reward),0)+' XP</b>';
 document.body.append(popup);setTimeout(()=>popup.remove(),6500);
 if(sound){try{const ctx=new (window.AudioContext||window.webkitAudioContext)();[523,659,784].forEach((f,i)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=f;g.gain.setValueAtTime(.055,ctx.currentTime+i*.13);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+i*.13+.32);o.connect(g).connect(ctx.destination);o.start(ctx.currentTime+i*.13);o.stop(ctx.currentTime+i*.13+.33)});setTimeout(()=>ctx.close(),1000)}catch{}}
}
