import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
const source=fs.readFileSync(process.argv[2]||"cloud/public/sw.js","utf8");
const origin="https://trummcardsgit.github.io";
for(const [own,other] of [["/firmenplaner-updates/","/rhtflow-test/"],["/rhtflow-test/","/firmenplaner-updates/"]]){
 const listeners={},deleted=[],put=[],match=[],focused=[],opened=[],notified=[];
 const prefix="tp-cache:"+own+":",foreign="tp-cache:"+other+":old";
 const seasonalCache={match:async key=>{const u=typeof key==="string"?key:key.url;return u===origin+own+"manifest.webmanifest"?"season-manifest":u===origin+own+"season-icon-1-2-192.png"?"season-icon":undefined;}};
 const mockCache={addAll:async()=>{},match:async key=>{match.push(key);return "own-cache"},put:async key=>put.push(key)};
 const otherClient={url:origin+other,focus:async()=>focused.push("foreign"),navigate:async()=>focused.push("foreign navigation")};
 const ownClient={url:origin+own,focus:async()=>focused.push("own"),navigate:async url=>focused.push(url)};
 const context={URL,location:{origin},self:{registration:{scope:origin+own,showNotification:async(t,o)=>notified.push(o)},addEventListener:(n,f)=>listeners[n]=f,skipWaiting:async()=>{}},clients:{claim:async()=>{},matchAll:async()=>[otherClient,ownClient],openWindow:async u=>opened.push(u)},caches:{keys:async()=>[prefix+"old",foreign,"unrelated","rhtflow-staging-v2.0.0-dev.7","trummplaner-pwa-v1.8.0"],delete:async k=>deleted.push(k),open:async k=>{if(k==="tp-season-public:"+own)return seasonalCache;assert.ok(k.startsWith(prefix));return mockCache}},fetch:async()=>{throw Error("offline")},Date,String};
 context.self.clients=context.clients;
 vm.runInNewContext(source,context);
 const call=async(name,data={})=>{let p;listeners[name]({...data,waitUntil:x=>p=x,respondWith:x=>p=x});return await p};
 await call("activate");assert.deepEqual(deleted,[prefix+"old"]);
 assert.equal(await call("fetch",{request:{method:"GET",url:origin+other+"config.js",mode:"cors"}}),undefined);
 assert.equal(await call("fetch",{request:{method:"GET",url:origin+own+"config.js",mode:"cors"}}),"own-cache");
 assert.equal(await call("fetch",{request:{method:"GET",url:origin+own+"?code=private",mode:"navigate"}}),"own-cache");
 assert.equal(await call("fetch",{request:{method:"GET",url:origin+own+"manifest.webmanifest",mode:"cors"}}),"season-manifest");
 assert.equal(await call("fetch",{request:{method:"GET",url:origin+own+"season-icon-1-2-192.png",mode:"cors"}}),"season-icon");
 assert.equal(await call("fetch",{request:{method:"GET",url:origin+other+"manifest.webmanifest",mode:"cors"}}),undefined);
 await call("push",{data:{json:()=>({url:origin+other,tag:"same-tag"})}});
 assert.equal(notified[0].data.url,origin+own);assert.equal(notified[0].tag,prefix+"same-tag");
 await call("notificationclick",{notification:{close(){},data:{url:origin+other}}});
 assert.deepEqual(focused,[origin+own,"own"]);assert.equal(opened.length,0);
}
console.log("PWA isolation: cache ownership, offline fallback, cross-app fetch and push tested in both directions");
