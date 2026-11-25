import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {JSDOM} from "jsdom";

const read=name=>readFileSync(new URL("../public/"+name,import.meta.url),"utf8");
const html=read("index.html");
const base=read("styles.css");
const theme=read("vice-city-theme.css");
const manifest=JSON.parse(read("manifest.webmanifest"));
const serviceWorker=read("sw.js");
const dom=new JSDOM(html,{url:"https://trummcardsgit.github.io/firmenplaner-updates/"});
const doc=dom.window.document;
assert.equal(doc.body.className,"vice-city-theme");
const styles=[...doc.querySelectorAll('link[rel="stylesheet"]')].map(e=>e.getAttribute("href"));
assert.deepEqual(styles,["./styles.css","./vice-city-theme.css"],"New palette must override original CSS");
assert.equal(doc.querySelector('meta[name="theme-color"]').content,"#201735");
assert.equal(manifest.background_color,"#13142e");
assert.equal(manifest.theme_color,"#201735");
assert.ok(serviceWorker.includes('"./vice-city-theme.css"'),"Offline app must cache the theme");
assert.ok(serviceWorker.includes('trummplaner-pwa-v1.6.0'),"PWA cache must bump to update installed clients");

// A valid stylesheet with meaningful rules, not a placeholder/mockup.
const style=doc.createElement("style");
style.textContent=theme;
doc.head.appendChild(style);
assert.ok(style.sheet?.cssRules.length>50,"New stylesheet must parse into CSSOM rules");
for(const key of [
 "--vc-pink","#ff6bb6","--vc-lavender","#b38cf4","--vc-coral","#ff927c",
 "--vc-aqua","#73e3dc","linear-gradient","radial-gradient",
 ".vice-city-theme .auth-panel",".vice-city-theme .sidebar",
 ".vice-city-theme .topbar",".vice-city-theme .metric",
 ".vice-city-theme .panel",".vice-city-theme .item",
 ".vice-city-theme .bottom-nav",".vice-city-theme .tp-due-presets>button",
 ".vice-city-theme .tp-dictation",".vice-city-theme .tp-word-appbar",
 ".vice-city-theme .tp-word-paper"
])assert.ok(theme.includes(key),"Missing important palette/section "+key);
assert.ok(!/url\s*\(/i.test(theme),"Theme should be self-contained, with no third-party background assets");
assert.ok(!/display\s*:\s*none\s*!important/i.test(theme),"Do not hide existing app features");
// Original white Word paper, tables, forms, projects and dictation remain in base stylesheet.
for(const feature of [
 ".tp-word-paper",".tp-rich-editor table",".tp-dictation",
 ".tp-due-presets",".tp-project-task-row",".tp-project-delete-dialog"
])assert.ok(base.includes(feature),"Core feature CSS unexpectedly removed: "+feature);
for(const id of ["entry-due","entry-remind","entry-project","tp-project-delete","tp-document-dialog"])
 assert.ok(doc.getElementById(id),"Core app input unexpectedly removed: "+id);
const text=dom.window.getComputedStyle(doc.querySelector(".topbar"));
assert.ok(text.backgroundImage.includes("gradient")||theme.includes(".vice-city-theme .topbar{"),
 "Topbar should have a visible sunset background");
console.log("Vice City Sunset theme smoke test passed: CSS parses, 4 accent colors, dashboard/auth/mobile/editor, no copied assets, existing form fields and PWA caching.");
