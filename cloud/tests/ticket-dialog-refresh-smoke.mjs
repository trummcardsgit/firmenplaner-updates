import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {JSDOM} from "jsdom";
import {createTicketCenter} from "../public/tickets.js";
const dom=new JSDOM('<div id="tp-ticket-subnav"></div><main id="content"></main>');
globalThis.document=dom.window.document;globalThis.FormData=dom.window.FormData;
dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute("open","")};
dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute("open")};
const fixture={tp_tickets:[{id:1,title:"Ticket",description:"Original",status:"open",creator_id:"u",company_id:"c"}],tp_companies:[{id:"c",name:"Firma"}],tp_members:[{user_id:"u",active:true,display_name:"Test"}]};
let pending=null,calls=[],failures=0;
const db={from(table){return {select(){return this},eq(){return this},order(){return this},async range(){if(table==="tp_tickets"&&pending)await pending;return {data:fixture[table]||[]}}}},async rpc(fn,args){calls.push({fn,args});return {data:fn==="tp_create_ticket"?2:null}}};
const timer=globalThis.setInterval;globalThis.setInterval=()=>0;
const center=createTicketCenter({db,userId:()=>"u",isAdmin:()=>false,notice(){},fail(){failures++}});
globalThis.setInterval=timer;
const content=document.getElementById("content");
content.innerHTML=center.page();await center.open();
const app=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
// Execute the actual guard from the global render path, not a reimplementation.
const guard=app.match(/if\(state\.view==="tickets"&&ticketCenter\.hasOpenDialog\(\)\)\{applyMenu\(document,menuPrefs,state\.isAdmin,state\.view\);return;\}/);
assert.ok(guard);assert.ok(app.indexOf(guard[0])<app.indexOf('$("content").innerHTML=state.view==='));
const render=new Function("state","ticketCenter","applyMenu","document","menuPrefs","content",guard[0]+'content.innerHTML=ticketCenter.page();');
const refreshApp=()=>render({view:"tickets",isAdmin:false},center,()=>{},document,{},content);
function draft(){
 document.querySelector('[data-tp-action="create"]').click();
 const dialog=document.querySelector("#tp-ticket-dialog"),form=dialog.querySelector("form");
 assert.ok(center.hasOpenDialog());
 form.elements.title.value="Draft title";form.elements.company.value="c";form.elements.priority.value="high";form.querySelector('[name="candidate"]').checked=true;
 const editor=form.querySelector(".tp-rich-surface");editor.innerHTML='<div data-rich-row class="tp-rich-check"><input type="checkbox" checked><span class="tp-rich-body"><b>Draft text</b></span></div>';
 const file=new dom.window.File(["attachment"],"draft.txt",{type:"text/plain"}),input=form.querySelector('[name="attachments"]');
 Object.defineProperty(input,"files",{value:[file],configurable:true});
 return {dialog,form,editor,input,file};
}
function preserved(d){
 assert.equal(document.querySelector("#tp-ticket-dialog"),d.dialog);
 assert.equal(document.querySelector("#tp-ticket-local-form"),d.form);
 assert.ok(center.hasOpenDialog());assert.equal(d.form.elements.title.value,"Draft title");assert.equal(d.form.elements.company.value,"c");assert.equal(d.form.elements.priority.value,"high");
 assert.equal(d.form.querySelector('[name="candidate"]').checked,true);assert.equal(d.editor.querySelector("b").textContent,"Draft text");assert.equal(d.editor.querySelector("input").checked,true);
 assert.equal(d.input.files[0],d.file);
}
let d=draft();
refreshApp();await center.open();await center.poll();preserved(d);
const escape=new dom.window.Event("cancel",{cancelable:true});d.dialog.dispatchEvent(escape);assert.ok(escape.defaultPrevented);preserved(d);
d.form.querySelector("#tp-ticket-cancel").click();assert.equal(center.hasOpenDialog(),false);
// Foreground read was started before the dialog opened; success must not redraw it.
let resolve;pending=new Promise(r=>resolve=r);const reading=center.open();d=draft();resolve();await reading;pending=null;preserved(d);
d.form.querySelector("#tp-ticket-cancel").click();
// An earlier failed read must not replace the form with the retry panel either.
let reject;pending=new Promise((_,r)=>reject=r);const failing=center.open();d=draft();reject(new Error("simulated network error"));await failing;pending=null;preserved(d);assert.equal(failures,0);
d.form.querySelector("#tp-ticket-cancel").click();
// Refresh still works after intentionally closing the form.
fixture.tp_tickets.push({id:2,title:"New data",description:"A",status:"open",creator_id:"u",company_id:"c"});
await center.open();assert.ok(document.querySelector('[data-ticket-id="2"]'));
d=draft();d.form.dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));
assert.equal(calls[0]?.fn,"tp_create_ticket");assert.equal(calls[0]?.args.p_title,"Draft title");assert.match(calls[0]?.args.p_description,/\[\[b\]\]Draft text/);
assert.equal(center.hasOpenDialog(),false);
console.log("Ticket dialogs: global rerender, polling, late read success/error, Escape, draft fields, file input identity, explicit cancellation and submission passed");
