import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
import {readFileSync} from "node:fs";
import {dueDateForPreset,installDueDatePresets} from "../public/due-presets.js";

const html=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const dom=new JSDOM(html,{url:"https://trummcardsgit.github.io/firmenplaner-updates/"});
const doc=dom.window.document;
const $=id=>doc.getElementById(id);
const fixed=()=>new Date(2026,10,25,11,41,0);
assert.equal(dueDateForPreset("today",fixed()),"2026-11-25T17:00");
assert.equal(dueDateForPreset("tomorrow",fixed()),"2026-11-26T17:00");
assert.equal(dueDateForPreset("threeDays",fixed()),"2026-11-28T17:00");
assert.equal(dueDateForPreset("oneWeek",fixed()),"2026-12-02T17:00");
assert.equal(dueDateForPreset("twoWeeks",fixed()),"2026-12-09T17:00");
assert.equal(dueDateForPreset("month",fixed()),"2026-12-25T17:00");
assert.equal(dueDateForPreset("none",fixed()),"");
assert.equal(dueDateForPreset("month",new Date(2027,0,31)),"2027-02-28T17:00");
assert.equal(dueDateForPreset("month",new Date(2028,0,31)),"2028-02-29T17:00");
assert.equal(dueDateForPreset("twoWeeks",new Date(2026,2,25)),"2026-04-08T17:00");
assert.throws(()=>dueDateForPreset("nonsense",fixed()),/Unbekannte Datumsvorlage/);

$("entry-kind").value="task";
$("entry-due").value="";
$("entry-remind").value="2026-11-30T08:00";
const controls=installDueDatePresets(doc,{now:fixed});
const group=$("tp-due-presets");
for(const key of ["today","tomorrow","threeDays","oneWeek","twoWeeks","month","none"])
 assert.ok(group.querySelector('[data-due-preset="'+key+'"]'),"Missing preset "+key);
let inputEvents=0,changeEvents=0;
$("entry-due").addEventListener("input",()=>inputEvents++);
$("entry-due").addEventListener("change",()=>changeEvents++);
const press=key=>group.querySelector('[data-due-preset="'+key+'"]').click();
press("oneWeek");
assert.equal($("entry-due").value,"2026-12-02T17:00");
assert.equal($("entry-remind").value,"2026-11-30T08:00","Separate reminder must not be modified");
assert.equal(group.querySelector('[data-due-preset="oneWeek"]').getAttribute("aria-pressed"),"true");
assert.equal(inputEvents,1);
assert.equal(changeEvents,1);
assert.match($("tp-due-hint").textContent,/02\.12\.2026/);
press("twoWeeks");
assert.equal($("entry-due").value,"2026-12-09T17:00");
press("month");
assert.equal($("entry-due").value,"2026-12-25T17:00");
// Manual user input remains authoritative; active shortcut is cleared.
$("entry-due").value="2027-01-05T09:30";
$("entry-due").dispatchEvent(new dom.window.Event("input",{bubbles:true}));
assert.equal($("entry-due").value,"2027-01-05T09:30");
assert.equal([...group.querySelectorAll('[aria-pressed="true"]')].length,0);
assert.match($("tp-due-hint").textContent,/05\.01\.2027/);
press("none");
assert.equal($("entry-due").value,"");
assert.match($("tp-due-hint").textContent,/Kein Fälligkeitstermin/);
// Reopening an existing task can resync the highlight without overriding its date.
$("entry-due").value="2026-12-09T17:00";
controls.sync();
assert.equal(group.querySelector('[data-due-preset="twoWeeks"]').getAttribute("aria-pressed"),"true");
// Notes do not offer a meaningless due date field.
$("entry-kind").value="note";
$("entry-kind").dispatchEvent(new dom.window.Event("change",{bubbles:true}));
assert.equal($("tp-due-field").classList.contains("hidden"),true);
assert.equal($("entry-remind-field").classList.contains("hidden"),true);
press("tomorrow");
assert.equal($("entry-due").value,"2026-12-09T17:00","Presets must not edit notes");
$("entry-kind").value="task";
$("entry-kind").dispatchEvent(new dom.window.Event("change",{bubbles:true}));
assert.equal($("tp-due-field").classList.contains("hidden"),false);
assert.equal($("entry-remind-field").classList.contains("hidden"),false);

const app=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
assert.match(app,/installDueDatePresets\(document\)/);
assert.match(app,/duePresets\.sync\(\)/);
assert.match(app,/due_at:kind==="note"\?null:iso\(\$\("entry-due"\)\.value\)/);
console.log("Fälligkeit getestet: Heute, Morgen, 3 Tage, 1/2 Wochen, Monat, Monatsende, freies Datum, Uhrzeit, Erinnerungen, Notizen und Speicherung.");
