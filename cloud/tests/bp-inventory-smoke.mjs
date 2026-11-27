import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
import {readFileSync} from "node:fs";
import {inventoryMarkup,inventoryRewardsMarkup,normalizeInventoryCategory,equippedRewards,applyEquipment,equipReward,callingCardMarkup} from "../public/bp-inventory.js";
const rows=[{season_id:1,level:1,name:"<script>",slot:"showcase",glyph:"★",rarity:"rare",equipped:true},{season_id:1,level:2,name:"Night Shift",slot:"title",glyph:"☾",rarity:"common",equipped:true},{season_id:1,level:5,name:"Neon Pink",slot:"frame",glyph:"◇",rarity:"rare",equipped:false},{season_id:1,level:3,name:"Ocean Drive",slot:"banner",glyph:"☀",rarity:"rare",equipped:true},{season_id:1,level:30,name:"Vice City Master",slot:"banner",glyph:"♛",rarity:"legendary",equipped:false}];
const doc=new JSDOM('<body><div class="tp-user-profile"><button data-profile-picture></button><div class="tp-profile-info"><strong data-profile-name>Test</strong></div></div>'+inventoryMarkup(rows,true,"Test","banner")+'</body>').window.document;
assert.equal(doc.querySelectorAll("[data-bp-equip]").length,2);
assert.deepEqual([...doc.querySelectorAll("#tp-inventory-category option")].map(o=>o.value),["banner","title","showcase","frame"]);
assert.equal(doc.querySelectorAll("script").length,0);assert.match(doc.querySelector(".tp-inventory-filter small").textContent,/2 von 5/);
applyEquipment(doc,rows);assert.equal(doc.querySelector("[data-profile-name]").nextElementSibling.textContent,"[Night Shift]");assert.equal(doc.querySelector(".tp-profile-calling-card").dataset.cardArt,"3");assert.equal(doc.querySelector(".tp-equipped-showcase img").getAttribute("src"),"./icons/bp-reward-1.svg");assert.equal(doc.querySelector(".tp-calling-emblem"),null);
const changed=rows.map(r=>r.level===5?{...r,equipped:true}:r);applyEquipment(doc,changed);assert.equal(doc.querySelector("[data-profile-picture]").dataset.memberFrame,"5");assert.equal(doc.querySelectorAll(".tp-profile-info .tp-calling-title").length,1);
applyEquipment(doc,[{...rows[2],level:27,equipped:true}]);assert.equal(doc.querySelector("[data-profile-picture]").dataset.memberFrame,"27");
applyEquipment(doc,[]);assert.equal(doc.querySelector("[data-profile-picture]").dataset.memberFrame,undefined);assert.equal(doc.querySelector(".tp-profile-info .tp-calling-title"),null);
const db={rpc:async(fn,args)=>{assert.equal(fn,"tp_bp_equip");assert.deepEqual(args,{p_season:1,p_level:5,p_equip:true});return {data:changed}}};assert.deepEqual(await equipReward(db,1,5,true),changed);assert.equal(Object.keys(equippedRewards(changed)).length,4);
assert.equal(normalizeInventoryCategory("effect",rows),"banner");assert.equal(normalizeInventoryCategory("auto",rows),"banner");
for(const [key,level] of [["frame",5],["title",2],["showcase",1]]){doc.getElementById("tp-inventory-rewards").outerHTML=inventoryRewardsMarkup(rows,"Test",key);assert.equal(doc.querySelectorAll("[data-bp-equip]").length,1);assert.equal(doc.querySelector("[data-bp-equip]").dataset.bpEquip,"1:"+level);}
assert.match(inventoryRewardsMarkup([],"Test","frame"),/erste Belohnung/);
assert.equal(Object.keys(equippedRewards([{...rows[0],slot:"emblem"}])).length,0);
const preview=new JSDOM(callingCardMarkup("Test <img>",{banner:rows[4],title:rows[1]})).window.document;assert.equal(preview.querySelector(".tp-calling-card").dataset.cardArt,"30");assert.equal(preview.querySelector(".tp-calling-text strong").textContent,"Test <img>");assert.equal(preview.querySelectorAll("img").length,0);
const sw=readFileSync(new URL("../public/sw.js",import.meta.url),"utf8");for(let i=1;i<=30;i++){assert.match(readFileSync(new URL("../public/icons/bp-reward-"+i+".svg",import.meta.url),"utf8"),/<svg/);assert.ok(sw.includes("./icons/bp-reward-"+i+".svg"));}
const app=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");assert.ok(app.includes('state.view==="inventory"?inventoryMarkup(inventory,inventoryReady,profileInfo('));assert.match(app,/inventoryCategory=normalizeInventoryCategory\(event.target.value,inventory\)/);
console.log("Inventory: four categories, reward filters, frames, title, trophy, calling card, equip RPC and asset cache passed");
