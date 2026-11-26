import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
import {ticketTextHtml,ticketEditorMarkup,mountTicketEditor,checklistEnter,canEditTicketDescription} from "../public/ticket-text-editor.js";
const html=ticketTextHtml("**Fett** *Kursiv* __Unter__ ~~Strich~~\n- [ ] A\n- [x] B\n<img src=x onerror=alert(1)>\n## Titel");
assert.match(html,/<strong>Fett<\/strong>/);assert.match(html,/<em>Kursiv<\/em>/);assert.match(html,/<u>Unter<\/u>/);assert.match(html,/<s>Strich<\/s>/);
assert.match(html,/checked disabled/);assert.doesNotMatch(html,/<img|<script/);
assert.deepEqual(checklistEnter("- [ ] A",7),{value:"- [ ] A\n- [ ] ",cursor:14});
assert.deepEqual(checklistEnter("- [ ] ",6),{value:"",cursor:0});
assert.equal(checklistEnter("normal",6),null);
const dom=new JSDOM(ticketEditorMarkup("description","Beschreibung",20000,"Test"));
const root=dom.window.document.querySelector("[data-ticket-editor]"),area=root.querySelector("textarea");mountTicketEditor(root);
area.setSelectionRange(0,4);root.querySelector('[data-rich-command="bold"]').click();
assert.equal(area.value,"**Test**");assert.match(root.querySelector(".tp-rich-preview").innerHTML,/<strong>Test<\/strong>/);
area.value="Aufgabe";area.setSelectionRange(7,7);root.querySelector('[data-rich-command="check"]').click();
assert.equal(area.value,"- [ ] Aufgabe");assert.equal(area.selectionStart,area.value.length);
area.dispatchEvent(new dom.window.KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true}));assert.equal(area.value,"- [ ] Aufgabe\n- [ ] ");
const box=root.querySelector("input[data-check-line]");box.checked=true;box.dispatchEvent(new dom.window.Event("change",{bubbles:true}));
assert.equal(area.value,"- [x] Aufgabe\n- [ ] ");
const t={id:1,creator_id:"a",assignee_id:null,status:"open"},cs=[{ticket_id:1,user_id:"b",response:"pending"}];
assert.ok(canEditTicketDescription(t,"a",false,cs));assert.ok(canEditTicketDescription(t,"b",false,cs));assert.ok(canEditTicketDescription(t,"c",true,cs));
assert.equal(canEditTicketDescription(t,"c",false,cs),false);assert.equal(canEditTicketDescription({...t,status:"closed"},"a",true,cs),false);
console.log("Ticket editor: formatting, safe preview, checkbox continuation, checked state and permissions passed");

import {createTicketCenter} from "../public/tickets.js";
const ui=new JSDOM('<div id="tp-ticket-subnav"></div><main id="content"></main>');
globalThis.document=ui.window.document;globalThis.FormData=ui.window.FormData;
ui.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute("open","")};
ui.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute("open")};
const fixture={tp_tickets:[
 {id:1,title:"Editable",description:"Original",status:"accepted",creator_id:"a",assignee_id:"a",company_id:"c"},
 {id:2,title:"Closed",description:"Completed",status:"closed",creator_id:"a",assignee_id:"a",company_id:"c"},
 {id:3,title:"Foreign",description:"Other",status:"open",creator_id:"b",company_id:"c"}
],tp_companies:[{id:"c",name:"CI"}],tp_members:[{user_id:"a",active:true,display_name:"A"}],tp_ticket_events:[]};
let calls=[];
const db={from(table){return {select(){return this},eq(){return this},order(){return this},async range(){return {data:fixture[table]||[]}}}},
 async rpc(fn,args){calls.push({fn,args});if(fn==="tp_edit_ticket_description"){fixture.tp_tickets[0].description=args.p_description;fixture.tp_ticket_events.push({ticket_id:1,kind:"description_edited",message:"Edited"});}
 if(fn==="tp_ticket_comment")fixture.tp_ticket_events.push({ticket_id:1,kind:"comment",message:args.p_message});return {data:null};}};
const timer=globalThis.setInterval;globalThis.setInterval=()=>0;
const center=createTicketCenter({db,userId:()=>"a",isAdmin:()=>false,notice(){},fail(e){throw e}});
globalThis.setInterval=timer;
document.getElementById("content").innerHTML=center.page();await center.open();
document.querySelector("#tp-ticket-status").value="";document.querySelector("#tp-ticket-status").dispatchEvent(new ui.window.Event("change"));
assert.ok(document.querySelector('[data-ticket-id="1"] [data-tp-action="edit-description"]'));
assert.equal(document.querySelector('[data-ticket-id="2"] [data-tp-action="edit-description"]'),null);
assert.equal(document.querySelector('[data-ticket-id="3"] [data-tp-action="edit-description"]'),null);
document.querySelector('[data-ticket-id="1"] [data-tp-action="edit-description"]').click();
let form=document.querySelector("#tp-ticket-local-form");
assert.equal(form.querySelector("textarea").value,"Original");
form.querySelector("textarea").value="**New**\n- [x] Done";
form.dispatchEvent(new ui.window.Event("submit",{bubbles:true,cancelable:true}));
await new Promise(r=>setTimeout(r,0));
assert.deepEqual(calls[0],{fn:"tp_edit_ticket_description",args:{p_ticket:"1",p_description:"**New**\n- [x] Done",p_expected:"Original"}});
assert.match(document.querySelector('[data-ticket-id="1"] .tp-ticket-description').innerHTML,/<strong>New<\/strong>/);
document.querySelector('[data-ticket-id="1"] [data-tp-action="comment"]').click();
form=document.querySelector("#tp-ticket-local-form");assert.ok(form.querySelector("[data-rich-command=check]"));
form.querySelector("textarea").value="__Note__\n- [ ] Todo";
form.dispatchEvent(new ui.window.Event("submit",{bubbles:true,cancelable:true}));
await new Promise(r=>setTimeout(r,0));
assert.equal(calls[1].fn,"tp_ticket_comment");assert.match(document.querySelector('[data-ticket-id="1"] .tp-ticket-event:last-child').innerHTML,/<u>Note<\/u>/);
console.log("Ticket cards: edit visibility, actual edit dialog, expected version, comment submit and rendered result passed");
