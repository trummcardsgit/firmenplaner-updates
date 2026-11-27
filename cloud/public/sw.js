const SCOPE=new URL(self.registration.scope);
const CACHE_PREFIX="tp-cache:"+SCOPE.pathname+":";
const CACHE=CACHE_PREFIX+"v2.1.0-test.7";
const ownURL=value=>{try{const u=new URL(value,SCOPE);return u.origin===SCOPE.origin&&u.pathname.startsWith(SCOPE.pathname)?u.href:SCOPE.href;}catch{return SCOPE.href;}};
const ownRequest=value=>{try{const u=new URL(value);return u.origin===SCOPE.origin&&u.pathname.startsWith(SCOPE.pathname);}catch{return false;}};
const ASSETS=["./icons/calling-card-0.svg","./icons/calling-card-3.svg","./icons/calling-card-11.svg","./icons/calling-card-21.svg","./icons/calling-card-30.svg","./bp-inventory.js","./icons/hd-inventory.svg","./battlepass.js","./rhtflow-21.js","./icons/hd-statistics.svg","./ticket-text-editor.js","./vendor/docx-9.15.3.js","./vendor/mammoth-1.13.0.js","./vendor/supabase-2.95.3.js","./frame-guard.js","./ticket-filter-preferences.js","./profile-avatar.js","./menu-preferences.js","./mfa.js","./trophy-showcases.js","./activation.js","./ticket-attachments.js","./solution-admin.js","./recovery.js","./ticket-awards.js","./icons/ticket-award-1.svg","./icons/ticket-award-10.svg","./icons/ticket-award-50.svg","./icons/ticket-award-100.svg","./admin.js","./admin.css","./icons/hd-admin.svg","./tickets.js","./tickets.css","./icons/hd-tickets.svg","./trophies.js","./icons/trophies/manifest.json","./icons/trophies/trophy-1.svg","./icons/trophies/trophy-2.svg","./icons/trophies/trophy-3.svg","./icons/trophies/trophy-4.svg","./icons/trophies/trophy-5.svg","./icons/trophies/trophy-6.svg","./icons/trophies/trophy-7.svg","./icons/trophies/trophy-8.svg","./icons/trophies/trophy-9.svg","./icons/trophies/trophy-10.svg","./icons/trophies/trophy-11.svg","./icons/trophies/trophy-12.svg","./icons/trophies/trophy-13.svg","./icons/trophies/trophy-14.svg","./icons/trophies/trophy-15.svg","./icons/trophies/trophy-16.svg","./icons/trophies/trophy-17.svg","./icons/trophies/trophy-18.svg","./icons/trophies/trophy-19.svg","./icons/trophies/trophy-20.svg","./icons/trophies/trophy-21.svg","./icons/trophies/trophy-22.svg","./icons/trophies/trophy-23.svg","./icons/trophies/trophy-24.svg","./icons/trophies/trophy-25.svg","./icons/trophies/trophy-26.svg","./icons/trophies/trophy-27.svg","./icons/trophies/trophy-28.svg","./icons/trophies/trophy-29.svg","./icons/trophies/trophy-30.svg","./icons/trophies/trophy-31.svg","./icons/trophies/trophy-32.svg","./icons/trophies/trophy-33.svg","./icons/trophies/trophy-34.svg","./icons/trophies/trophy-35.svg","./icons/trophies/trophy-36.svg","./icons/trophies/trophy-37.svg","./icons/trophies/trophy-38.svg","./icons/trophies/trophy-39.svg","./icons/trophies/trophy-40.svg","./icons/trophies/trophy-41.svg","./icons/trophies/trophy-42.svg","./icons/trophies/trophy-43.svg","./icons/trophies/trophy-44.svg","./icons/trophies/trophy-45.svg","./icons/trophies/trophy-46.svg","./icons/trophies/trophy-47.svg","./icons/trophies/trophy-48.svg","./icons/trophies/trophy-49.svg","./icons/trophies/trophy-50.svg","./icons/hd-dashboard.svg","./icons/hd-tasks.svg","./icons/hd-notes.svg","./icons/hd-solutions.svg","./icons/hd-projects.svg","./icons/hd-documents.svg","./icons/hd-companies.svg","./icons/hd-settings.svg","./icons/hd-career.svg","./","./index.html","./styles.css","./vice-city-theme.css","./game-progression.css","./game-progression.js","./app.js","./due-presets.js","./extended.js","./task-projects.js","./table-editor.js","./dictation.js","./config.js","./manifest.webmanifest","./icons/icon-192.png","./icons/icon-512.png","./icons/apple-touch-icon.png","./icons/icon-maskable-512.png","./icons/logo-full.webp","./icons/nav-vicecity.webp","./icons/nav-dashboard.webp","./icons/nav-tasks.webp","./icons/nav-notes.webp","./icons/nav-career.webp","./icons/nav-solutions.webp","./icons/nav-projects.webp","./icons/nav-documents.webp","./icons/nav-companies.webp","./icons/nav-settings.webp","./icons/prestige-1.webp","./icons/prestige-2.webp","./icons/prestige-3.webp","./icons/prestige-4.webp","./icons/prestige-5.webp","./icons/prestige-6.webp","./icons/prestige-7.webp","./icons/prestige-8.webp","./icons/prestige-9.webp","./icons/prestige-10.webp","./icons/prestige-master.webp"];
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k.startsWith(CACHE_PREFIX)).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
 const req=event.request;
 if(req.method!=="GET" || !ownRequest(req.url))return;
 // OAuth callback URLs include one-time codes. Never save query strings in Cache Storage.
 const u=new URL(req.url);
 if(u.search){
  event.respondWith(fetch(req,{cache:"no-store"}).catch(()=>req.mode==="navigate"?caches.open(CACHE).then(cache=>cache.match(new URL("./index.html",SCOPE).href)):Response.error()));
  return;
 }
 event.respondWith((async()=>{
  try{const res=await fetch(req);if(res.ok){try{await (await caches.open(CACHE)).put(req,res.clone());}catch{}}return res;}
  catch{return await (await caches.open(CACHE)).match(req)||Response.error();}
 })());
});
self.addEventListener("push",event=>{
 let payload={};
 try{payload=event.data?.json()||{};}catch{payload={body:event.data?.text()||""};}
 const scopeURL=new URL(self.registration.scope);
 let url=scopeURL.href;
 try{
  const intended=new URL(String(payload.url||""),scopeURL);
  if(intended.origin===scopeURL.origin && intended.pathname.startsWith(scopeURL.pathname))url=intended.href;
 }catch{}
 const title=String(payload.title||"RHTFLOW – Erinnerung").slice(0,140);
 event.waitUntil(self.registration.showNotification(title,{
  body:String(payload.body||"Du hast eine Aufgabe.").slice(0,300),
  icon:"./icons/icon-192.png",badge:"./icons/icon-192.png",
  tag:CACHE_PREFIX+String(payload.tag||"reminder"),
  timestamp:Date.now(),
  data:{url}
 }));
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();
 const url=ownURL(event.notification.data?.url||SCOPE.href);
 event.waitUntil((async()=>{
  const windows=await clients.matchAll({type:"window",includeUncontrolled:true});
  for(const client of windows){
   if(ownRequest(client.url)){
    if("navigate" in client) await client.navigate(url).catch(()=>{});
    return client.focus();
   }
  }
  return clients.openWindow(url);
 })());
});
