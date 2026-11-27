import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {JSDOM} from "jsdom";

const root=new URL("../public/",import.meta.url);
const read=name=>readFileSync(new URL(name,root),"utf8");
const html=read("index.html");
const theme=read("vice-city-theme.css");
const sw=read("sw.js");
const doc=new JSDOM(html,{url:"https://trummcardsgit.github.io/firmenplaner-updates/"}).window.document;
const labels={
 dashboard:["Übersicht","Start"],
 tasks:["Aufgaben","Aufgaben"],
 notes:["Notizen","Notizen"],
 solutions:["Lösungen","Lösungen"],
 projects:["Projekte","Projekte"],
 documents:["Word-Dokumente","Word"],
 companies:["Firmen","Firmen"],
 settings:["Einstellungen","Mehr"]
};
const views=Object.keys(labels);
const desktop=doc.querySelectorAll("#nav button[data-view]");
const mobile=doc.querySelectorAll(".bottom-nav button[data-view]");
assert.equal(desktop.length,13,"Nine original sections plus Tickets and Admin");
assert.equal(mobile.length,13,"Nine original sections plus mobile Tickets and Admin");
for(const nav of ["#nav",".bottom-nav"]){
 const admin=doc.querySelector(nav+' button[data-view="admin"]');
 assert.ok(admin?.hidden,"Admin must be hidden before authorization");
 assert.ok(doc.querySelector(nav+' button[data-view="tickets"]'),"Ticket menu entry missing");
}
assert.ok(read("admin.css").includes("[data-view=admin][hidden]"),"Hidden admin navigation must override layout styles");
for(const [root,label] of [["#nav","Karriere"],[".bottom-nav","Rang"]]){
 const career=doc.querySelector(root+' button[data-view="career"]');
 assert.ok(career,"Karriere entry missing");
 assert.ok(career.querySelector(".tp-game-nav-glyph"),"Career has its own rank icon");
 assert.equal(career.textContent.trim(),"✦"+label);
}
for(const [index,view] of views.entries()){
 const d=doc.querySelector('#nav button[data-view="'+view+'"]');
 const m=doc.querySelector('.bottom-nav button[data-view="'+view+'"]');
 assert.ok(d,"Desktop menu entry missing: "+view);
 assert.ok(m,"Mobile menu entry missing: "+view);
 for(const [button,label] of [[d,labels[view][0]],[m,labels[view][1]]]){
  const icon=button.querySelector("span.tp-nav-icon.tp-nav-icon--"+view);
  assert.ok(icon,"Missing or wrong neon icon for "+view);
  assert.equal(icon.getAttribute("aria-hidden"),"true","Artwork must remain decorative");
  assert.equal(button.textContent.trim(),label,"Menu text and accessible name must remain unchanged");
  assert.equal(button.getAttribute("data-view"),view,"Navigation action must remain unchanged");
 }
 assert.ok(theme.includes(".tp-nav-icon--"+view),"Missing sprite position for "+view);
 assert.ok(theme.includes(".bottom-nav .tp-nav-icon--"+view),"Missing mobile offset for "+view);
 assert.ok(theme.includes("background-position:"+(-36*index)+"px 0"),"Incorrect desktop crop for "+view);
 assert.ok(theme.includes("background-position:"+(-30*index)+"px 0"),"Incorrect mobile crop for "+view);
}
assert.ok(doc.querySelector('#nav button[data-view="dashboard"]').classList.contains("active"));
assert.ok(doc.querySelector('.bottom-nav button[data-view="dashboard"]').classList.contains("active"));
assert.ok(theme.includes('url("./icons/nav-vicecity.webp")'),"CSS must reference image file");
assert.ok(sw.includes('"./icons/nav-vicecity.webp"'),"PWA offline assets must include icon strip");
assert.match(sw,/const CACHE=CACHE_PREFIX\+"v\d+\.\d+\.\d+(?:-dev\.\d+)?(?:-[a-z0-9.-]+)?"/,"PWA cache must be versioned");

const webp=readFileSync(new URL("icons/nav-vicecity.webp",root));
assert.ok(webp.length>1000&&webp.length<20000,"Sprite should be reasonably optimized");
assert.equal(webp.subarray(0,4).toString("ascii"),"RIFF");
assert.equal(webp.subarray(8,12).toString("ascii"),"WEBP");
assert.equal(webp.subarray(12,16).toString("ascii"),"VP8X");
const width=1+webp.readUIntLE(24,3);
const height=1+webp.readUIntLE(27,3);
assert.deepEqual([width,height],[384,48],"Sprite must contain exactly eight 48x48 originals");

// Verify style rules can be parsed by jsdom.
const style=doc.createElement("style");
style.textContent=theme;
doc.head.appendChild(style);
assert.ok(style.sheet.cssRules.length>50);
console.log("Neon-Menueicons erfolgreich: 8 richtige Motive plus Karriere auf Desktop und Handy, Labels erhalten, WebP 384x48, PWA-Cache.");

const custom=read("game-progression.css");for(const view of [...views,"career"]){const path="icons/nav-"+view+".webp";assert.ok(custom.includes(path));assert.ok(sw.includes(path));const bytes=readFileSync(new URL(path,root));assert.equal(bytes.subarray(0,4).toString(),"RIFF");assert.equal(bytes.subarray(8,12).toString(),"WEBP");}

const premium={
 inventory:{label:["Inventar","Inventar"],hash:"69c5aa5fb35dd1fac09bdcf878ed1019f71e65ad3ba740496df90ce46402bad1"},
 statistics:{label:["Statistikcenter","Statistik"],hash:"fdc46de85a181caa0003f5f144ab5f9baa0c9908eaa6b93f47b344e88b2e81e2"}
};
for(const [view,item] of Object.entries(premium)){
 const path="icons/hd-"+view+".avif",bytes=readFileSync(new URL(path,root));
 assert.equal(bytes.subarray(4,12).toString("ascii"),"ftypavif");
 assert.equal(createHash("sha256").update(bytes).digest("hex"),item.hash,"Approved image must match exactly");
 assert.ok(sw.includes('"./'+path+'"'));
 for(const [i,nav] of ["#nav",".bottom-nav"].entries()){
  const button=doc.querySelector(nav+' button[data-view="'+view+'"]');
  const icon=button.querySelector("img.tp-menu-premium-icon");
  assert.equal(icon.getAttribute("src"),"./"+path);
  assert.equal(icon.getAttribute("aria-hidden"),"true");
  assert.equal(icon.alt,"");
  assert.equal(button.textContent.trim(),item.label[i]);
 }
}
assert.match(read("app.js"),/\["inventory","statistics"\]\.includes\(state\.view\)\?"\.\/icons\/hd-"\+state\.view\+"\.avif"/);
assert.match(custom,/\.tp-menu-premium-icon\{display:block;width:38px;height:38px;object-fit:contain/);
console.log("Approved Inventory and Statistics icons: exact artwork hashes, both navigation layouts, header art, and offline assets verified.");
