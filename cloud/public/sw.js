const CACHE="trummplaner-pwa-v1.2.0";
const ASSETS=["./","./index.html","./styles.css","./app.js","./config.js","./manifest.webmanifest","./icons/icon-192.png","./icons/icon-512.png","./icons/logo-full.webp"];
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
 const req=event.request;
 if(req.method!=="GET" || new URL(req.url).origin!==location.origin)return;
 event.respondWith(fetch(req).then(res=>{
  if(res.ok){const copy=res.clone();caches.open(CACHE).then(cache=>cache.put(req,copy));}
  return res;
 }).catch(()=>caches.match(req)));
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
 const title=String(payload.title||"TrummPlaner – Erinnerung").slice(0,140);
 event.waitUntil(self.registration.showNotification(title,{
  body:String(payload.body||"Du hast eine Aufgabe.").slice(0,300),
  icon:"./icons/icon-192.png",badge:"./icons/icon-192.png",
  tag:String(payload.tag||"trummplaner-reminder"),
  timestamp:Date.now(),
  data:{url}
 }));
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();
 const url=event.notification.data?.url||self.registration.scope;
 event.waitUntil((async()=>{
  const windows=await clients.matchAll({type:"window",includeUncontrolled:true});
  for(const client of windows){
   if(new URL(client.url).origin===new URL(url).origin){
    if("navigate" in client) await client.navigate(url).catch(()=>{});
    return client.focus();
   }
  }
  return clients.openWindow(url);
 })());
});