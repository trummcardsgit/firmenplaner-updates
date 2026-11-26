import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFileSync,statSync} from "node:fs";
import {resolve,extname,sep} from "node:path";
import {chromium} from "playwright";
const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css",".json":"application/json",".webmanifest":"application/manifest+json",".svg":"image/svg+xml",".png":"image/png",".webp":"image/webp",".ico":"image/x-icon"};
const server=createServer((req,res)=>{
 try{
  const url=new URL(req.url,"http://localhost");
  const match=url.pathname.match(/^\/(prod|test)\/(.*)$/);if(!match){res.writeHead(404).end();return;}
  const root=resolve(match[1]==="prod"?"cloud/public":"cloud/staging-preview");
  const file=resolve(root,decodeURIComponent(match[2]||"index.html"));
  if(!file.startsWith(root+sep)||!statSync(file).isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{"Content-Type":types[extname(file)]||"application/octet-stream","Cache-Control":"no-store"});
  res.end(readFileSync(file));
 }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const browser=await chromium.launch({headless:true});
try{
 for(const [environment,host] of [["prod","ilmwoapvcluoravpsrjv.supabase.co"],["test","cpycfxolqpidfjbhhsmr.supabase.co"]]){
  const context=await browser.newContext();
  try{
   const errors=[],external=[],requests=[];
   await context.route("**/*",async route=>{
    const u=new URL(route.request().url());
    if(u.hostname==="127.0.0.1")return route.continue();
    external.push(u.hostname);
    if(u.hostname!==host)return route.abort();
    requests.push(u.pathname);
    const headers={"access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"*","content-type":"application/json"};
    if(route.request().method()==="OPTIONS")return route.fulfill({status:204,headers});
    if(u.pathname==="/auth/v1/token")return route.fulfill({status:400,headers,body:JSON.stringify({code:"invalid_credentials",msg:"Synthetic login response"})});
    if(u.pathname==="/rest/v1/tp_members")return route.fulfill({status:200,headers,body:JSON.stringify([{user_id:"test-user",display_name:"CI"}])});
    return route.fulfill({status:200,headers,body:"{}"});
   });
   const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));page.on("response",r=>{if(r.status()>=400&&r.url().startsWith("http://127.0.0.1"))console.log("Local asset error:",r.status(),r.url());});
   await page.addInitScript(()=>{window.__csp=[];document.addEventListener("securitypolicyviolation",e=>window.__csp.push({directive:e.effectiveDirective,blocked:e.blockedURI}));});
   const url="http://127.0.0.1:"+server.address().port+"/"+environment+"/";
   await page.goto(url);
   await page.waitForFunction(()=>typeof window.supabase?.createClient==="function"&&document.querySelector("#recovery-open").onclick!==null);
   await page.evaluate(()=>Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error("Service worker not ready")),20000))]));
   await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
   const cached=await page.evaluate(async()=>{for(const key of await caches.keys()){const c=await caches.open(key);if(await c.match(new URL("./vendor/supabase-2.95.3.js",location.href).href))return true;}return false;});
   assert.ok(cached,"SDK not in offline cache");
   await page.locator("#login-email").fill("ci@example.invalid");
   await page.locator("#login-password").fill("synthetic-password");
   const auth=page.waitForRequest(r=>r.url().includes("/auth/v1/token"));
   await page.locator("#login-submit").click();await auth;
   await page.waitForFunction(()=>!document.querySelector("#login-submit").disabled);
   await page.locator("#recovery-open").click();
   assert.equal(await page.locator("#recovery-panel").isVisible(),true);
   await page.locator("#recovery-email").fill("ci@example.invalid");
   const recover=page.waitForRequest(r=>r.url().includes("/auth/v1/recover"));
   await page.locator("#recovery-request button[type=submit],#recovery-request button:not([type])").first().click();
   const recoveryRequest=await recover;
   assert.equal(new URL(recoveryRequest.url()).searchParams.get("redirect_to"),url);
   await page.locator("#recovery-code-form").waitFor({state:"visible"});
   const result=await page.evaluate(async()=>{
    const cfg=window.TRUMMPLANER_CONFIG;
    const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:"ci-test-only"}});
    const r=await client.from("tp_members").select("user_id,display_name");
    return {data:r.data,error:r.error?.message};
   });
   assert.equal(result.data?.[0]?.display_name,"CI",JSON.stringify(result));
   assert.ok(requests.includes("/auth/v1/token"));assert.ok(requests.includes("/rest/v1/tp_members"));
   assert.equal(errors.length,0,errors.join("\n"));
   assert.deepEqual(await page.evaluate(()=>window.__csp),[],"Unexpected CSP violations");
   await page.evaluate(()=>{
    const inline=document.createElement("script");inline.textContent="window.__injected=true";document.body.append(inline);
    const remote=document.createElement("script");remote.src="https://example.invalid/not-allowed.js";document.body.append(remote);
    const button=document.createElement("button");button.setAttribute("onclick","window.__injected=true");document.body.append(button);button.click();
   });
   await page.waitForFunction(()=>window.__csp.length>=2);
   assert.equal(await page.evaluate(()=>window.__injected),undefined);
   assert.ok(!external.includes("example.invalid"),"Unapproved script network request");
   assert.ok(!external.includes("esm.sh"),"External SDK request");
   await page.goto(url+"#error=access_denied&error_code=otp_expired&error_description=expired");
   await page.locator("#recovery-panel").waitFor({state:"visible"});
   await page.waitForFunction(()=>!location.hash);
   assert.equal(await page.locator("#recovery-message").textContent(),"Der Link ist ungültig oder abgelaufen. Fordere einen E-Mail-Code an.");
   await context.setOffline(true);await page.reload();await page.waitForFunction(()=>typeof window.supabase?.createClient==="function");
   assert.equal(await page.locator("#auth-form").isVisible(),true);
   console.log(environment+": Chromium: local SDK, login request (mock), REST query (mock), recovery screen, blocked injected script, SW install/cache and offline reload passed.");
  }finally{await context.close();}
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
