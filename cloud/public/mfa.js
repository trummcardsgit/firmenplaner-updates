// Native Supabase Auth MFA. No QR service or client-stored trusted-device bypass.
export async function mfaStatus(db){
 const {data,error}=await db.rpc("tp_mfa_status");
 if(error||typeof data?.active!=="boolean"||typeof data?.fresh!=="boolean")throw new Error("Sicherheitsprüfung nicht verfügbar. Bitte erneut versuchen.");
 return data;
}
export function createMfa(auth){
 let enrollment=null;
 return {
 async factors(){
  const {data,error}=await auth.mfa.listFactors();
  if(error)throw new Error("Authenticator konnte nicht geladen werden.");
  return {verified:(data?.totp||[]).filter(f=>f.status==="verified"),all:data?.all||[]};
 },
 async enroll(){
  if(enrollment)return enrollment;
  const {data:list,error:listError}=await auth.mfa.listFactors();
  if(listError)throw new Error("Authenticator konnte nicht geladen werden.");
  if((list?.totp||[]).some(f=>f.status==="verified"))throw new Error("Authenticator bereits eingerichtet. Bitte Code eingeben.");
  for(const f of list?.all||[]){
   if(f.factor_type==="totp"&&f.status==="unverified"){
    const {error}=await auth.mfa.unenroll({factorId:f.id});
    if(error)throw new Error("Unvollständige Einrichtung konnte nicht entfernt werden.");
   }
  }
  const {data,error}=await auth.mfa.enroll({factorType:"totp",friendlyName:"RHTFLOW",issuer:"RHTFLOW"});
  if(error||!data?.id||!data?.totp?.secret)throw new Error("Authenticator konnte nicht eingerichtet werden.");
  enrollment={id:data.id,secret:data.totp.secret,qr:data.totp.qr_code};
  return enrollment;
 },
 async verify(factorId,code){
  if(!factorId||!/^\d{6}$/.test(code))throw new Error("Bitte einen gültigen sechsstelligen Code eingeben.");
  const {error}=await auth.mfa.challengeAndVerify({factorId,code});
  if(error)throw new Error("Code ungültig oder abgelaufen. Bitte aktuellen Code aus der App versuchen.");
  enrollment=null;
 },
 clear(){enrollment=null;}
 };
}
