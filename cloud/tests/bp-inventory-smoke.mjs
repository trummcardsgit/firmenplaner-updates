import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
import {readFileSync} from "node:fs";
import {inventoryMarkup,equippedRewards,applyEquipment,equipReward,cosmeticFeedback,callingCardMarkup} from "../public/bp-inventory.js";
const rows=[{season_id:1,level:1,name:"<script>",slot:"emblem",glyph:"★",rarity:"rare",equipped:true},{season_id:1,level:2,name:"Night Shift",slot:"title",glyph:"☾",rarity:"common",equipped:true},{season_id:1,level:5,name:"Neon Pink",slot:"frame",glyph:"◇",rarity:"rare",equipped:false}];
const doc=new JSDOM('<body><div class="tp-user-profile"><button data-profile-picture></button><div class="tp-profile-info"><strong data-profile-name>Test</strong></div></div><div id="toast">OK</div>'+inventoryMarkup(rows)+'</body>').window.document;
assert.equal(doc.querySelectorAll("[data-bp-equip]").length,3);assert.equal(doc.querySelectorAll('[data-bp-active="true"]').length,2);assert.equal(doc.querySelectorAll("script").length,0);assert.equal(doc.querySelector('[data-bp-equip="1:5"]').textContent,"Ausrüsten");
applyEquipment(doc,rows);assert.equal(doc.querySelector(".tp-profile-info [data-profile-name]").textContent,"Test");assert.equal(doc.querySelector(".tp-profile-info [data-profile-name]").nextElementSibling.textContent,"[Night Shift]");assert.equal(doc.querySelector(".tp-profile-info .tp-calling-emblem img").getAttribute("src"),"./icons/bp-reward-1.svg");assert.equal(doc.body.dataset.bpFrame,undefined);
const changed=rows.map(r=>r.level===5?{...r,equipped:true}:r);applyEquipment(doc,changed);assert.equal(doc.body.dataset.bpFrame,"5");assert.equal(doc.querySelectorAll(".tp-profile-info .tp-calling-title").length,1);
applyEquipment(doc,[]);assert.equal(doc.body.dataset.bpFrame,undefined);assert.equal(doc.querySelector(".tp-profile-info .tp-calling-title"),null);assert.equal(doc.querySelector(".tp-profile-calling-card").dataset.cardArt,"0");
const effect={season_id:1,level:14,name:"Sunset Flash",slot:"effect",glyph:"✴",equipped:true};cosmeticFeedback(doc,[effect],"ticket-closed");assert.match(doc.getElementById("toast").textContent,/Sunset Flash/);
const db={rpc:async(fn,args)=>{assert.equal(fn,"tp_bp_equip");assert.deepEqual(args,{p_season:1,p_level:5,p_equip:true});return {data:changed}}};assert.deepEqual(await equipReward(db,1,5,true),changed);assert.equal(Object.keys(equippedRewards(changed)).length,3);
const app=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");assert.ok(app.includes('state.view==="inventory"?inventoryMarkup(inventory,inventoryReady,profileInfo('));assert.ok(app.includes('equipReward(db,season,level,equip)'));
console.log("Inventory: equipment selection, profile decorations, frame reset, cosmetic feedback, escaping and RPC integration passed");

const banner={season_id:1,level:3,name:"Ocean Drive",slot:"banner",glyph:"☀",rarity:"rare",equipped:true};
applyEquipment(doc,[...rows,banner]);assert.equal(doc.querySelector(".tp-profile-calling-card").dataset.cardArt,"3");
const preview=new JSDOM(callingCardMarkup("Test <img>",{banner,title:rows[1],emblem:rows[0]})).window.document;
assert.equal(preview.querySelector(".tp-calling-text strong").textContent,"Test <img>");assert.equal(preview.querySelector(".tp-calling-title").textContent,"[Night Shift]");assert.equal(preview.querySelectorAll("img").length,1);assert.equal(preview.querySelector("img").getAttribute("src"),"./icons/bp-reward-1.svg");
for(const level of [0,3,11,21,30])assert.match(readFileSync(new URL("../public/icons/calling-card-"+level+".svg",import.meta.url),"utf8"),/<svg/);
console.log("Calling card: actual username, title directly after name, artwork selection, no HTML injection and reset passed");

for(let i=1;i<=30;i++){const svg=readFileSync(new URL("../public/icons/bp-reward-"+i+".svg",import.meta.url),"utf8");assert.match(svg,/<svg/);assert.match(svg,/linearGradient/);assert.doesNotMatch(svg,/<script|https?:\/\/(?!www.w3.org\/2000\/svg)/);}
assert.equal(doc.querySelectorAll(".tp-bp-art").length,3);
const sw=readFileSync(new URL("../public/sw.js",import.meta.url),"utf8");for(let i=1;i<=30;i++)assert.ok(sw.includes("./icons/bp-reward-"+i+".svg"));
