import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
import {createOutlook} from "../public/outlook.js";
import {readFileSync} from "node:fs";

const documentHtml=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const dom=new JSDOM(documentHtml,{url:"https://trummcardsgit.github.io/firmenplaner-updates/"});
globalThis.window=dom.window;
globalThis.document=dom.window.document;
window.TRUMMPLANER_CONFIG={supabaseUrl:"https://example.supabase.co",supabasePublishableKey:"test_public_key"};
const requests=[];
const account={
 configured:true,connected:true,active:true,status:"active",email:"example@company.at",
 folder:"Aufgaben",folderId:"selected-123",companyId:"company-1",imported:8,phase:"live",
 lastSyncedAt:"2026-11-24T09:00:00Z"
};
globalThis.fetch=async (url,opts)=>{
 assert.equal(url,"https://example.supabase.co/functions/v1/tp-outlook");
 assert.equal(opts.headers.Authorization,"Bearer mock-user-access-token");
 assert.notEqual(opts.headers.apikey,"service_role");
 const payload=JSON.parse(opts.body);
 requests.push(payload);
 if(payload.action==="status")return {ok:true,json:async()=>account};
 if(payload.action==="folders")return {ok:true,json:async()=>({folders:[{id:"selected-123",name:"Aufgaben",path:"Posteingang / Aufgaben"}]})};
 if(payload.action==="syncNow")return {ok:true,json:async()=>({ok:true,imported:2})};
 return {ok:true,json:async()=>({ok:true,...account})};
};
const state={isAdmin:true,user:{id:"user-1"},companies:[{id:"company-1",name:"Firma A"}]};
const fakeDB={auth:{getSession:async()=>({data:{session:{access_token:"mock-user-access-token"}}})}};
let notices=[];
let renders=0;
const outlook=createOutlook({
 db:fakeDB,state,escapeHtml:s=>s.replace(/[<>"&]/g,""),notice:s=>notices.push(s),
 fail:e=>{throw e},refreshView:()=>{renders++},showSettings:()=>{}
});
await outlook.loadStatus();
assert.equal(requests.at(-1).action,"status");
const panel=outlook.panel();
assert.match(panel,/Outlook-Unterordner/);
assert.match(panel,/Postfach trennen/);
assert.match(panel,/Ordner laden/);
assert.match(panel,/Letzter Abgleich/);
assert.match(panel,/Nur E-Mails/);
assert.doesNotMatch(panel,/refresh_token|client_secret|secret_value/i,"Secrets must not be reflected");
const wrapper=document.createElement("div");
wrapper.innerHTML=panel;
document.body.appendChild(wrapper);
outlook.bind();
const folderButton=document.getElementById("tp-outlook-folders");
assert.ok(folderButton);
folderButton.click();
await new Promise(resolve=>setTimeout(resolve,5));
assert.ok(requests.some(r=>r.action==="folders"),"Folder discovery should invoke backend");
assert.equal(renders,1);
state.isAdmin=false;
assert.equal(outlook.panel(),"","Non-admins must not see Outlook management UI");
console.log("Outlook frontend smoke test passed: admin-only UI, secure authenticated requests, folder selection and state.");
