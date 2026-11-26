import {createClient} from "npm:@supabase/supabase-js@2.95.3";
const origin="https://trummcardsgit.github.io";
const site=origin+"/__APP_PATH__/";
const cors={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type","Vary":"Origin"};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{...cors,"Cache-Control":"no-store"}});
Deno.serve(async(req)=>{
 try{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 if(req.headers.get("origin")&&req.headers.get("origin")!==origin)return json({error:"Origin not allowed"},403);
 const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
 if(!token)return json({error:"Bitte anmelden."},401);
 const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:who,error:authError}=await admin.auth.getUser(token);
 if(authError||!who.user)return json({error:"Anmeldung ungültig."},401);
 const caller=who.user.id;
 const [rights,member]=await Promise.all([admin.from("tp_app_admins").select("user_id").eq("user_id",caller).maybeSingle(),admin.from("tp_members").select("active").eq("user_id",caller).maybeSingle()]);
 if(rights.error||member.error||!rights.data||!member.data?.active)return json({error:"Nur aktive Administratoren."},403);
 const body=await req.json();
 const email=typeof body.email==="string"?body.email.trim().toLowerCase():"";
 const name=typeof body.name==="string"?body.name.trim():"";
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||name.length<1||name.length>120)return json({error:"Bitte Name und gültige E-Mail eingeben."},400);
 const since=new Date(Date.now()-3600000).toISOString();
 const limit=await admin.from("tp_invites").select("email",{count:"exact",head:true}).eq("invited_by",caller).gte("updated_at",since);
 if(limit.error)return json({error:"Einladungen nicht verfügbar."},503);
 if((limit.count||0)>=10)return json({error:"Maximal zehn Einladungen pro Stunde."},429);
 const pending=await admin.from("tp_activation_pending").select("*").eq("email",email).maybeSingle();
 if(pending.error)return json({error:"Einladung konnte nicht geprüft werden."},503);
 let mode:"invite"|"recovery"="invite";
 let uid:string|undefined;
 if(pending.data){
  uid=pending.data.user_id;
  const [u,m,a]=await Promise.all([admin.auth.admin.getUserById(uid!),admin.from("tp_members").select("user_id").eq("user_id",uid).maybeSingle(),admin.from("tp_app_admins").select("user_id").eq("user_id",uid).maybeSingle()]);
  if(u.error||m.error||a.error||m.data||a.data||u.data.user?.email?.toLowerCase()!==email)return json({error:"Bestehendes Konto nicht zurücksetzen. Benutzerverwaltung verwenden."},409);
  if(Date.now()-Date.parse(pending.data.issued_at)<60000)return json({error:"Bitte mindestens eine Minute bis zur erneuten Einladung warten."},429);
  mode="recovery";
 }else{
  // Refuse any previously created account, even one without membership.
  for(let page=1;;page++){
   const users=await admin.auth.admin.listUsers({page,perPage:200});
   if(users.error)return json({error:"Benutzerprüfung fehlgeschlagen."},503);
   if(users.data.users.some(u=>u.email?.toLowerCase()===email))return json({error:"Für diese E-Mail existiert bereits ein Konto. Bitte Benutzerverwaltung verwenden."},409);
   if(users.data.users.length<200)break;
  }
  const now=new Date().toISOString();
  const add=await admin.from("tp_invites").insert({email,invited_by:caller,status:"pending",created_at:now,updated_at:now});
  if(add.error)return json({error:"Für diese Adresse existiert bereits eine Einladung. Bitte Administrator kontaktieren."},409);
 }
 const generated=await admin.auth.admin.generateLink({type:mode,email,options:{redirectTo:site}});
 if(generated.error||!generated.data?.user?.id||!generated.data?.properties?.hashed_token){
  if(mode==="invite")await admin.from("tp_invites").update({status:"failed",updated_at:new Date().toISOString()}).eq("email",email);
  return json({error:"Aktivierungscode konnte nicht erstellt werden. Bitte Administrator kontaktieren."},502);
 }
 const newId=generated.data.user.id;
 if(uid&&uid!==newId)return json({error:"Konto konnte nicht eindeutig zugeordnet werden."},409);
 // Use the high-entropy native one-time token hash, not a custom password or short code.
 const [existingMember,existingAdmin]=await Promise.all([admin.from("tp_members").select("user_id").eq("user_id",newId).maybeSingle(),admin.from("tp_app_admins").select("user_id").eq("user_id",newId).maybeSingle()]);
 if(existingMember.error||existingAdmin.error||existingMember.data||existingAdmin.data)return json({error:"Konto ist bereits vorhanden. Kein neuer Aktivierungscode."},409);
 const issued_at=new Date().toISOString();
 const record={user_id:newId,email,display_name:name,issued_at};
 const saved=mode==="invite"?await admin.from("tp_activation_pending").insert(record):await admin.from("tp_activation_pending").update({display_name:name,issued_at}).eq("user_id",newId).eq("email",email).select("user_id").single();
 if(saved.error)return json({error:"Aktivierung konnte nicht vorbereitet werden. Bitte Administrator kontaktieren."},503);
 const updated=await admin.from("tp_invites").update({status:"pending",updated_at:issued_at,invited_by:caller}).eq("email",email);
 if(updated.error)return json({error:"Einladung konnte nicht gespeichert werden."},503);
 return json({ok:true,email,code:(mode==="invite"?"I-":"R-")+generated.data.properties.hashed_token});
 }catch{return json({error:"Aktivierung derzeit nicht verfügbar."},503)}
});