import {createClient} from "npm:@supabase/supabase-js@2.95.3";
const site="https://trummcardsgit.github.io/__APP_PATH__/";
const allowedOrigin="https://trummcardsgit.github.io";
const cors={
 "Access-Control-Allow-Origin":allowedOrigin,
 "Access-Control-Allow-Methods":"POST, OPTIONS",
 "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type",
 "Vary":"Origin"
};
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json;charset=utf-8","cache-control":"no-store"}});}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const origin=req.headers.get("origin");
 if(origin&&origin!==allowedOrigin)return json({error:"Origin not allowed"},403);
 const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
 if(!token||token.split(".").length!==3)return json({error:"Bitte anmelden."},401);
 const url=Deno.env.get("SUPABASE_URL");
 const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key)return json({error:"Server-Konfiguration unvollständig"},503);
 const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
 const who=await admin.auth.getUser(token);
 if(who.error||!who.data.user)return json({error:"Anmeldung ungültig."},401);
 const caller=who.data.user.id;
 const scoped=createClient(url,Deno.env.get("SUPABASE_ANON_KEY")!,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:"Bearer "+token}}});
 const {data:security,error:securityError}=await scoped.rpc("tp_mfa_status");
 if(securityError||security?.active!==true||security?.fresh!==true)return json({error:"Zwei-Faktor-Bestätigung erforderlich."},403);
 const active=await admin.from("tp_members").select("active").eq("user_id",caller).maybeSingle();
 if(active.error||!active.data?.active)return json({error:"Konto nicht freigeschaltet."},403);
 const rights=await admin.from("tp_app_admins").select("user_id").eq("user_id",caller).maybeSingle();
 if(rights.error||!rights.data)return json({error:"Nur Administratoren dürfen Benutzer einladen."},403);
 let email;
 try{
  const body=await req.json();
  if(typeof body?.email!=="string")return json({error:"E-Mail-Adresse fehlt."},400);
  email=body.email.trim().toLowerCase();
 }catch{return json({error:"Ungültige Anfrage."},400);}
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return json({error:"Bitte gültige E-Mail-Adresse eingeben."},400);
 const since=new Date(Date.now()-60*60*1000).toISOString();
 const count=await admin.from("tp_invites").select("email",{count:"exact",head:true}).eq("invited_by",caller).gte("created_at",since);
 if(count.error)return json({error:"Einladungen derzeit nicht verfügbar."},503);
 if((count.count||0)>=10)return json({error:"Maximal zehn Einladungen pro Stunde."},429);
 const prev=await admin.from("tp_invites").select("email,created_at").eq("email",email).maybeSingle();
 if(prev.error)return json({error:"Prüfung fehlgeschlagen."},503);
 const now=new Date().toISOString();
 const values={email,invited_by:caller,status:"pending",updated_at:now};
 if(!prev.data)values.created_at=now;
 const add=await admin.from("tp_invites").upsert(values,{onConflict:"email"});
 if(add.error)return json({error:"Einladung konnte nicht vorbereitet werden."},503);
 const sent=await admin.auth.admin.inviteUserByEmail(email,{redirectTo:site});
 if(sent.error){
  // Mit dem kostenlosen Standard-SMTP sind E-Mails an externe Adressen eingeschraenkt.
  // Statt die Einladung zu verlieren, wird ein vertraulicher Link fuer den Admin erstellt.
  const generated=await admin.auth.admin.generateLink({
    type:"invite",email,
    options:{redirectTo:site}
  });
  const link=generated.data?.properties?.action_link;
  if(generated.error||!link){
    await admin.from("tp_invites").update({status:"failed",updated_at:new Date().toISOString()}).eq("email",email);
    return json({error:"E-Mail konnte nicht gesendet werden und auch die Link-Erstellung ist fehlgeschlagen: "+(generated.error?.message||sent.error.message)},502);
  }
  await admin.from("tp_invites").update({status:"pending",updated_at:new Date().toISOString()}).eq("email",email);
  return json({ok:true,delivery:"manual",email,link,message:"Einladungslink erzeugt. Bitte nur privat an die eingeladene Person senden."});
 }
 await admin.from("tp_invites").update({status:"sent",updated_at:new Date().toISOString()}).eq("email",email);
 return json({ok:true,message:"Einladung versendet.",email});
});