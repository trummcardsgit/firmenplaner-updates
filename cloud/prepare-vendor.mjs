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
export function verifyVendor(root){
 const bytes=readFileSync(join(root,src)),html=readFileSync(join(root,"index.html"),"utf8");
 const integrity=digest("sha384",bytes);
 if(!html.includes('<script src="'+src+'" integrity="'+integrity+'"></script>'))throw Error("SDK SRI mismatch");
 if(!readFileSync(join(root,"sw.js"),"utf8").includes(JSON.stringify(src)))throw Error("SDK not precached");
 if(readFileSync(join(root,"app.js"),"utf8").includes("esm.sh"))throw Error("External SDK import");
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
  if(!bytes.length)throw Error("Empty SDK");
  mkdirSync(join(root,"vendor"),{recursive:true});
  writeFileSync(join(root,src),bytes);
  const htmlPath=join(root,"index.html"),html=readFileSync(htmlPath,"utf8");
  const tag=new RegExp('<script src="\\./vendor/'+filename.replaceAll(".","\\.")+'"(?: integrity="sha384-[A-Za-z0-9+/=]+")?></script>','g');
  if([...html.matchAll(tag)].length!==1)throw Error("SDK script tag missing or duplicated");
  writeFileSync(htmlPath,html.replace(tag,'<script src="'+src+'" integrity="'+digest("sha384",bytes)+'"></script>'));
  verifyVendor(root);
 }finally{rmSync(tmp,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await prepareVendor(resolve(process.argv[2]||"cloud/public"));
