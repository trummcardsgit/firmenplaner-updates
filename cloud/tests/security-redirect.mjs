import assert from "node:assert/strict";
import {legacyDestination,target} from "../backend/trummplaner-site/redirect-target.mjs";
const origin="https://ilmwoapvcluoravpsrjv.supabase.co/functions/v1/trummplaner-site";
const original=requestUrl=>{
 const pathname=new URL(requestUrl).pathname,legacy="/trummplaner-site",i=pathname.indexOf(legacy);
 let suffix=i>=0?pathname.substring(i+legacy.length):"";
 if(suffix.startsWith("/"))suffix=suffix.substring(1);
 return new URL(suffix,target).href;
};
const variants=["","/","/index.html","/icons/icon-192.png","/https://example.invalid/path","///example.invalid/path","/https://trummcardsgit.github.io@example.invalid/path","/https://example.invalid:8443/","/http:example.invalid","/http:/example.invalid/path","/https:example.invalid","/https:%2F%2Fexample.invalid","/https:/example.invalid/path","/%2f%2fexample.invalid/","/https%3A%2F%2Fexample.invalid/","/https://trummcardsgit.github.io/other/","//other/","/https://[invalid","/https://trummcardsgit.github.io/firmenplaner-updates/","?next=https://example.invalid/","#https://example.invalid/"];
for(const v of variants){
 const result=new URL(legacyDestination(origin+v));
 assert.equal(result.origin,new URL(target).origin);
 assert.ok(result.pathname.startsWith(new URL(target).pathname));
 assert.equal(result.username,"");assert.equal(result.password,"");
}
for(const v of ["/https://example.invalid/path","///example.invalid/path","/https://trummcardsgit.github.io@example.invalid/path","/http:example.invalid","/http:/example.invalid/path"]){
 assert.equal(new URL(original(origin+v)).hostname,"example.invalid");
 assert.equal(legacyDestination(origin+v),target);
}
assert.equal(legacyDestination(origin+"/index.html"),target+"index.html");
assert.equal(legacyDestination(origin+"/icons/icon-192.png"),target+"icons/icon-192.png");
assert.equal(legacyDestination(origin+"/https://trummcardsgit.github.io/other/"),target);
console.log("Redirect regression: "+variants.length+" variants; external destinations reproduced in original URL logic; patched origin and path constrained.");
