// TrummPlaner: read-only client presentation for server-awarded XP and prestige.
// XP cannot be changed through this module. All awards occur in Supabase triggers.
export const GAME_XP_MIN=75;
export const GAME_XP_MAX=250;
export const NORMAL_MAX_LEVEL=55;
export const MAX_PRESTIGE=10;
export const MASTER_MAX_LEVEL=1000;

export function requiredXp(level,stage="normal"){
 const n=Math.max(1,Math.floor(Number(level)||1));
 return stage==="master"?250+5*(n-1):150+12*(n-1);
}
export function playerRank(record=null){
 const p=record||{};
 const stage=p.stage==="master"?"master":"normal";
 const prestige=Math.min(10,Math.max(0,Number(p.prestige)||0));
 const cap=stage==="master"?MASTER_MAX_LEVEL:NORMAL_MAX_LEVEL;
 const level=Math.max(1,Math.min(cap,Number(p.level)||1));
 const atCap=level===cap;
 const needed=atCap?0:requiredXp(level,stage);
 const current=atCap?0:Math.min(Math.max(0,Number(p.xp_in_level)||0),needed);
 const percent=atCap?100:Math.max(0,Math.min(100,Math.round(current/needed*100)));
 const lifetime=Math.max(0,Number(p.total_xp)||0);
 const done=Math.max(0,Number(p.tasks_rewarded)||0);
 const title=stage==="master"?"Prestige-Meister":prestige===0?"Rekrut":"Prestige "+prestige;
 const ready=stage==="normal"&&atCap;
 const next=ready?(prestige===10?"Prestige-Meister freischalten":"Prestige "+(prestige+1)+" starten"):"";
 return {stage,prestige,level,cap,atCap,needed,current,percent,lifetime,done,title,ready,next};
}
const fmtNumber=n=>new Intl.NumberFormat("de-AT").format(n);
const emblem=n=>'<img class="tp-rank-art" src="./icons/prestige-'+n+'.webp" alt="" width="72" height="72">';
const icon=p=>p.stage==="master"?emblem("master"):p.prestige>0?emblem(p.prestige):'<img class="tp-rank-art" src="./icons/hd-career.svg" alt="" width="48" height="48">';
export function careerCard(record=null){
 const p=playerRank(record);
 return '<button type="button" data-open-career class="tp-game-mini">'+
  '<span class="tp-game-mini-seal" aria-hidden="true">'+icon(p)+'</span>'+
  '<span class="tp-game-mini-body"><span class="tp-game-kicker">DEINE KARRIERE</span>'+
  '<strong>'+p.title+' · Level '+fmtNumber(p.level)+'</strong>'+
  '<span class="tp-game-mini-bar"><span style="width:'+p.percent+'%"></span></span>'+
  '<span class="tp-game-mini-caption">'+(p.ready?"Prestige verfügbar – jetzt aufsteigen!":p.atCap?"Maximallevel erreicht":
   fmtNumber(p.current)+" / "+fmtNumber(p.needed)+" XP zum nächsten Level")+'</span></span>'+
  '<span class="tp-game-mini-arrow" aria-hidden="true">›</span></button>';
}
export function careerPage(record=null,events=[],esc=x=>String(x),fmt=x=>String(x)){
 const p=playerRank(record);
 const entries=(events||[]).slice(0,18).map(ev=>{
  const raised=Number(ev.rank_after)>Number(ev.rank_before);
  return '<div class="tp-game-event"><span class="tp-game-event-sign">+'+Number(ev.xp||0)+' XP</span>'+
   '<span class="tp-game-event-info"><strong>'+esc(ev.entry_title||"Erledigte Aufgabe")+'</strong>'+
   '<small>'+esc(fmt(ev.awarded_at))+(raised?' · Levelaufstieg!':'')+'</small></span></div>';
 }).join("");
 const badges=Array.from({length:10},(_,i)=>{
  const n=i+1,unlocked=p.prestige>=n;
  return '<span class="tp-prestige-badge'+(unlocked?' unlocked':'')+'" aria-label="Prestige '+n+
   (unlocked?' freigeschaltet':' gesperrt')+'" title="Prestige '+n+'">'+emblem(n)+
   '<b>'+n+'</b></span>';
 }).join("");
 const headline=p.stage==="master"?"Der Weg zu Level 1000":
  p.prestige===0?"Dein Aufstieg beginnt":'Prestige '+p.prestige+' · nächste Etappe';
 const nextText=p.ready?
  (p.prestige===10?"Zehn Prestiges geschafft! Wechsel jetzt zu Prestige-Meister und steige bis Level 1000 auf.":
    "Level 55 erreicht! Du kannst jetzt ins nächste Prestige wechseln. Dein Level beginnt dann wieder bei 1."):
  p.atCap?"Prestige-Meister Level 1000 erreicht – höchste Auszeichnung freigeschaltet!":
   "Jede abgeschlossene Aufgabe bringt einmalig zufällige 75–250 XP. Nur neue Abschlüsse zählen.";
 return '<section class="tp-game-career">'+
  '<div class="tp-game-hero">'+
   '<div class="tp-game-hero-main"><span class="tp-game-kicker">TRUMMPLANER · KARRIERE</span>'+
   '<div class="tp-game-rank-seal" aria-hidden="true">'+icon(p)+'</div>'+
   '<div><p class="tp-game-hero-overline">'+esc(headline)+'</p>'+
   '<h2>'+esc(p.title)+'</h2>'+
   '<div class="tp-game-level">Level <strong>'+fmtNumber(p.level)+'</strong><span> / '+fmtNumber(p.cap)+'</span></div></div></div>'+
   '<div class="tp-game-progress"><div class="tp-game-progress-line"><span>'+(
    p.atCap?"MAX. LEVEL":fmtNumber(p.current)+" / "+fmtNumber(p.needed)+" XP")+'</span>'+
    '<span>'+p.percent+' %</span></div>'+
    '<div class="tp-game-progress-track" role="progressbar" aria-valuenow="'+p.percent+
    '" aria-valuemin="0" aria-valuemax="100" aria-label="Level-Fortschritt">'+
    '<span style="width:'+p.percent+'%"></span></div></div>'+
   '<p class="tp-game-lead">'+esc(nextText)+'</p>'+
   (p.ready?'<button type="button" id="tp-enter-prestige" class="tp-game-prestige-button">'+esc(p.next)+' ›</button>':'')+
  '</div>'+
  '<div class="tp-game-stats"><div><strong>'+fmtNumber(p.lifetime)+'</strong><span>Gesammelte XP</span></div>'+
   '<div><strong>'+fmtNumber(p.done)+'</strong><span>Belohnte Aufgaben</span></div>'+
   '<div><strong>'+p.prestige+' / 10</strong><span>Prestiges</span></div></div>'+
  '<div class="tp-game-panel"><div class="tp-game-panel-heading"><h3>Prestige-Reise</h3><span>10 Prestige-Stufen</span></div>'+
    '<p>Jeweils bis Level 55 aufsteigen, dann freiwillig das nächste Prestige starten.</p>'+
    '<div class="tp-prestige-badges">'+badges+'</div>'+
    '<div class="tp-game-master-badge'+(p.stage==="master"?' unlocked':'')+'"><span aria-hidden="true">'+emblem("master")+'</span>'+
     '<div><strong>Prestige-Meister</strong><small>Nach Prestige 10 · Level 55–1000</small></div>'+
     (p.stage==="master"?'<span>FREIGESCHALTET</span>':'<span>GESPERRT</span>')+'</div></div>'+
  '<div class="tp-game-panel"><div class="tp-game-panel-heading"><h3>Letzte XP-Belohnungen</h3>'+
   '<span>Einmal pro Aufgabe</span></div>'+
   (entries||'<p class="tp-game-empty">Noch keine XP gesammelt. Schließe deine nächste Aufgabe ab und starte deine Karriere!</p>')+
  '</div></section>';
}
