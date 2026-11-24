import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
import {readFileSync} from "node:fs";
import {createFeatures} from "../public/extended.js";

const markup=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const dom=new JSDOM(markup,{url:"https://trummcardsgit.github.io/firmenplaner-updates/"});
globalThis.window=dom.window;
globalThis.document=dom.window.document;
globalThis.DOMParser=dom.window.DOMParser;
const $=id=>document.getElementById(id);
for(const dialog of document.querySelectorAll("dialog")){
 dialog.showModal=function(){this.setAttribute("open","");};
 dialog.close=function(){this.removeAttribute("open");};
}
assert.ok($("tp-project-delete"),"Project editor must provide deletion button");
assert.ok($("tp-project-delete-dialog"),"In-app confirmation dialog must exist");
assert.ok($("tp-project-delete-confirm"),"Confirmation dialog must offer explicit delete button");
const owner="11111111-1111-4111-8111-111111111111";
const firm="22222222-2222-4222-8222-222222222222";
const project="33333333-3333-4333-8333-333333333333";
const state={
 user:{id:owner},
 companies:[{id:firm,name:"Musterfirma"}],
 projects:[{id:project,company_id:firm,owner_id:owner,name:"Irrtümlich angelegt",summary:"",status:"active",content_html:""}],
 entries:[{id:"task1",kind:"task",project_id:project,company_id:firm,status:"open",title:"Wichtige Aufgabe"}],
 documents:[{id:"doc1",project_id:project,title:"Wichtiges Dokument",entry_id:null}],
 attachments:[]
};
let hasAttachments=false;
let deleteError=false;
let deleted=0;
let refreshed=0;
const notices=[];
const calls=[];
globalThis.confirm=()=>{throw new Error("Native confirm() must not be used for project deletion");};
const db={from(table){
 let mode="read";
 const query={
  eq(k,v){calls.push({table,k,v});return this;},
  delete(){mode="delete";return this;},
  select(){return this;},
  then(resolve,reject){
   return Promise.resolve().then(()=>{
    if(mode==="delete"){
     assert.equal(table,"tp_projects");
     if(deleteError)return {data:null,error:{message:"Testfehler von Supabase"}};
     deleted++;
     state.projects=[];
     state.entries[0].project_id=null;
     state.documents[0].project_id=null;
     return {data:[{id:project}],error:null};
    }
    if(table==="tp_attachments")return {data:hasAttachments?[{id:"file1",file_name:"Anleitung.pdf"}]:[],error:null};
    if(table==="tp_entries")return {count:1,error:null};
    if(table==="tp_documents")return {count:1,error:null};
    throw new Error("Unexpected table "+table);
   }).then(resolve,reject);
  }
 };
 return query;
}};
const features=createFeatures({
 db,state,esc:x=>String(x),fmt:x=>String(x),
 notice:x=>notices.push(x),fail:e=>{throw e;},refresh:async()=>{refreshed++;},
 company:c=>c===firm?"Musterfirma":"Unbekannt"
});
features.init();
const content=$("content");
content.innerHTML=features.projectsPage();
assert.ok(content.querySelector("[data-project-delete]"),"Project list should offer delete button");

// Delete from project list: a project with attachments is blocked with visible warning.
hasAttachments=true;
content.querySelector("[data-project-delete]").click();
await new Promise(resolve=>setImmediate(resolve));
assert.equal($("tp-project-delete-dialog").open,true);
assert.equal($("tp-project-delete-confirm").disabled,true);
assert.match($("tp-project-delete-error").textContent,/Anleitung\.pdf/);
assert.equal(deleted,0);
$("tp-project-delete-cancel").click();
assert.equal($("tp-project-delete-dialog").open,false);

// Delete from project editor: cancelling must not delete anything.
hasAttachments=false;
content.querySelector("[data-project-open]").click();
assert.equal($("tp-project-delete").classList.contains("hidden"),false);
$("tp-project-delete").click();
await new Promise(resolve=>setImmediate(resolve));
assert.equal($("tp-project-delete-dialog").open,true);
assert.match($("tp-project-delete-details").textContent,/1 Aufgabe/);
assert.match($("tp-project-delete-details").textContent,/1 Word-Dokument/);
assert.equal($("tp-project-delete-confirm").disabled,false);
$("tp-project-delete-cancel").click();
assert.equal(deleted,0);

// If Supabase fails the reason must remain visible, without closing the popup.
$("tp-project-delete").click();
await new Promise(resolve=>setImmediate(resolve));
deleteError=true;
$("tp-project-delete-confirm").click();
await new Promise(resolve=>setImmediate(resolve));
assert.equal(deleted,0);
assert.equal($("tp-project-delete-dialog").open,true);
assert.match($("tp-project-delete-error").textContent,/Testfehler von Supabase/);
deleteError=false;
$("tp-project-delete-cancel").click();

// Successful deletion must preserve task and Word document while removing project.
$("tp-project-delete").click();
await new Promise(resolve=>setImmediate(resolve));
$("tp-project-delete-confirm").click();
await new Promise(resolve=>setImmediate(resolve));
assert.equal(deleted,1);
assert.equal(refreshed,1);
assert.equal($("tp-project-delete-dialog").open,false);
assert.equal($("tp-project-dialog").open,false);
assert.equal(state.entries[0].project_id,null);
assert.equal(state.documents[0].project_id,null);
assert.match(notices.at(-1),/gelöscht/);
assert.ok(calls.some(x=>x.table==="tp_projects"&&x.k==="owner_id"&&x.v===owner));
// Starting an unsaved project does not show the delete button.
content.innerHTML='<button data-project-new>Neues Projekt</button>';
content.querySelector("[data-project-new]").click();
assert.equal($("tp-project-delete").classList.contains("hidden"),true);
console.log("Projektloeschung getestet: Listenklick, eigenes Bestaetigungsfenster, Dateianhang-Block, Abbruch, Backend-Fehler, sichere Loeschung.");
