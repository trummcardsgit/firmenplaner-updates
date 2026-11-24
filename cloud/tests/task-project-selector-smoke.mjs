import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
import {readFileSync} from "node:fs";
import {createTaskProjectSelector} from "../public/task-projects.js";

const doc=new JSDOM(readFileSync(new URL("../public/index.html",import.meta.url),"utf8")).window.document;
globalThis.document=doc;
const $=id=>doc.getElementById(id);
const firmaA="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const firmaB="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const owner="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const pA="11111111-1111-4111-8111-111111111111";
const pB="22222222-2222-4222-8222-222222222222";
$("entry-company").innerHTML='<option value="'+firmaA+'">Firma A</option><option value="'+firmaB+'">Firma B</option>';
$("entry-company").value=firmaA;
$("entry-kind").value="task";
const tasks=[];
const db={from(table){
 assert.equal(table,"tp_projects");
 let filters={};
 return {
  select(columns){assert.equal(columns,"id,name,company_id");return this;},
  eq(key,value){filters[key]=value;return this;},
  order(column){
   assert.equal(column,"name");
   const request={filters};
   tasks.push(request);
   return new Promise(resolve=>{request.resolve=resolve;});
  }
 };
}};
const select=createTaskProjectSelector({
 db,companySelect:$("entry-company"),kindSelect:$("entry-kind"),
 projectSelect:$("entry-project"),projectField:$("entry-project-field"),
 hint:$("entry-project-hint"),ownerId:()=>owner,
 submitButton:$("entry-form").querySelector("button.primary"),
 onError:err=>{throw err;}
});
// Open a new task with an empty app cache; projects must come from live query.
const first=select.refresh();
assert.equal($("entry-project").disabled,true);
assert.equal($("entry-form").querySelector("button.primary").disabled,true);
assert.equal(tasks[0].filters.owner_id,owner);
assert.equal(tasks[0].filters.company_id,firmaA);
tasks[0].resolve({data:[{id:pA,name:"Serverumstellung",company_id:firmaA}]});
await first;
assert.equal($("entry-project").disabled,false);
assert.equal($("entry-form").querySelector("button.primary").disabled,false);
assert.equal($("entry-project").options.length,2);
assert.equal($("entry-project").options[1].value,pA);
assert.match($("entry-project-hint").textContent,/1 Projekt/);
// Switching company must query it and discard stale results when requests overlap.
const old=select.refresh(pA);
$("entry-company").value=firmaB;
const newer=select.refresh();
assert.equal(tasks[1].filters.company_id,firmaA);
assert.equal(tasks[2].filters.company_id,firmaB);
tasks[2].resolve({data:[{id:pB,name:"Drucker",company_id:firmaB}]});
await newer;
tasks[1].resolve({data:[{id:pA,name:"Serverumstellung",company_id:firmaA}]});
await old;
assert.equal($("entry-project").options[1].value,pB);
assert.doesNotMatch($("entry-project").innerHTML,/Serverumstellung/);
assert.equal($("entry-project").value,"");
// Existing task must preserve its valid previously selected project.
const edit=select.refresh(pB);
tasks[3].resolve({data:[{id:pB,name:"Drucker",company_id:firmaB}]});
await edit;
assert.equal($("entry-project").value,pB);
// Switching to notes hides selector, without an extra request.
$("entry-kind").value="note";
await select.refresh();
assert.equal($("entry-project-field").classList.contains("hidden"),true);
assert.equal($("entry-project").disabled,true);
// Empty firm projects clearly reported, not confused with fetch failure.
$("entry-kind").value="task";
const empty=select.refresh();
tasks[4].resolve({data:[]});
await empty;
assert.match($("entry-project-hint").textContent,/noch kein Projekt/);
assert.equal($("entry-project").value,"");
console.log("Task project dropdown tests passed: live company search, race protection, existing selection, no-project state and notes.");
