// Build a separate staging ZIP directory. Never modify the production checkout.
import {cpSync,writeFileSync,mkdirSync,readFileSync} from "node:fs";
import {resolve} from "node:path";
const out=resolve("cloud/staging-preview");
const url=process.env.TP_STAGING_URL||"";
const key=process.env.TP_STAGING_PUBLISHABLE_KEY||"";
const blocked=["ilmwoapvcluoravpsrjv","hgdexyvtgfffcasfpjyu","cpycfxolqpidfjbhhsmr"];
if(url&&(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)||blocked.some(id=>url.includes(id))))throw Error("Staging URL must be separate from production");
if(key&&!key.startsWith("sb_publishable_"))throw Error("Only a publishable key may be supplied");
if(Boolean(url)!==Boolean(key))throw Error("Supply both staging URL and publishable key");
mkdirSync(out,{recursive:true});
cpSync("cloud/public",out,{recursive:true});
writeFileSync(out+"/config.js","window.TRUMMPLANER_CONFIG = "+JSON.stringify({supabaseUrl:url,supabasePublishableKey:key,staging:true})+";\n");
let html=readFileSync(out+"/index.html","utf8").replace("<title>TrummPlaner Cloud</title>","<title>TrummPlaner 2.0 – TEST</title>");
html=html.replace('<div id="setup-warning" class="warning hidden">Die Supabase-Verbindung wurde noch nicht eingerichtet. Siehe README.md.</div>','<div class="warning">TESTVERSION – keine produktiven Daten verwenden.</div><div id="setup-warning" class="warning hidden">Die Test-Datenbank wurde noch nicht eingerichtet.</div>');
writeFileSync(out+"/index.html",html);
const manifest=JSON.parse(readFileSync(out+"/manifest.webmanifest","utf8"));manifest.name="TrummPlaner 2.0 TEST";manifest.short_name="TP TEST";writeFileSync(out+"/manifest.webmanifest",JSON.stringify(manifest,null,2));
let worker=readFileSync(out+"/sw.js","utf8").replace('trummplaner-pwa-v','trummplaner-staging-v');writeFileSync(out+"/sw.js",worker);
console.log(url?"Staging build configured":"Staging build with login disabled until configured");
