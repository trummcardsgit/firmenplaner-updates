const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const ticketStatusLabels=[["open","Offen"],["accepted","In Bearbeitung"],["closed","Erledigt"],["rejected","Abgelehnt"]];
export function secondsFor(rows,now=Date.now(),from=-Infinity,to=Infinity){
 return rows.reduce((sum,r)=>{const a=Date.parse(r.started_at),b=r.ended_at?Date.parse(r.ended_at):now;return Number.isFinite(a)&&Number.isFinite(b)?sum+Math.max(0,Math.floor((Math.min(b,to,now)-Math.max(a,from))/1000)):sum;},0);
}
export function duration(s){s=Math.max(0,Math.floor(Number(s)||0));return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(n=>String(n).padStart(2,"0")).join(":");}
export function timerMarkup(t,rows,uid){
 const own=rows.filter(r=>String(r.ticket_id)===String(t.id)&&r.owner_id===uid),latest=own[0],running=own.find(r=>!r.ended_at),eligible=t.status==="accepted"&&t.assignee_id===uid;
 if(!eligible&&!own.length)return "";
 const other=rows.some(r=>r.owner_id===uid&&!r.ended_at&&String(r.ticket_id)!==String(t.id));
 const btn=(a,label,disabled=false)=>'<button type="button" data-tp-action="timer-'+a+'" data-id="'+esc(t.id)+'" '+(disabled?"disabled":"")+'>'+label+'</button>';
 return '<div class="tp21-timer"><span>Meine Arbeitszeit <b data-timer-ticket="'+esc(t.id)+'">'+duration(secondsFor(own))+'</b></span><span>'+(running?"Läuft":latest?.end_reason==="pause"&&eligible?"Pausiert":"Gestoppt")+'</span>'+(eligible?(running?btn("pause","Ⅱ Pause")+btn("stop","■ Stopp"):btn("start",latest?.end_reason==="pause"?"▶ Fortsetzen":"▶ Start",other)+(latest?.end_reason==="pause"?btn("stop","■ Stopp"):"")):"")+(eligible&&other&&!running?'<small>Ein anderes Ticket läuft bereits.</small>':"")+'</div>';
}
export function ticketMetrics({tickets=[],events=[],times=[],from=-Infinity,to=Infinity,company="",scope="team",uid="",now=Date.now()}){
 const selected=tickets.filter(t=>(!company||String(t.company_id)===company)&&(scope!=="mine"||t.creator_id===uid||t.assignee_id===uid)&&Date.parse(t.created_at)>=from&&Date.parse(t.created_at)<to);
 const ids=new Set(selected.map(t=>String(t.id))),closed=selected.filter(t=>t.status==="closed"),closure=new Map();
 for(const e of events)if(e.kind==="closed"&&ids.has(String(e.ticket_id))){const v=Date.parse(e.created_at),k=String(e.ticket_id);if(Number.isFinite(v)&&(!closure.has(k)||v>closure.get(k)))closure.set(k,v);}
 const intervals=closed.map(t=>closure.get(String(t.id))-Date.parse(t.created_at)).filter(v=>Number.isFinite(v)&&v>=0);
 const counts=Object.fromEntries(ticketStatusLabels.map(([k])=>[k,selected.filter(t=>t.status===k).length]));
 const tracked=secondsFor(times.filter(r=>ids.has(String(r.ticket_id))&&(scope!=="mine"||r.owner_id===uid)),now,from,to);
 const groups=new Map();for(const t of selected){const key=String(t.created_at).slice(0,7);groups.set(key,(groups.get(key)||0)+1);}
 return {total:selected.length,counts,closed:closed.length,rate:selected.length?Math.round(closed.length/selected.length*100):0,avgSeconds:intervals.length?Math.round(intervals.reduce((a,b)=>a+b,0)/intervals.length/1000):null,tracked,months:[...groups].sort(([a],[b])=>a.localeCompare(b))};
}
export function analyticsMarkup(data,uid,admin,filters,now=Date.now()){
 const from=filters.days==="all"?-Infinity:now-Number(filters.days)*86400000,m=ticketMetrics({...data,times:admin?data.times:(data.times||[]).filter(r=>r.owner_id===uid),from,to:now+1,company:filters.company,scope:filters.scope,uid,now});
 const opt=(v,t,s)=>'<option value="'+esc(v)+'"'+(v===s?' selected':'')+'>'+esc(t)+'</option>';
 const card=(label,value)=>'<div class="tp21-metric"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></div>';
 const max=Math.max(1,...Object.values(m.counts)),bar=(label,n,max)=>'<div class="tp21-chartrow"><span>'+esc(label)+'</span><progress max="'+max+'" value="'+n+'"></progress><b>'+n+'</b></div>';
 return '<div class="tp-ticket-panel"><small>RHTFLOW 2.1 · ANALYTICS</small><h2>Statistikcenter</h2><div class="tp-ticket-filters"><select id="tp21-period" aria-label="Zeitraum">'+[["30","30 Tage"],["90","90 Tage"],["365","365 Tage"],["all","Gesamter Zeitraum"]].map(([v,t])=>opt(v,t,filters.days)).join("")+'</select><select id="tp21-company" aria-label="Firma">'+opt("","Alle Firmen",filters.company)+data.companies.map(c=>opt(String(c.id),c.name,filters.company)).join("")+'</select><select id="tp21-scope" aria-label="Auswertung">'+opt("mine","Meine Tickets",filters.scope)+opt("team","Alle Tickets",filters.scope)+'</select><button type="button" id="tp21-stat-refresh">Aktualisieren</button></div><p class="tp21-note">Auswertung nach Erstellungsdatum; aktueller Ticketstatus. Arbeitszeit innerhalb des gewählten Zeitraums. '+(admin?"Teamzeit nur für Administratoren.":"Nur eigene Arbeitszeiten sichtbar.")+'</p><div class="tp21-metrics">'+card("Tickets gesamt",m.total)+card("Offen",m.counts.open)+card("In Bearbeitung",m.counts.accepted)+card("Erledigt",m.closed)+card("Erledigungsquote",m.total?m.rate+" %":"–")+card("Ø Durchlaufzeit",m.avgSeconds===null?"–":duration(m.avgSeconds))+card(filters.scope==="team"&&admin?"Erfasste Teamzeit":"Eigene erfasste Zeit",duration(m.tracked))+'</div></div><div class="tp-ticket-panel"><h3>Aktueller Ticketstatus</h3>'+ticketStatusLabels.map(([k,label])=>bar(label,m.counts[k],max)).join("")+'</div><div class="tp-ticket-panel"><h3>Erstellte Tickets pro Monat</h3>'+(!m.months.length?'<p>Keine Tickets im Zeitraum.</p>':m.months.map(([month,n])=>bar(month,n,Math.max(1,...m.months.map(x=>x[1])))).join(""))+'</div>';
}
function dateKey(t){return new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Vienna",year:"numeric",month:"2-digit",day:"2-digit"}).format(t);}
export function careerChallenges(events,uid,now=Date.now()){
 const current=dateKey(now),month=current.slice(0,7),weekStart=new Date(current+"T12:00:00Z");weekStart.setUTCDate(weekStart.getUTCDate()-((weekStart.getUTCDay()+6)%7));const week=weekStart.toISOString().slice(0,10);
 const valid=events.filter(e=>e.actor_id===uid&&Number.isFinite(Date.parse(e.created_at))&&Date.parse(e.created_at)<=now);
 const count=(kind,start,monthly=false)=>new Set(valid.filter(e=>e.kind===kind&&(monthly?dateKey(Date.parse(e.created_at)).startsWith(start):dateKey(Date.parse(e.created_at))>=start)).map(e=>String(e.ticket_id))).size;
 return [{period:"Heute",label:"Wissen teilen",detail:"Kommentar zu einem Ticket schreiben",count:count("comment",current),goal:1},{period:"Diese Woche",label:"Qualität verbessern",detail:"Zwei verschiedene Ticketbeschreibungen bearbeiten",count:count("description_edited",week),goal:2},{period:"Monatssaison "+month,label:"Service-Meister",detail:"Fünf verschiedene Tickets abschließen",count:count("closed",month,true),goal:5}];
}
export function dailyChallengeMarkup(events,uid,ready=true,now=Date.now()){
 const heading='<div class="tp21-daily-head"><h3>Tägliche Aufgaben</h3><small>Reset um 00:00 Uhr</small></div>';
 if(!ready)return '<section id="tp21-daily-challenges" class="tp21-daily">'+heading+'<small>Fortschritt noch nicht verfügbar.</small></section>';
 const goals=careerChallenges(events,uid,now).filter(g=>g.period==="Heute");
 const done=goals.filter(g=>g.count>=g.goal).length;
 return '<section id="tp21-daily-challenges" class="tp21-daily">'+heading+'<div class="tp21-daily-summary"><span>'+done+' / '+goals.length+' erledigt</span><progress aria-label="Tagesfortschritt" max="'+Math.max(1,goals.length)+'" value="'+done+'"></progress></div>'+goals.map(g=>{const complete=g.count>=g.goal;return '<div class="tp21-daily-row'+(complete?' is-complete':'')+'"><span class="tp21-daily-symbol" aria-hidden="true">'+(complete?'✓':'◇')+'</span><div><strong>'+esc(g.label)+'</strong><small>'+esc(g.detail)+'</small></div><span class="tp21-daily-count">'+Math.min(g.count,g.goal)+' / '+g.goal+(complete?' · Erledigt':'')+'</span></div>';}).join("")+'</section>';
}
export function careerChallengeMarkup(events,uid,ready=true){
 if(!ready)return '<section class="tp-ticket-panel"><h3>Karriere · Herausforderungen</h3><p>Fortschritt konnte noch nicht geladen werden.</p></section>';
 return '<section class="tp-ticket-panel tp21-career"><small>RHTFLOW 2.1 · KARRIERE</small><h2>Herausforderungen &amp; Monatssaison</h2><p>Persönliche Abzeichen für den aktuellen Zeitraum, ohne zusätzliche XP oder Mitarbeiterrangliste.</p><div class="tp21-metrics">'+careerChallenges(events,uid).map(g=>'<div class="tp21-metric"><small>'+esc(g.period)+'</small><strong>'+esc(g.label)+'</strong><span>'+esc(g.detail)+'</span><progress max="'+g.goal+'" value="'+Math.min(g.count,g.goal)+'"></progress><b>'+Math.min(g.count,g.goal)+' / '+g.goal+'</b><span class="tp21-badge">'+(g.count>=g.goal?"★ Abzeichen freigeschaltet":"◇ Abzeichen noch gesperrt")+'</span></div>').join("")+'</div></section>';
}
export async function readCareerEvents(db,uid){
 const rows=[],start=new Date();start.setUTCDate(1);start.setUTCHours(0,0,0,0);const cutoff=new Date(start.getTime()-8*86400000).toISOString();
 for(let offset=0;;offset+=500){const r=await db.from("tp_ticket_events").select("id,ticket_id,actor_id,kind,created_at").eq("actor_id",uid).gte("created_at",cutoff).in("kind",["comment","description_edited","closed"]).order("id").range(offset,offset+499);if(r.error)throw r.error;rows.push(...(r.data||[]));if((r.data||[]).length<500)return rows;}
}
