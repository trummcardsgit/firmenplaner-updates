import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from "node:fs";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {tmpdir} from "node:os";
import {resolve,join} from "node:path";
import {pathToFileURL} from "node:url";
const lock=JSON.parse(readFileSync(new URL("./vendor-lock.json",import.meta.url),"utf8"));
const filename="supabase-2.95.3.js";
const src="./vendor/"+filename;
const digest=(algorithm,bytes)=>algorithm+"-"+createHash(algorithm).update(bytes).digest("base64");
function verifyDocuments(root){
 const extended=readFileSync(join(root,"extended.js"),"utf8"),html=readFileSync(join(root,"index.html"),"utf8"),sw=readFileSync(join(root,"sw.js"),"utf8");
 if(!html.includes("script-src 'self';")||html.includes("cdn.jsdelivr.net"))throw Error("Document CSP not local-only");
 for(const item of lock.documents){
  const src="./vendor/"+item.file;
  if(digest("sha384",readFileSync(join(root,src)))!==item.bundleIntegrity)throw Error("Document bundle integrity "+item.name);
  if(!extended.includes(JSON.stringify(src))||!extended.includes(JSON.stringify(item.bundleIntegrity))||!sw.includes(JSON.stringify(src)))throw Error("Document loader or precache mismatch "+item.name);
  if(!readFileSync(join(root,"vendor",item.name+"-"+item.version+".LICENSE.txt"),"utf8").trim())throw Error("Missing license");
  console.log("Local "+item.name+" "+item.version+" verified");
 }
}
async function prepareDocuments(root){
 if(lock.documents.map(x=>x.name+"@"+x.version).join(",")!=="docx@9.15.3,mammoth@1.13.0")throw Error("Unexpected document versions");
 const tmp=mkdtempSync(join(tmpdir(),"rhtflow-documents-"));
 try{
  for(const item of lock.documents){
   if(item.tarball!=="https://registry.npmjs.org/"+item.name+"/-/"+item.name+"-"+item.version+".tgz")throw Error("Unexpected document registry");
   const response=await fetch(item.tarball,{redirect:"error",signal:AbortSignal.timeout(60000)});
   if(!response.ok)throw Error("Document download "+response.status);
   const tar=Buffer.from(await response.arrayBuffer());if(digest("sha512",tar)!==item.integrity)throw Error("Document package integrity "+item.name);
   const archive=join(tmp,item.name+".tgz");writeFileSync(archive,tar);
   const extract=entry=>execFileSync("tar",["-xOzf",archive,entry],{maxBuffer:16*1024*1024});
   const meta=JSON.parse(extract("package/package.json"));
   if(meta.name!==item.name||meta.version!==item.version||meta.license!==item.license)throw Error("Document package metadata mismatch");
   const bytes=extract(item.entry);if(digest("sha384",bytes)!==item.bundleIntegrity)throw Error("Document bundle integrity "+item.name);
   writeFileSync(join(root,"vendor",item.file),bytes);
   writeFileSync(join(root,"vendor",item.name+"-"+item.version+".LICENSE.txt"),extract(item.licenseEntry));
  }
 }finally{rmSync(tmp,{recursive:true,force:true});}
}
export function verifyVendor(root){
 const bytes=readFileSync(join(root,src)),html=readFileSync(join(root,"index.html"),"utf8");
 const integrity=digest("sha384",bytes);
 if(integrity!==lock.bundleIntegrity)throw Error("Locked SDK bundle hash mismatch");
 if(!html.includes('<script src="'+src+'" integrity="'+integrity+'"></script>'))throw Error("SDK SRI mismatch");
 if(!readFileSync(join(root,"sw.js"),"utf8").includes(JSON.stringify(src)))throw Error("SDK not precached");
 if(readFileSync(join(root,"app.js"),"utf8").includes("esm.sh"))throw Error("External SDK import");
 verifyDocuments(root);
 console.log("Local Supabase "+lock.version+"; "+integrity);
}
export async function prepareVendor(root){
 if(lock.name!=="@supabase/supabase-js"||lock.version!=="2.95.3"||lock.tarball!=="https://registry.npmjs.org/@supabase/supabase-js/-/supabase-js-2.95.3.tgz"||!lock.integrity.startsWith("sha512-"))throw Error("SDK lock mismatch");
 const tmp=mkdtempSync(join(tmpdir(),"rhtflow-sdk-"));
 try{
  const response=await fetch(lock.tarball,{redirect:"error",signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw Error("SDK download failed: "+response.status);
  const tar=Buffer.from(await response.arrayBuffer());
  if(digest("sha512",tar)!==lock.integrity)throw Error("SDK package integrity mismatch");
  const archive=join(tmp,"sdk.tgz");writeFileSync(archive,tar);
  const metadata=JSON.parse(execFileSync("tar",["-xOzf",archive,"package/package.json"],{maxBuffer:1024*1024}));
  if(metadata.name!==lock.name||metadata.version!==lock.version)throw Error("SDK package version mismatch");
  const bytes=execFileSync("tar",["-xOzf",archive,lock.entry],{maxBuffer:8*1024*1024});
  if(!bytes.length||digest("sha384",bytes)!==lock.bundleIntegrity)throw Error("Locked SDK bundle integrity mismatch");
  mkdirSync(join(root,"vendor"),{recursive:true});
  writeFileSync(join(root,src),bytes);
  const htmlPath=join(root,"index.html"),html=readFileSync(htmlPath,"utf8");
  const tag=new RegExp('<script src="\\./vendor/'+filename.replaceAll(".","\\.")+'"(?: integrity="sha384-[A-Za-z0-9+/=]+")?></script>','g');
  if([...html.matchAll(tag)].length!==1)throw Error("SDK script tag missing or duplicated");
  writeFileSync(htmlPath,html.replace(tag,'<script src="'+src+'" integrity="'+digest("sha384",bytes)+'"></script>'));
  await prepareDocuments(root);
  verifyVendor(root);
 }finally{rmSync(tmp,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await prepareVendor(resolve(process.argv[2]||"cloud/public"));
