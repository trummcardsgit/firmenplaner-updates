import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const root="https://trummcardsgit.github.io/firmenplaner-updates/";
const options={cache:"no-store",redirect:"error",signal:AbortSignal.timeout(20000)};
const [html,app,tickets,profile]=await Promise.all(["","app.js","tickets.js","profile-avatar.js"].map(async name=>{
 const r=await fetch(root+name,options);if(!r.ok)throw Error("Published "+name+" HTTP "+r.status);
 if(!name)console.log("Published security headers:",JSON.stringify({csp:r.headers.get("content-security-policy"),frame:r.headers.get("x-frame-options")}));
 return r.text();
}));
assert.ok(app.includes("https://esm.sh/@supabase/supabase-js@2.95.3?bundle"));
assert.doesNotMatch(html,/http-equiv=["']Content-Security-Policy/i);
assert.equal(tickets,readFileSync("cloud/public/tickets.js","utf8"));
assert.equal(profile,readFileSync("cloud/public/profile-avatar.js","utf8"));
console.log("Published app matches inspected baseline for ticket/profile files; remote SDK and absent meta CSP confirmed.");
const edge="https://ilmwoapvcluoravpsrjv.supabase.co/functions/v1/trummplaner-site";
for(const v of ["","/index.html","/https://example.invalid/path","///example.invalid/path","/https://trummcardsgit.github.io@example.invalid/path","/http:example.invalid","/http:/example.invalid/path","/https:example.invalid","/https:%2F%2Fexample.invalid","/https:/example.invalid/path"]){
 try{
  const r=await fetch(edge+v,{redirect:"manual",signal:AbortSignal.timeout(15000)});
  const location=r.headers.get("location");console.log("Legacy route",JSON.stringify({variant:v,status:r.status,location}));
  await r.body?.cancel();
 }catch(e){console.log("Legacy route unavailable:",v,e.message);}
}
