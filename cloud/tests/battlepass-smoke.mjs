import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
import {readFileSync} from "node:fs";
import {battlePassMarkup,replaceBattlePassTile,readBattlePass} from "../public/battlepass.js";
const sample={available:true,active:true,season_id:1,starts:"2026-11-27",ends:"2026-12-27",days_left:28,xp:1250,level:1,rewards:Array.from({length:30},(_,i)=>({level:i+1,name:i===0?"<script>":"Reward "+i,kind:"Trophäe",rarity:"rare",glyph:"★",unlocked:i===0})),challenges:[{period:"daily",label:"Kommentar",goal:1,progress:1,xp:200,earned:true},{period:"weekly",label:"Woche",goal:3,progress:1,xp:750,earned:false},{period:"season",label:"Season",goal:10,progress:2,xp:1500,earned:false}]};
const doc=new JSDOM(battlePassMarkup(sample)).window.document;
assert.equal(doc.querySelectorAll(".tp-bp-track .tp-bp-reward").length,30);
assert.equal(doc.querySelectorAll(".tp-bp-track .unlocked").length,1);
assert.equal(doc.querySelectorAll(".tp-bp-collection .unlocked").length,1);
assert.equal(doc.querySelectorAll("script").length,0);
assert.match(doc.body.textContent,/STUFE 1 \/ 30/);
assert.equal(doc.querySelector(".tp-bp-progress").value,250);
assert.equal(doc.querySelectorAll(".tp-bp-task.done").length,1);
doc.querySelector('[data-bp-section="missions"]').open=false;doc.querySelector('[data-bp-section="collection"]').open=true;replaceBattlePassTile(doc,sample,true);assert.equal(doc.querySelector('[data-bp-section="missions"]').open,false);assert.equal(doc.querySelector('[data-bp-section="collection"]').open,true);
assert.equal(new JSDOM(battlePassMarkup({...sample,level:30,xp:35000})).window.document.querySelector(".tp-bp-progress").value,1000);
assert.equal(await readBattlePass({rpc:async fn=>{assert.equal(fn,"tp_sync_battlepass");return {data:sample}}}),sample);
const app=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");assert.ok(app.includes("careerCard(state.gameProfile)+battlePassMarkup(battlePass,challengeReady,profileInfo("));assert.doesNotMatch(app.split("\n").find(s=>s.includes('state.view==="career"?careerPage(')).split('state.view==="career"?')[1],/battlePassMarkup/);
console.log("Battle Pass: thirty rewards, XP progress, unlocked collection, escaping, refresh state and dashboard-only placement passed");

const bannerSample={...sample,rewards:sample.rewards.map(r=>r.level===3?{...r,kind:"Visitenkarte",name:"Ocean Drive"}:r)};
const bannerDoc=new JSDOM(battlePassMarkup(bannerSample,true,"Test Person")).window.document;assert.equal(bannerDoc.querySelector(".tp-calling-text strong").textContent,"Test Person");assert.equal(bannerDoc.querySelector(".tp-calling-card").dataset.cardArt,"3");

assert.equal(doc.querySelectorAll(".tp-bp-track img.tp-bp-art").length,30);assert.equal(doc.querySelector(".tp-bp-track img").getAttribute("src"),"./icons/bp-reward-1.svg");

assert.equal(doc.getElementById("tp-battlepass").open,false);
assert.match(doc.querySelector(".tp-bp-compact").textContent,/Stufe 1 \/ 30/);
doc.getElementById("tp-battlepass").open=true;replaceBattlePassTile(doc,sample,true);assert.equal(doc.getElementById("tp-battlepass").open,true);
doc.getElementById("tp-battlepass").open=false;replaceBattlePassTile(doc,sample,true);assert.equal(doc.getElementById("tp-battlepass").open,false);
assert.equal(new JSDOM(battlePassMarkup(sample,true,"Test",true)).window.document.getElementById("tp-battlepass").open,true);
