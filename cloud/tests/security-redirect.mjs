import assert from "node:assert/strict";
import {legacyDestination,target} from "../backend/trummplaner-site/redirect-target.mjs";
import {readFileSync} from "node:fs";
const origin="https://ilmwoapvcluoravpsrjv.supabase.co/functions/v1/trummplaner-site";
const valid=["","/","/index.html","/icons/icon-192.png","/icons/","?next=https://example.invalid/","#https://example.invalid/"];
for(const v of valid){const result=new URL(legacyDestination(origin+v));assert.equal(result.origin,new URL(target).origin);assert.ok(result.pathname.startsWith(new URL(target).pathname));}
const invalid=["/https://example.invalid/path","///example.invalid/path","/https://trummcardsgit.github.io@example.invalid/path","/https://example.invalid:8443/","/http:example.invalid","/http:/example.invalid/path","/https:example.invalid","/https:%2F%2Fexample.invalid","/https:/example.invalid/path","/%2f%2fexample.invalid/","/https%3A%2F%2Fexample.invalid/","/https://trummcardsgit.github.io/other/","//other/","/https://[invalid","/https://trummcardsgit.github.io/firmenplaner-updates/","/%252fetc","/foo%5cbar","/%00","/foo/../../other","/foo/%252e%252e","/foo//bar","/%","/../outside"];
for(const v of invalid)assert.equal(legacyDestination(origin+v),null,v);
assert.equal(legacyDestination(origin+"extra"),null);
assert.equal(legacyDestination(origin+"/index.html"),target+"index.html");
assert.equal(legacyDestination(origin+"/icons/icon-192.png"),target+"icons/icon-192.png");
assert.equal(legacyDestination("https://example.invalid/trummplaner-site/index.html"),target+"index.html");
assert.match(readFileSync(new URL("../backend/trummplaner-site/index.ts",import.meta.url),"utf8"),/if \(!destination\) return new Response\([\s\S]*?status:400/);
console.log("Redirect regression: "+(valid.length+invalid.length)+" variants; invalid destinations rejected, valid resources preserved.");
