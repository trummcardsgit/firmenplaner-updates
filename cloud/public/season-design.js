const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const views={dashboard:"Übersicht",career:"Karriere",tickets:"Tickets",statistics:"Statistikcenter",inventory:"Inventar",tasks:"Aufgaben",notes:"Notizen",solutions:"Lösungen",projects:"Projekte",documents:"Word-Dokumente",companies:"Firmen",admin:"Benutzerverwaltung",settings:"Einstellungen"};
export const assetLabels={logo:"RHTFLOW-Logo (Login und Seitenleiste)",appIcon:"App-Icon (PWA, Browser, Taskleiste)",background:"Oberflächen-Hintergrund",battlepass:"Battle-Pass-Hintergrund",...views};
const colorLabels={accent:"Akzentfarbe",secondary:"Zweite Akzentfarbe",background:"Hintergrund",surface:"Flächen"};
const defaults={accent:"#ff6bb6",secondary:"#b38cf4",background:"#13142e",surface:"#282540"};
const isImage=v=>typeof v==="string"&&v.length<=260000&&/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(v);
const isColor=v=>typeof v==="string"&&/^#[0-9a-f]{6}$/i.test(v);
export function cleanDesign(d){
 if(!d||typeof d!=="object")return null;
 return {name:String(d.name||"").slice(0,80),assets:Object.fromEntries(Object.keys(assetLabels).filter(k=>isImage(d.assets?.[k])).map(k=>[k,d.assets[k]])),palette:Object.fromEntries(Object.keys(defaults).filter(k=>isColor(d.palette?.[k])).map(k=>[k,d.palette[k]]))};
}
export function applySeasonDesign(doc,design,view){
 const d=cleanDesign(design),a=d?.assets||{},p=d?.palette||{},root=doc.documentElement;
 root.classList.toggle("tp-season-active",!!d);
 for(const k of Object.keys(defaults)){if(p[k])root.style.setProperty("--season-"+k,p[k]);else root.style.removeProperty("--season-"+k);}
 for(const k of ["background","battlepass"]){if(a[k])root.style.setProperty("--season-art-"+k,'url("'+a[k]+'")');else root.style.removeProperty("--season-art-"+k);}
 root.classList.toggle("tp-season-background",!!a.background);root.classList.toggle("tp-season-battlepass",!!a.battlepass);
 for(const el of doc.querySelectorAll("img.brand,img.auth-logo")){
  if(!el.dataset.seasonDefault)el.dataset.seasonDefault=el.getAttribute("src");
  const src=a.logo||el.dataset.seasonDefault;if(el.getAttribute("src")!==src)el.src=src;
 }
 for(const b of doc.querySelectorAll("#nav button[data-view],.bottom-nav button[data-view]")){
  let icon=b.querySelector(".tp-season-nav-icon"),original=b.firstElementChild;const src=a[b.dataset.view];
  if(src){if(!icon){icon=doc.createElement("img");icon.className="tp-season-nav-icon";icon.alt="";icon.setAttribute("aria-hidden","true");original?.classList.add("tp-season-original-hidden");b.prepend(icon);}if(icon.getAttribute("src")!==src)icon.src=src;}
  else{icon?.remove();b.querySelector(".tp-season-original-hidden")?.classList.remove("tp-season-original-hidden");}
 }
 const header=doc.getElementById("page-menu-art");if(header&&view&&Object.hasOwn(views,view)){const src=a[view]||"./icons/hd-"+view+(["inventory","statistics"].includes(view)?".avif":".svg");if(a[view]&&header.getAttribute("src")!==src)header.src=src;}
 const meta=doc.querySelector('meta[name="theme-color"]');if(meta)meta.content=p.background||"#201735";
 const favicon=doc.querySelector('link[rel="icon"]');if(favicon){if(!favicon.dataset.seasonDefault)favicon.dataset.seasonDefault=favicon.getAttribute("href");favicon.href=a.appIcon||favicon.dataset.seasonDefault;}
}
async function decodeImage(src){const img=new Image();img.src=src;await img.decode();return img;}
export async function convertSeasonImage(file,key){
 if(!file||file.size>10000000||!["image/png","image/jpeg","image/webp","image/avif"].includes(file.type))throw Error("Bitte PNG, JPG, WebP oder AVIF bis 10 MB wählen.");
 const url=URL.createObjectURL(file);
 try{const img=await decodeImage(url);if(img.width*img.height>40000000)throw Error("Bildauflösung zu groß.");
 const limit=key==="logo"?1000:["background","battlepass"].includes(key)?1200:512,scale=Math.min(1,limit/Math.max(img.width,img.height)),canvas=document.createElement("canvas");
 canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
 let src=canvas.toDataURL("image/webp",.88);for(const q of [.75,.6,.45]){if(src.length<=260000)break;src=canvas.toDataURL("image/webp",q);}
 if(!isImage(src))throw Error("Grafik kann nicht ausreichend komprimiert werden.");return src;
 }finally{URL.revokeObjectURL(url);}
}
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Vienna",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const endMonth=d=>{const x=new Date(d+"T12:00:00Z");x.setUTCDate(x.getUTCDate()+30);return x.toISOString().slice(0,10);};
export function seasonAdminMarkup(rows,draft=null,busy=false){
 const list=rows.map(r=>'<div class="tp-season-row"><div><b>'+esc(r.name)+'</b><small>'+esc(r.starts)+' bis '+esc(r.ends)+' (Ende exklusiv) · '+(r.published?"Veröffentlicht":"Entwurf")+'</small></div><button type="button" data-season-edit="'+Number(r.id)+'">Bearbeiten</button>'+(r.published?'<button type="button" data-season-disable="'+Number(r.id)+'">Deaktivieren</button>':'')+'</div>').join("");
 const editor=draft?'<form id="tp-season-form"><h3>'+esc(draft.id?"Design bearbeiten":"Neue Season")+'</h3><label>Name<input name="name" required maxlength="80" value="'+esc(draft.name)+'"></label><div class="tp-season-dates"><label>Start<input type="date" name="starts" required value="'+esc(draft.starts)+'"></label><label>Ende (00:00 Uhr)<input type="date" name="ends" required value="'+esc(draft.ends)+'"></label></div><div class="tp-season-colors">'+Object.entries(colorLabels).map(([k,label])=>'<label>'+label+'<input type="color" data-season-color="'+k+'" value="'+esc(draft.palette[k]||defaults[k])+'"></label>').join("")+'</div><div id="tp-season-preview"></div><h3>Grafiken</h3><p>Fehlende Grafiken verwenden das Originaldesign. Nur Bilddateien, keine externen URLs.</p><div class="tp-season-assets">'+Object.entries(assetLabels).map(([k,label])=>'<div><b>'+esc(label)+'</b><div class="tp-season-thumb" data-season-thumb="'+k+'">'+(draft.assets[k]?'<img alt="" src="'+draft.assets[k]+'">':'Standard')+'</div><input type="file" data-season-file="'+k+'" accept="image/png,image/jpeg,image/webp,image/avif" aria-label="'+esc(label)+'"><button type="button" data-season-clear="'+k+'">Standard verwenden</button></div>').join("")+'</div><label class="tp-ticket-check"><input type="checkbox" name="published"'+(draft.published?" checked":"")+'> Veröffentlichung für Zeitraum freigeben</label><div class="tp-season-actions"><button type="submit" class="primary">Speichern</button><button type="button" data-season-now>Jetzt aktivieren</button><button type="button" data-season-cancel>Abbrechen</button></div></form>':"";
 return '<div class="tp-ticket-panel"><h2>Season-Verwaltung</h2><p>Designwechsel automatisch um 00:00 Uhr (Österreich). Bei Überschneidungen gilt der neueste Start, danach die zuletzt gespeicherte Version. Ohne aktive Season gilt Vice City. Battle-Pass-XP und Belohnungen bleiben unverändert.</p><button type="button" data-season-new>+ Neue Season</button>'+list+editor+(busy?'<p>Wird verarbeitet …</p>':'')+'</div>';
}
export function createSeasonAdmin({document,db,userId,isAdmin,notice,fail,onChange}){
 let rows=[],draft=null,busy=false,epoch=0;
 const root=()=>document.getElementById("tp-season-admin");
 const rpc=async(action,id=null,rev=null,payload=null)=>{const {data,error}=await db.rpc("tp_admin_season_design",{p_action:action,p_id:id,p_revision:rev,p_payload:payload});if(error)throw error;return data;};
 function reset(){epoch++;rows=[];draft=null;busy=false;}
 const page=()=>'<section id="tp-season-admin">'+seasonAdminMarkup(rows,draft,busy)+'</section>';
 const current=(u,e)=>u===userId()&&e===epoch&&isAdmin();
 function preview(){const el=document.getElementById("tp-season-preview");if(!el||!draft)return;const p={...defaults,...draft.palette};el.style.background=p.background;el.style.borderColor=p.accent;el.innerHTML='<div style="background:'+p.surface+';padding:12px;border-radius:8px">'+(draft.assets.logo?'<img alt="Logo" src="'+draft.assets.logo+'">':'<b>RHTFLOW</b>')+'<h3>'+esc(draft.name||"Neue Season")+'</h3><div class="tp-season-preview-nav">'+Object.entries(views).map(([k,n])=>'<span>'+(draft.assets[k]?'<img src="'+draft.assets[k]+'" alt="">':'')+esc(n)+'</span>').join("")+'</div><span style="display:inline-block;background:'+p.accent+';color:#111;padding:8px;border-radius:6px">Beispiel-Schaltfläche</span></div>';}
 function fields(){const form=document.getElementById("tp-season-form");if(!form||!draft)return;for(const k of ["name","starts","ends"])draft[k]=form.elements[k].value;draft.published=form.elements.published.checked;for(const x of form.querySelectorAll("[data-season-color]"))draft.palette[x.dataset.seasonColor]=x.value;}
 function draw(){const el=root();if(!el||!isAdmin())return;el.innerHTML=seasonAdminMarkup(rows,draft,busy);el.querySelectorAll("button,input").forEach(x=>x.disabled=busy);preview();
 el.onclick=async ev=>{const b=ev.target.closest("button");if(!b||busy||!isAdmin())return;
 if(b.hasAttribute("data-season-new")){draft={name:"",starts:today(),ends:endMonth(today()),published:false,palette:{...defaults},assets:{}};draw();return;}
 if(b.hasAttribute("data-season-cancel")){draft=null;draw();return;}
 if(b.hasAttribute("data-season-clear")){fields();delete draft.assets[b.dataset.seasonClear];draw();return;}
 if(b.hasAttribute("data-season-now")){const f=document.getElementById("tp-season-form");fields();draft.starts=today();if(draft.ends<=draft.starts)draft.ends=endMonth(draft.starts);draft.published=true;draw();if(document.getElementById("tp-season-form").reportValidity())await save();return;}
 const id=Number(b.dataset.seasonEdit||b.dataset.seasonDisable),row=rows.find(r=>r.id===id);if(!row)return;
 const u=userId(),e=epoch;busy=true;draw();try{if(b.hasAttribute("data-season-edit")){const r=await rpc("get",id);if(current(u,e))draft={...r,...cleanDesign(r)};}
 else{await rpc("disable",id,row.revision);if(current(u,e)){draft=null;rows=await rpc("list");await onChange();notice("Design deaktiviert.");}}}catch(err){if(current(u,e))fail(err);}finally{if(current(u,e)){busy=false;draw();}}
 };
 el.oninput=ev=>{if(draft&&!busy&&ev.target.closest("#tp-season-form")&&!ev.target.matches("[type=file]")){fields();preview();}};
 el.onchange=async ev=>{const input=ev.target,key=input.dataset.seasonFile;if(!key||!input.files?.[0]||busy||!draft||!isAdmin())return;fields();const u=userId(),e=epoch,target=draft;busy=true;try{const src=await convertSeasonImage(input.files[0],key);if(current(u,e)&&draft===target)draft.assets[key]=src;}catch(err){if(current(u,e))fail(err);}finally{if(current(u,e)){busy=false;draw();}}};
 el.onsubmit=ev=>{if(ev.target.id!=="tp-season-form")return;ev.preventDefault();ev.stopPropagation();fields();save();};
 }
 async function save(){if(!draft||busy||!isAdmin())return;const u=userId(),e=epoch;busy=true;draw();try{const {id,revision,name,starts,ends,published,assets,palette}=draft;await rpc("save",id??null,revision??null,{name,starts,ends,published,assets,palette});if(!current(u,e))return;draft=null;rows=await rpc("list");if(!current(u,e))return;await onChange();notice("Season gespeichert.");}catch(err){if(current(u,e))fail(err);}finally{if(current(u,e)){busy=false;draw();}}}
 async function open(){if(!isAdmin()||!userId()||busy||draft)return;const u=userId(),e=epoch;try{const list=await rpc("list");if(current(u,e)&&!draft){rows=Array.isArray(list)?list:[];draw();}}catch(err){if(current(u,e)&&root())root().textContent="Season-Verwaltung nicht verfügbar.";}}
 return {page,open,reset,editing:()=>!!draft||busy};
}
export async function syncSeasonPwa(design,revision){
 if(!("caches" in window)||!("serviceWorker" in navigator))return;
 const scope=new URL("./",location.href),cacheName="tp-season-public:"+scope.pathname;
 if(!design?.assets?.appIcon){await caches.delete(cacheName);return;}
 const icon=await decodeImage(design.assets.appIcon),cache=await caches.open(cacheName),icons=[];
 for(const size of [192,512]){const canvas=document.createElement("canvas");canvas.width=canvas.height=size;const ctx=canvas.getContext("2d");ctx.fillStyle=design.palette?.background||"#13142e";ctx.fillRect(0,0,size,size);const ratio=Math.min(size/icon.width,size/icon.height),w=icon.width*ratio,h=icon.height*ratio;ctx.drawImage(icon,(size-w)/2,(size-h)/2,w,h);const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));if(!blob)throw Error("PWA-Icon konnte nicht erzeugt werden.");const path="./season-icon-"+size+".png";await cache.put(new URL(path,scope),new Response(blob,{headers:{"Content-Type":"image/png"}}));icons.push({src:path,sizes:size+"x"+size,type:"image/png",purpose:"any"});}
 const manifest={id:"./",name:"RHTFLOW",short_name:"RHTFLOW",description:"Firmen, Notizen, Aufgaben und Erinnerungen",start_url:"./",scope:"./",display:"standalone",background_color:design.palette?.background||"#13142e",theme_color:design.palette?.background||"#201735",icons};
 await cache.put(new URL("./manifest.webmanifest",scope),new Response(JSON.stringify(manifest),{headers:{"Content-Type":"application/manifest+json","Cache-Control":"no-cache"}}));
 const apple=document.querySelector('link[rel="apple-touch-icon"]');if(apple)apple.href="./season-icon-192.png";
}
