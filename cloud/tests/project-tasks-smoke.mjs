import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {JSDOM} from "jsdom";
import {createFeatures} from "../public/extended.js";

const html=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const app=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
const doc=new JSDOM(html,{url:"https://trummcardsgit.github.io/firmenplaner-updates/"});
globalThis.window=doc.window;
globalThis.document=doc.window.document;
globalThis.DOMParser=doc.window.DOMParser;
const $=id=>document.getElementById(id);
for(const dialog of document.querySelectorAll("dialog")){
 dialog.showModal=function(){this.setAttribute("open","");};
 dialog.close=function(){this.removeAttribute("open");this.dispatchEvent(new window.Event("close"));};
}
const companyA="11111111-1111-4111-8111-111111111111";
const companyB="22222222-2222-4222-8222-222222222222";
const projectA="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const projectB="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const taskA="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const taskB="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const state={
 user:{id:"example"},companies:[{id:companyA,name:"Firma A"},{id:companyB,name:"Firma B"}],
 entries:[
  {id:taskA,kind:"task",company_id:companyA,project_id:projectA,title:"Server installieren",status:"open",due_at:null},
  {id:taskB,kind:"task",company_id:companyA,project_id:projectA,title:"Server testen",status:"done",due_at:null},
  {id:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",kind:"task",company_id:companyB,project_id:projectB,title:"Drucker prüfen",status:"open"}
 ],projects:[
  {id:projectA,company_id:companyA,name:"Serverumstellung",status:"active",summary:"Test",content_html:"",updated_at:"2026-11-24T12:00:00Z"},
  {id:projectB,company_id:companyB,name:"Drucker",status:"active",summary:"",content_html:"",updated_at:"2026-11-24T12:00:00Z"}
 ],attachments:[],documents:[],
};
const opened=[],filtered=[];
const features=createFeatures({
 db:{},state,esc:x=>String(x).replace(/[&<>"]/g,""),fmt:x=>String(x),
 notice:()=>{},fail:e=>{throw e},refresh:async()=>{},company:id=>state.companies.find(c=>c.id===id)?.name||"Unbekannt",
 openTask:args=>opened.push(args),showProjectTasks:args=>filtered.push(args)
});
assert.ok($("entry-project"),"Aufgaben benötigen ein Projekt-Dropdown");
assert.ok($("task-company-filter")===null,"Aufgabenfilter wird dynamisch gerendert");
const forA=features.projectOptions(companyA,projectA);
assert.match(forA,/Serverumstellung/);
assert.doesNotMatch(forA,/Drucker/);
assert.match(forA,/Ohne Projekt/);
assert.match(forA,/selected/);
const forAll=features.projectOptions();
assert.match(forAll,/Firma A · Serverumstellung/);
assert.match(forAll,/Firma B · Drucker/);
assert.match(features.projectOptions(companyA,"__none__"),/value="__none__" selected/);
assert.equal(features.projectName(projectA),"Serverumstellung");
const page=features.projectsPage();
assert.match(page,/2 Aufgaben/);
assert.match(page,/1 offene Aufgaben/);
assert.match(page,/Projekt öffnen/);
assert.match(app,/task-project-filter/);
assert.match(app,/features\.taskProject==="__none__"/);
assert.match(app,/project_id:kind==="task"/);
assert.match(app,/updateEntryProjectSelect/);
const content=$("content");
features.init();
content.innerHTML=page;
content.querySelector('[data-project-open="'+projectA+'"]').click();
assert.equal($("tp-project-dialog").open,true);
assert.equal($("tp-project-id").value,projectA);
assert.match($("tp-project-tasks").textContent,/Server installieren/);
assert.match($("tp-project-tasks").textContent,/Server testen/);
assert.doesNotMatch($("tp-project-tasks").textContent,/Drucker prüfen/);
assert.match($("tp-project-tasks").textContent,/1 offen/);
$("tp-project-new-task").click();
assert.equal(opened.length,1);
assert.equal(opened[0].companyId,companyA);
assert.equal(opened[0].projectId,projectA);
$("tp-project-tasks").querySelector('[data-project-task-edit="'+taskA+'"]').click();
assert.equal(opened.at(-1).entryId,taskA);
$("tp-project-tasks").querySelector("[data-project-task-filter]").click();
assert.equal(filtered[0].projectId,projectA);
assert.equal(filtered[0].companyId,companyA);
assert.equal($("tp-project-dialog").open,false);
console.log("Projekt-/Aufgaben-Tests erfolgreich: Firmenfilter, Projektauswahl, Projektaufgaben, neues Ticket und Projektwechsel.");
