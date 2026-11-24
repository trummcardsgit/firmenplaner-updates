import {createClient} from "npm:@supabase/supabase-js@2.95.3";

const ORIGIN="https://trummcardsgit.github.io";
const REDIRECT=ORIGIN+"/firmenplaner-updates/";
const GRAPH="https://graph.microsoft.com/v1.0";
const OAUTH_SCOPE="offline_access Mail.Read User.Read";
const cors={
 "Access-Control-Allow-Origin":ORIGIN,
 "Access-Control-Allow-Methods":"POST,OPTIONS",
 "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-tp-cron,x-client-info",
 "Vary":"Origin","Cache-Control":"no-store",
};
const result=(data:unknown,status=200)=>Response.json(data,{status,headers:cors});
function eq(a:string,b:string){
 if(!a||a.length!==b.length)return false;
 let v=0;for(let i=0;i<a.length;i++)v|=a.charCodeAt(i)^b.charCodeAt(i);
 return v===0;
}
function safeGraphUrl(value:string):string{
 const u=new URL(value,GRAPH+"/");
 if(u.origin!=="https://graph.microsoft.com"||!u.pathname.startsWith("/v1.0/me/"))
  throw new Error("Ungültiger Outlook-API-Link");
 return u.href;
}
async function graphGet(access:string,path:string){
 const response=await fetch(safeGraphUrl(path),{
  headers:{
   Authorization:"Bearer "+access,
   Accept:"application/json",
   Prefer:'IdType="ImmutableId", outlook.body-content-type="text"',
  },
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok){
  if(response.status===401)throw new Error("Outlook-Zugriff abgelaufen. Bitte Postfach erneut verbinden.");
  if(response.status===429||response.status>=500)throw new Error("Microsoft Graph ist vorübergehend nicht erreichbar.");
  const code=String(data.error?.code||"").slice(0,100);
  throw new Error("Outlook-API ("+response.status+" "+code+"). Bitte Postfachzugriff überprüfen.");
 }
 return data;
}
async function tokenRequest(conn:any,details:Record<string,string>){
 const fields=new URLSearchParams({
  client_id:conn.client_id,client_secret:conn.client_secret,
  scope:OAUTH_SCOPE,...details
 });
 const res=await fetch("https://login.microsoftonline.com/"+conn.tenant_id+"/oauth2/v2.0/token",{
  method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
  body:fields,
 });
 const data=await res.json().catch(()=>({}));
 if(!res.ok||!data.access_token){
  if(data.error==="invalid_grant"||data.error==="interaction_required")
   throw new Error("Microsoft-Zugriff abgelaufen oder widerrufen. Bitte Outlook erneut anmelden.");
  throw new Error("Microsoft-Anmeldung fehlgeschlagen ("+String(data.error||res.status).slice(0,100)+").");
 }
 return data;
}
const messageDescription=(msg:any,folder:string):string=>{
 const body=typeof msg.body?.content==="string"?msg.body.content:String(msg.bodyPreview||"");
 const clean=String(body).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,"")
  .replace(/<br\s*\/?>/gi,"\n").replace(/<\/p>/gi,"\n")
  .replace(/<[^>]+>/g,"").replace(/\r\n/g,"\n").trim();
 const email=String(msg.from?.emailAddress?.address||"");
 const who=String(msg.from?.emailAddress?.name||email);
 const date=msg.receivedDateTime?new Date(msg.receivedDateTime).toLocaleString("de-AT",{timeZone:"Europe/Vienna"}):"";
 const link=typeof msg.webLink==="string"&&msg.webLink.startsWith("https://outlook.")?msg.webLink:"";
 return [
  "Aus Outlook-Ordner: "+folder,
  "Von: "+who+(email&&email!==who?" <"+email+">":""),
  "Eingang: "+date,
  link?"Originalnachricht: "+link:"",
  msg.hasAttachments?"Hinweis: Anhänge bitte in der Originalnachricht öffnen.":"",
  "",
  "E-Mail:",
  clean
 ].filter((v,i)=>v!==""||i>0).join("\n").slice(0,20000);
};
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return result({error:"POST erforderlich"},405);
 if(req.headers.get("origin")&&req.headers.get("origin")!==ORIGIN)return result({error:"Ungültige Herkunft"},403);
 const url=Deno.env.get("SUPABASE_URL");
 const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key)return result({error:"Supabase-Konfiguration fehlt"},503);
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 let body:any={};
 try{body=await req.json();}catch{return result({error:"Ungültige Anfrage"},400);}
 const action=String(body.action||"");
 try{
  let ownerId:string|null=null;
  if(action==="dispatch"){
   const {data:secret}=await admin.from("tp_push_config").select("cron_token").eq("only_row",true).single();
   if(!secret||!eq(req.headers.get("x-tp-cron")||"",secret.cron_token))
    return result({error:"Unberechtigter Zeitplan-Aufruf"},401);
  }else{
   const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
   const {data:user,error}=await admin.auth.getUser(jwt);
   if(error||!user.user)return result({error:"Bitte neu anmelden"},401);
   ownerId=user.user.id;
   const {data:allow,error:adminErr}=await admin.from("tp_app_admins").select("user_id").eq("user_id",ownerId).maybeSingle();
   if(adminErr||!allow)return result({error:"Nur Administratoren dürfen Outlook verbinden."},403);
  }
  const load=async()=>{
   const {data,error}=await admin.from("tp_outlook_connections").select("*").eq("owner_id",ownerId).maybeSingle();
   if(error)throw error;
   return data;
  };
  const summary=async()=>{
   const conn=await load();
   if(!conn)return {configured:false,connected:false,active:false};
   const {count}=await admin.from("tp_outlook_imports").select("id",{head:true,count:"exact"}).eq("connection_id",conn.id);
   return {
    configured:true,connected:!!conn.refresh_token,active:conn.status==="active",
    status:conn.status, email:conn.email_address||"",
    folder:conn.folder_name||"",folderId:conn.folder_id||"",
    companyId:conn.company_id||"", lastSyncedAt:conn.last_synced_at,
    phase:conn.sync_phase,lastError:conn.last_error||"",imported:count||0,
   };
  };
  if(action==="status")return result(await summary());
  if(action==="configure"){
   const tenant=String(body.tenantId||"").trim();
   const client=String(body.clientId||"").trim();
   const secret=String(body.clientSecret||"").trim();
   const guid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
   if(!guid.test(tenant)||!guid.test(client)||secret.length<12||secret.length>600)
    return result({error:"Mandanten-ID, Anwendungs-ID und Client Secret bitte vollständig angeben."},400);
   const {error}=await admin.from("tp_outlook_connections").upsert({
    owner_id:ownerId,tenant_id:tenant,client_id:client,client_secret:secret,
    refresh_token:null,graph_user_id:null,email_address:null,folder_id:null,
    folder_name:null,company_id:null,selected_at:null,sync_cursor:null,
    sync_phase:"baseline",status:"configured",last_error:null,lock_until:null,
    updated_at:new Date().toISOString()
   },{onConflict:"owner_id"});
   if(error)throw error;
   return result({ok:true,...await summary()});
  }
  if(action==="authorize"){
   const conn=await load();
   if(!conn)return result({error:"Zuerst Microsoft-Appdaten einrichten."},409);
   const state=String(body.state||"");
   const challenge=String(body.challenge||"");
   if(!/^[A-Za-z0-9_-]{28,160}$/.test(state)||!/^[A-Za-z0-9_-]{43}$/.test(challenge))
    return result({error:"Ungültige OAuth-Anfrage"},400);
   const query=new URLSearchParams({
    client_id:conn.client_id,response_type:"code",redirect_uri:REDIRECT,
    response_mode:"query",scope:OAUTH_SCOPE,state,
    code_challenge:challenge,code_challenge_method:"S256",
    prompt:"select_account"
   });
   return result({url:"https://login.microsoftonline.com/"+conn.tenant_id+"/oauth2/v2.0/authorize?"+query});
  }
  if(action==="exchange"){
   const conn=await load();
   if(!conn)return result({error:"Outlook-Konfiguration fehlt"},409);
   const code=String(body.code||"");
   const verifier=String(body.verifier||"");
   if(code.length<20||code.length>6000||!/^[A-Za-z0-9_-]{43,128}$/.test(verifier))
    return result({error:"Ungültige Microsoft-Anmeldung"},400);
   const token=await tokenRequest(conn,{
    grant_type:"authorization_code",code,code_verifier:verifier,redirect_uri:REDIRECT
   });
   if(!token.refresh_token)return result({error:"Microsoft hat keinen Offline-Zugriff erteilt. Bitte Berechtigung offline_access prüfen."},409);
   const me=await graphGet(token.access_token,GRAPH+"/me?$select=id,mail,userPrincipalName,displayName");
   const {error}=await admin.from("tp_outlook_connections").update({
    refresh_token:token.refresh_token,graph_user_id:me.id,
    email_address:me.mail||me.userPrincipalName||"",
    folder_id:null,folder_name:null,company_id:null,selected_at:null,
    sync_cursor:null,sync_phase:"baseline",status:"connected",
    last_error:null,lock_until:null,updated_at:new Date().toISOString()
   }).eq("id",conn.id);
   if(error)throw error;
   return result({ok:true,...await summary()});
  }
  async function accessToken(conn:any){
   if(!conn.refresh_token)throw new Error("Bitte Outlook zuerst verbinden.");
   const token=await tokenRequest(conn,{grant_type:"refresh_token",refresh_token:conn.refresh_token});
   if(token.refresh_token&&token.refresh_token!==conn.refresh_token){
    const {error}=await admin.from("tp_outlook_connections").update({refresh_token:token.refresh_token}).eq("id",conn.id);
    if(error)throw error;
    conn.refresh_token=token.refresh_token;
   }
   return token.access_token as string;
  }
  if(action==="folders"){
   const conn=await load();
   if(!conn)return result({error:"Outlook nicht konfiguriert"},409);
   const token=await accessToken(conn);
   const found:any[]=[];
   const queue=[{path:GRAPH+"/me/mailFolders?$top=80&$select=id,displayName,childFolderCount",prefix:"",depth:0}];
   let requests=0;
   while(queue.length&&requests<25&&found.length<150){
    const next=queue.shift()!;
    const data=await graphGet(token,next.path);
    requests++;
    for(const folder of data.value||[]){
     const path=next.prefix?next.prefix+" / "+folder.displayName:folder.displayName;
     found.push({id:folder.id,name:folder.displayName,path});
     if(folder.childFolderCount>0&&next.depth<5)
      queue.push({path:GRAPH+"/me/mailFolders/"+encodeURIComponent(folder.id)+"/childFolders?$top=80&$select=id,displayName,childFolderCount",prefix:path,depth:next.depth+1});
    }
    if(data["@odata.nextLink"])queue.push({path:data["@odata.nextLink"],prefix:next.prefix,depth:next.depth});
   }
   return result({folders:found,truncated:queue.length>0});
  }
  if(action==="selectFolder"){
   const conn=await load();
   if(!conn?.refresh_token)return result({error:"Outlook zuerst verbinden"},409);
   const folderId=String(body.folderId||"").trim();
   const companyId=String(body.companyId||"").trim();
   if(!folderId||folderId.length>1024||!/^[0-9a-f-]{36}$/i.test(companyId))
    return result({error:"Bitte Ordner und Zielfirma auswählen."},400);
   const {data:company}=await admin.from("tp_companies").select("id").eq("id",companyId).eq("owner_id",ownerId).maybeSingle();
   if(!company)return result({error:"Zielfirma nicht gefunden"},404);
   const token=await accessToken(conn);
   const folder=await graphGet(token,GRAPH+"/me/mailFolders/"+encodeURIComponent(folderId)+"?$select=id,displayName");
   const {error}=await admin.from("tp_outlook_connections").update({
    folder_id:folder.id,folder_name:folder.displayName,company_id:companyId,
    selected_at:new Date().toISOString(),sync_cursor:null,sync_phase:"baseline",
    status:"active",last_error:null,lock_until:null,updated_at:new Date().toISOString()
   }).eq("id",conn.id);
   if(error)throw error;
   return result({ok:true,...await summary()});
  }
  if(action==="pause"||action==="resume"||action==="disconnect"){
   const conn=await load();
   if(!conn)return result({error:"Keine Outlook-Verbindung vorhanden"},404);
   if(action==="resume"&&(!conn.refresh_token||!conn.folder_id||!conn.company_id))
    return result({error:"Postfach und Ordner müssen eingerichtet sein."},409);
   const change=action==="disconnect"?
    {status:"configured",refresh_token:null,folder_id:null,folder_name:null,company_id:null,
     selected_at:null,sync_cursor:null,sync_phase:"baseline",lock_until:null,last_error:null}:
    {status:action==="pause"?"paused":"active",lock_until:null,last_error:null};
   const {error}=await admin.from("tp_outlook_connections").update({...change,updated_at:new Date().toISOString()}).eq("id",conn.id);
   if(error)throw error;
   return result({ok:true,...await summary()});
  }
  if(action==="dispatch"||action==="syncNow"){
   // One worker leases each integration: cron and manual sync cannot create duplicates.
   const {data:claims,error:claimError}=await admin.rpc("tp_claim_outlook_sync",{
    p_owner:action==="dispatch"?null:ownerId,p_limit:action==="dispatch"?5:1
   });
   if(claimError)throw claimError;
   let imported=0,checked=0,errors=0;
   for(const claim of claims||[]){
    const {data:conn}=await admin.from("tp_outlook_connections").select("*").eq("id",claim.connection_id).single();
    if(!conn)continue;
    try{
     const token=await accessToken(conn);
     const base=GRAPH+"/me/mailFolders/"+encodeURIComponent(conn.folder_id)+"/messages/delta";
     const query=new URLSearchParams({
      "$select":"id,subject,from,receivedDateTime,lastModifiedDateTime,webLink,hasAttachments",
      "$top":"40",changeType:"created"
     });
     let url=conn.sync_cursor||base+"?"+query.toString();
     let phase=conn.sync_phase;
     const selected=Date.parse(conn.selected_at||"")||Date.now();
     for(let page=0;page<4;page++){
      const delta=await graphGet(token,url);
      checked+=(delta.value||[]).length;
      for(const item of delta.value||[]){
       if(item["@removed"]||!item.id)continue;
       // Initial sync indexes existing messages without creating historical tasks.
       // Messages arriving during initial indexing are imported by lastModifiedDateTime.
       const changed=Date.parse(item.lastModifiedDateTime||item.receivedDateTime||"")||0;
       if(phase==="baseline"&&changed<selected)continue;
       const full=await graphGet(token,GRAPH+"/me/messages/"+encodeURIComponent(item.id)+
        "?$select=id,subject,body,bodyPreview,from,receivedDateTime,webLink,hasAttachments");
       const desc=messageDescription(full,conn.folder_name||"Outlook");
       const {data:newTask,error:insertError}=await admin.rpc("tp_outlook_import_message",{
        p_connection_id:conn.id,p_message_id:item.id,
        p_title:full.subject||"E-Mail ohne Betreff",p_description:desc
       });
       if(insertError)throw insertError;
       if(newTask)imported++;
      }
      const next=delta["@odata.nextLink"]||delta["@odata.deltaLink"];
      if(!next)throw new Error("Microsoft hat keinen Synchronisationsstatus zurückgegeben.");
      url=safeGraphUrl(next);
      if(delta["@odata.deltaLink"])phase="live";
      const {error:updateError}=await admin.from("tp_outlook_connections").update({
       sync_cursor:url,sync_phase:phase,last_synced_at:new Date().toISOString(),
       last_error:null,updated_at:new Date().toISOString()
      }).eq("id",conn.id);
      if(updateError)throw updateError;
      if(phase==="live"&&delta["@odata.deltaLink"])break;
     }
    }catch(err){
     errors++;
     const reason=String(err instanceof Error?err.message:err).slice(0,500);
     const reconnect=/abgelaufen|widerrufen/i.test(reason);
     await admin.from("tp_outlook_connections").update({
      status:reconnect?"error":conn.status,last_error:reason,updated_at:new Date().toISOString()
     }).eq("id",conn.id);
     console.error("Outlook sync error",reason);
    }finally{
     await admin.from("tp_outlook_connections").update({lock_until:null}).eq("id",conn.id);
    }
   }
   return result({ok:errors===0,connections:claims?.length||0,checked,imported,errors});
  }
  return result({error:"Unbekannte Aktion"},400);
 }catch(err){
  console.error("Outlook service error",String(err instanceof Error?err.message:err).slice(0,250));
  return result({error:err instanceof Error?err.message:"Outlook-Dienstfehler"},503);
 }
});