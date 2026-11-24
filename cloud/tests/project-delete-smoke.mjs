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
assert.ok($("tp-project-delete"),"Editor must provide the delete action");

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
let allowed=true;
let confirms=[];
let deleted=0;
let notices=[];
const calls=[];
globalThis.confirm=question=>{confirms.push(question);return allowed;};
function fakeResponse(table,mode){
 if(mode==="delete"){
  if(table!=="tp_projects")throw Error("Wrong delete target");
  deleted++;
  state.projects=[];
  state.entries[0].project_id=null;
  state.documents[0].project_id=null;
  return {data:[{id:project}],error:null};
 }
 if(table==="tp_attachments"){
  return {data:hasAttachments?[{id:"file1",file_name:"Arbeitsanweisung.pdf"}]:[],error:null};
 }
 if(table==="tp_entries")return {count:1,error:null};
 if(table==="tp_documents")return {count:1,error:null};
 throw Error("Unexpected table "+table);
}
const db={from(table){
 let mode="read";
 const builder={
  select(){return this;},
  eq(k,v){calls.push({table,k,v});return this;},
  delete(){mode="delete";return this;},
  then(resolve,reject){return Promise.resolve(fakeResponse(table,mode)).then(resolve,reject);}
 };
 return builder;
}};
let refreshed=0;
const features=createFeatures({
 db,state,
 esc:x=>String(x),
 fmt:x=>String(x),
 notice:x=>notices.push(x),
 fail:x=>{throw x;},
 refresh:async()=>{refreshed++},
 company:id=>id===firm?"Musterfirma":"Unbekannt"
});
features.init();
const page=features.projectsPage();
assert.match(page,/data-project-delete=/,"The project list must expose delete action");
assert.match(page,/Irrtümlich angelegt/);
const actions=$("content");
actions.innerHTML=page;
actions.querySelector("[data-project-open]").click();
assert.equal($("tp-project-dialog").open,true);
assert.equal($("tp-project-delete").classList.contains("hidden"),false);
const savedId=$("tp-project-id").value;
assert.equal(savedId,project);

// A project with file attachments must not be removed, even when confirmation is allowed.
hasAttachments=true;
await assert.rejects(features.deleteProject(project),/Bitte diese zuerst im Projekt herunterladen oder löschen/);
assert.equal(deleted,0);
assert.equal(confirms.length,0,"Attachment block should happen before the confirmation prompt");
hasAttachments=false;

// User chooses cancel: nothing changes.
allowed=false;
assert.equal(await features.deleteProject(project),false);
assert.equal(deleted,0);
assert.match(confirms.at(-1),/1 verknüpfte Aufgabe/);
assert.match(confirms.at(-1),/1 Word-Dokument/);
assert.match(confirms.at(-1),/bleiben erhalten/);

// Deletion keeps dependent task and Word document, only breaks the project link.
allowed=true;
assert.equal(await features.deleteProject(project),true);
assert.equal(deleted,1);
assert.equal(refreshed,1);
assert.equal($("tp-project-dialog").open,false);
assert.equal(state.entries[0].project_id,null);
assert.equal(state.documents[0].project_id,null);
assert.match(notices.at(-1),/gelöscht/);
assert.ok(calls.some(q=>q.table==="tp_projects"&&q.k==="owner_id"&&q.v===owner));

// New projects have no delete button until saved.
actions.innerHTML='<button data-project-new>Neues Projekt</button>';
actions.querySelector("[data-project-new]").click();
assert.equal($("tp-project-delete").classList.contains("hidden"),true);
console.log("Projekt löschen: Attachments geschützt, Abbrechen, Daten erhalten, richtige Eigentümerprüfung, neue Projekte sicher.");
