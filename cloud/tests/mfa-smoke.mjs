import assert from "node:assert/strict";
import {createMfa,mfaStatus} from "../public/mfa.js";
import {readFileSync} from "node:fs";
let verified=false,challengeCalls=0,enrollCalls=0,removed=[];
const auth={mfa:{
 listFactors:async()=>({data:{totp:verified?[{id:"f1",status:"verified"}]:[],all:verified?[]:[{id:"unfinished",factor_type:"totp",status:"unverified"}]}}),
 unenroll:async({factorId})=>{removed.push(factorId);return{}},
 enroll:async()=>{enrollCalls++;return {data:{id:"f1",totp:{qr_code:"data:image/svg+xml,fixture",secret:"fixture-not-a-real-secret"}}}},
 challengeAndVerify:async({factorId,code})=>{challengeCalls++;assert.equal(factorId,"f1");if(code!=="123456")return{error:{}};verified=true;return{}}
}};
const mfa=createMfa(auth);
assert.equal((await mfa.factors()).verified.length,0);
await mfa.enroll();await mfa.enroll();assert.equal(enrollCalls,1);assert.deepEqual(removed,["unfinished"]);
await assert.rejects(mfa.verify("f1","123"));assert.equal(challengeCalls,0);
await assert.rejects(mfa.verify("f1","000000"));await mfa.verify("f1","123456");
assert.equal((await mfa.factors()).verified.length,1);await assert.rejects(mfa.enroll(),/bereits eingerichtet/);
assert.deepEqual(await mfaStatus({rpc:async n=>{assert.equal(n,"tp_mfa_status");return {data:{active:true,fresh:false}}}}),{active:true,fresh:false});
await assert.rejects(mfaStatus({rpc:async()=>({error:{}})}));
const app=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
assert.ok(app.includes('storageKey:"sb-"+projectRef+"-auth-token",persistSession:true,autoRefreshToken:true,detectSessionInUrl:false'));
assert.ok(app.includes("await checkMfaAccess()"));assert.ok(app.includes("await mfaStatus(activationClient)"));assert.ok(!app.includes("if(data.session?.user)showApp"));
assert.ok(app.includes('const pushEndpoint=cfg.supabaseUrl+"/functions/v1/tp-background-push"'));
for(const file of ["tp-background-push.ts","tp-background-push-mfa.ts"]){
 const push=readFileSync(new URL("../backend/"+file,import.meta.url),"utf8");
 assert.match(push,/if\(action==="dispatch"\)\{[\s\S]*?\}else\{[\s\S]*?auth\.getUser\(jwt\)[\s\S]*?scoped\.rpc\("tp_mfa_status"\)[\s\S]*?security\?\.active!==true\|\|security\?\.fresh!==true\)return response\(\{error:"Zwei-Faktor-Bestätigung erforderlich\."\},403\);[\s\S]*?admin\.from\("tp_members"\)/);
 assert.ok(push.indexOf('scoped.rpc("tp_mfa_status")')<push.indexOf('if(action==="setup")'));
 assert.ok(push.indexOf('scoped.rpc("tp_mfa_status")')<push.indexOf('if(action==="test")'));
}
console.log("MFA flow: enrollment, code validation, native challenge, server status, activation separation passed");
