import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
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
assert.equal(desktop.length,8);
assert.equal(mobile.length,8);
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
assert.match(sw,/const CACHE="trummplaner-pwa-v\d+\.\d+\.\d+"/,"PWA cache must be versioned");

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
console.log("Neon-Menueicons erfolgreich: 8 richtige Motive auf Desktop und Handy, Labels erhalten, WebP 384x48, PWA-Cache.");
