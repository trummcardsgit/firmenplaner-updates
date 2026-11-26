import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {JSDOM} from "jsdom";
import {careerCard,careerPage,playerRank,requiredXp} from "../public/game-progression.js";

const read=name=>readFileSync(new URL("../public/"+name,import.meta.url),"utf8");
const html=read("index.html");
const app=read("app.js");
const css=read("game-progression.css");
const sw=read("sw.js");
const dom=new JSDOM(html,{url:"https://trummcardsgit.github.io/firmenplaner-updates/"});
const doc=dom.window.document;
assert.equal(doc.querySelectorAll('#nav [data-view="career"]').length,1);
assert.equal(doc.querySelectorAll('.bottom-nav [data-view="career"]').length,1);
assert.ok(doc.getElementById("tp-prestige-dialog"));
assert.ok(doc.getElementById("tp-prestige-confirm"));
assert.ok(doc.getElementById("tp-xp-reward"));
assert.match(sw,/game-progression\.js/);
assert.match(sw,/game-progression\.css/);
assert.match(sw,/v2\.0\.0-dev\.7/);
assert.match(app,/db\.from\("tp_game_profiles"\)/);
assert.match(app,/db\.from\("tp_game_xp_events"\)/);
assert.match(app,/db\.rpc\("tp_game_enter_prestige"\)/);
assert.match(app,/showTaskXp\(entryId,lastXpEventId\)/);
assert.match(app,/data-view="career"|careerPage\(state.gameProfile/);
assert.match(app,/showTaskXp\(id\|\|state\.gameEvents\[0\]\?\.entry_id,lastXpEventId\)/);
assert.ok(css.length>2000);

assert.equal(requiredXp(1),150);
assert.equal(requiredXp(2),162);
assert.equal(requiredXp(54),786);
assert.equal(requiredXp(1,"master"),250);
assert.equal(requiredXp(100,"master"),745);
const p=playerRank(null);
assert.equal(p.stage,"normal");
assert.equal(p.prestige,0);
assert.equal(p.level,1);
assert.equal(p.cap,55);
assert.equal(p.percent,0);
assert.equal(p.ready,false);
assert.equal(p.needed,150);

const advance={stage:"normal",prestige:0,level:2,xp_in_level:75,total_xp:225,tasks_rewarded:2};
const advanced=playerRank(advance);
assert.equal(advanced.percent,46);
assert.equal(advanced.needed,162);
const tiny=careerCard(advance);
assert.match(tiny,/Level 2/);
assert.match(tiny,/75 \/ 162 XP/);
assert.match(tiny,/data-open-career/);

const max=playerRank({stage:"normal",prestige:0,level:55,total_xp:17800});
assert.equal(max.ready,true);
assert.equal(max.percent,100);
assert.equal(max.next,"Prestige 1 starten");
const ten=playerRank({stage:"normal",prestige:10,level:55});
assert.equal(ten.ready,true);
assert.equal(ten.next,"Prestige-Meister freischalten");
const first=playerRank({stage:"normal",prestige:1,level:1});
assert.equal(first.title,"Prestige 1");
const master=playerRank({stage:"master",prestige:10,level:985,xp_in_level:350});
assert.equal(master.cap,1000);
assert.equal(playerRank({stage:"master",prestige:10,level:55}).level,55);
assert.match(careerPage({stage:"master",prestige:10,level:55}),/Level 55/);
assert.equal(master.title,"Prestige-Meister");
assert.equal(master.ready,false);
assert.equal(playerRank({stage:"master",prestige:10,level:1000}).percent,100);

const history=[
 {id:1,entry_id:"entry",entry_title:"Netzwerkdrucker eingerichtet",xp:150,
  rank_before:1,rank_after:2,prestige:0,stage:"normal",awarded_at:"2026-11-25T12:00:00Z"}
];
const page=careerPage(advance,history,x=>String(x).replaceAll("<","&lt;"),x=>x);
assert.match(page,/Netzwerkdrucker eingerichtet/);
assert.match(page,/\+150 XP/);
assert.match(page,/Levelaufstieg!/);
assert.equal((page.match(/class="tp-prestige-badge(?: unlocked)?"/g)||[]).length,10);
assert.match(careerPage({stage:"normal",prestige:0,level:55}),/tp-enter-prestige/);
assert.match(careerPage({stage:"normal",prestige:10,level:55}),/Prestige-Meister freischalten/);
assert.match(careerPage({stage:"master",prestige:10,level:1000}),/höchste Auszeichnung/);
assert.doesNotMatch(careerPage(null),/id="tp-enter-prestige"/);
const malicious=careerPage(null,[{entry_title:'<img src=x onerror=alert(1)>',xp:75,rank_after:1,rank_before:1,awarded_at:"2026-11-25"}],
 x=>String(x).replace(/</g,"&lt;").replace(/>/g,"&gt;"),x=>x);
assert.doesNotMatch(malicious,/<img[^>]*onerror=/);
const style=doc.createElement("style");style.textContent=css;doc.head.appendChild(style);
assert.ok(style.sheet.cssRules.length>=20,"Stylesheet should parse into CSS rules");
console.log("XP & Prestige smoke passed: L1-55, ten Prestige ranks, Master 1000, award history, safe rendering, app integration, mobile nav, PWA assets.");

for(const rank of [...Array.from({length:10},(_,i)=>i+1),"master"]){const path="icons/prestige-"+rank+".webp";assert.ok(page.includes(path));assert.ok(sw.includes(path));const bytes=readFileSync(new URL("../public/"+path,import.meta.url));assert.equal(bytes.subarray(0,4).toString(),"RIFF");assert.equal(bytes.subarray(8,12).toString(),"WEBP");}
assert.match(careerCard({prestige:7,level:1}),/prestige-7\.webp/);
assert.match(careerCard({stage:"master",prestige:10,level:55}),/prestige-master\.webp/);

assert.ok(doc.getElementById("page-menu-art"),"Header artwork present");
assert.ok(app.includes('const menuArt=$("page-menu-art")'),"Header changes with navigation");
assert.ok(css.includes(".app-shell>.main{flex:1 1 0%"),"Main occupies remaining available width");
assert.ok(css.includes(".tp-game-career{width:100%;margin-inline:auto}"),"Career centered");

for(const view of ["dashboard","tasks","notes","career","solutions","projects","documents","companies","settings"]){const path="icons/hd-"+view+".svg";assert.ok(sw.includes(path));assert.match(read(path),/<svg /);}
assert.match(doc.getElementById("page-menu-art").src,/hd-dashboard\.svg/);assert.ok(app.includes('"./icons/hd-"+state.view+".svg"'));
