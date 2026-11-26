import {readFileSync,existsSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
const dir=resolve(process.argv[2]||"cloud/public");
const hashes={"icons/apple-touch-icon.png":"bc4e66961eeb653287f3d5a69c986ad8de917acbea130a060f2f7d37d044dec7","icons/icon-192.png":"b98750e2d3a133f938822f49791612a7fc99a5374555255fc1a17a14a0e69aae","icons/icon-512.png":"8e47c15cacd3cab3b0e9129496424ff0fa2a1700ff8b8273c50da2aa870cd9b6","icons/icon-maskable-512.png":"0c99b3b3a0d1ba7bd2e493d1b0f62e2d679d60898dbc75ece31dd608956bfaa2","icons/logo-full.webp":"3774255a669c87f2b7fd6ea361de7672eed950b983e96edd18dbd81b3f58509d"};
const issues=[];
for(const [path,hash] of Object.entries(hashes)){const f=resolve(dir,path);if(!existsSync(f)){issues.push("Missing "+path);continue;}if(createHash("sha256").update(readFileSync(f)).digest("hex")!==hash)issues.push("Unexpected artwork "+path);}
const manifest=JSON.parse(readFileSync(resolve(dir,"manifest.webmanifest"),"utf8"));
if(!manifest.name.startsWith("RHTFLOW"))issues.push("Incorrect app name");
const source=readFileSync(resolve(dir,"sw.js"),"utf8");const paths=JSON.parse(source.match(/const ASSETS=(\[.*?\]);/s)[1]);for(const path of paths)if(!existsSync(resolve(dir,path)))issues.push("Missing service-worker asset "+path);
for(const icon of manifest.icons){const f=resolve(dir,icon.src);if(!existsSync(f))continue;const b=readFileSync(f);const [w,h]=icon.sizes.split("x").map(Number);if(b.length<24||b.readUInt32BE(16)!==w||b.readUInt32BE(20)!==h)issues.push("Incorrect PNG size "+icon.src);}
if(issues.length){console.error(issues.join("\n"));process.exit(1)}console.log("RHTFLOW branding and service-worker assets verified");
