import { createClient } from "npm:@supabase/supabase-js@2.95.3";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

const allowedOrigin = "https://trummcardsgit.github.io";
const appUrl = "https://trummcardsgit.github.io/firmenplaner-updates/";
const headers = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info,x-tp-cron",
  "Vary": "Origin",
};
function response(data: unknown, status=200): Response {
  return Response.json(data, {status, headers: {...headers, "Cache-Control":"no-store"}});
}
function sameSecret(given: string, expected: string): boolean {
  if (given.length === 0 || given.length !== expected.length) return false;
  let difference=0;
  for(let n=0;n<given.length;n++) difference |= given.charCodeAt(n)^expected.charCodeAt(n);
  return difference===0;
}
function randomToken(): string {
  const b=crypto.getRandomValues(new Uint8Array(48));
  return btoa(String.fromCharCode(...b)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
}
async function sendToUser(server: webpush.ApplicationServer, admin: ReturnType<typeof createClient>, ownerId: string, payload: Record<string,unknown>) {
  const {data:subs,error}=await admin.from("tp_push_subscriptions").select("id,endpoint,p256dh,auth_secret").eq("owner_id",ownerId);
  if(error) throw error;
  let sent=0,failed=0,removed=0;
  for(const sub of subs||[]){
    try {
      const host=new URL(sub.endpoint).hostname;
      if(!(host==="fcm.googleapis.com"||host==="fcm-xm.googleapis.com"||host==="android.googleapis.com"||host.endsWith(".push.apple.com")||host==="updates.push.services.mozilla.com"||host.endsWith(".notify.windows.com")))throw new Error("Push service not allowed");
      await server.subscribe({endpoint:sub.endpoint, keys:{p256dh:sub.p256dh,auth:sub.auth_secret}}).pushTextMessage(JSON.stringify(payload),{ttl:3600});
      sent++;
    }catch(err){
      failed++;
      if(err instanceof webpush.PushMessageError && err.isGone()){
        const {error:delError}=await admin.from("tp_push_subscriptions").delete().eq("id",sub.id).eq("owner_id",ownerId);
        if(!delError)removed++;
      }
      console.error("Push provider rejected notification",String(err).slice(0,200));
    }
  }
  return {sent,failed,removed,subscribers:subs?.length||0};
}
Deno.serve(async req=>{
  try{
    if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
    const origin=req.headers.get("origin");
    if(origin&&origin!==allowedOrigin) return response({error:"Origin not allowed"},403);
    if(!["GET","POST"].includes(req.method))return response({error:"Method not allowed"},405);
    const url=Deno.env.get("SUPABASE_URL")||"";
    const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
    if(!url||!key)return response({error:"Server configuration missing"},503);
    const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:cfg,error:cfgError}=await admin.from("tp_push_config").select("*").eq("only_row",true).maybeSingle();
    if(cfgError)return response({error:"Push configuration unavailable"},503);
    if(req.method==="GET")return response({ready:!!cfg,publicKey:cfg?.vapid_public_key||null});
    let body: Record<string,unknown>={};
    try{body=await req.json() as Record<string,unknown>;}catch{return response({error:"Invalid JSON"},400);}
    const action=body.action;
    let userId:string|null=null;
    if(action==="dispatch"){
      if(!cfg||!sameSecret(req.headers.get("x-tp-cron")||"",cfg.cron_token))return response({error:"Unauthorized cron request"},401);
    }else{
      const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
      if(!jwt)return response({error:"Authentication required"},401);
      const res=await admin.auth.getUser(jwt);
      if(res.error||!res.data.user)return response({error:"Session invalid"},401);
      userId=res.data.user.id;
    }
    if(action==="setup"){
      const {data:isAdmin,error}=await admin.from("tp_app_admins").select("user_id").eq("user_id",userId).maybeSingle();
      if(error||!isAdmin)return response({error:"Nur Administratoren koennen den Push-Dienst aktivieren."},403);
      if(cfg)return response({ok:true,publicKey:cfg.vapid_public_key});
      const keys=await webpush.generateVapidKeys({extractable:true});
      const exported=await webpush.exportVapidKeys(keys);
      const publicKey=await webpush.exportApplicationServerKey(keys);
      const {error:insertErr}=await admin.from("tp_push_config").insert({only_row:true,vapid_public_key:publicKey,vapid_jwk:exported,cron_token:randomToken()});
      if(insertErr){
        const {data:prev}=await admin.from("tp_push_config").select("vapid_public_key").eq("only_row",true).maybeSingle();
        if(prev)return response({ok:true,publicKey:prev.vapid_public_key});
        return response({error:"Push setup failed"},503);
      }
      return response({ok:true,publicKey});
    }
    if(!cfg)return response({error:"Bitte den Push-Dienst zuerst als Administrator aktivieren."},409);
    const vapidKeys=await webpush.importVapidKeys(cfg.vapid_jwk);
    const pushServer=await webpush.ApplicationServer.new({contactInformation:appUrl,vapidKeys});
    if(action==="test"){
      const result=await sendToUser(pushServer,admin,userId!,{
        title:"TrummPlaner – Test-Push",body:"Die Hintergrund-Push-Benachrichtigung ist eingerichtet.",url:appUrl,tag:"tp-test-"+Date.now()
      });
      return response({ok:result.sent>0,...result},result.sent>0?200:422);
    }
    if(action==="dispatch"){
      const {data:tasks,error}=await admin.rpc("tp_claim_due_reminders",{p_limit:50});
      if(error){console.error("Claim reminders failed",error.message);return response({error:"Could not claim reminders"},503);}
      const stats={tasks:tasks?.length||0,delivered:0,failed:0};
      for(const task of tasks||[]){
        const sent=await sendToUser(pushServer,admin,task.owner_id,{
          title:"TrummPlaner: Erinnerung",body:task.title,tag:"tp-task-"+task.entry_id,
          url:appUrl+"?task="+encodeURIComponent(task.entry_id),
          dueAt:task.due_at
        });
        stats.delivered+=sent.sent;
        stats.failed+=sent.failed;
        if(sent.sent===0&&sent.failed>0){
          await admin.from("tp_entries").update({reminder_sent_at:null}).eq("id",task.entry_id).eq("status","open");
        }
      }
      return response({ok:true,...stats});
    }
    return response({error:"Unknown action"},400);
  }catch(err){
    console.error("Push handler failed",String(err).slice(0,280));
    return response({error:"Push server failed; check Edge Function logs"},503);
  }
});
