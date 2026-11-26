export function parseActivationCode(value){
 const match=String(value).trim().match(/^([IR])-([A-Za-z0-9_-]{32,256})$/);
 if(!match)throw new Error("Bitte den vollständigen Aktivierungscode kopieren.");
 return {type:match[1]==="I"?"invite":"recovery",token_hash:match[2]};
}
export function createActivation(auth,checkMembership){
 let verified=null,busy=false;
 return {
 async activate({email,code,password,repeat}){
  if(busy)return false;
  email=email.trim().toLowerCase();
  if(password.length<12||password!==repeat)throw new Error("Mindestens 12 Zeichen und übereinstimmende Passwörter erforderlich.");
  busy=true;
  try{
   if(!verified||verified.email!==email||verified.code!==code){
    if(verified){await auth.signOut({scope:"local"});verified=null;}
    const parsed=parseActivationCode(code);
    const {data,error}=await auth.verifyOtp(parsed);
    if(error||!data?.session||data.user?.email?.toLowerCase()!==email){await auth.signOut({scope:"local"});throw new Error("Code ungültig, abgelaufen oder E-Mail stimmt nicht. Bitte neuen Code anfordern.");}
    verified={email,code};
   }
   const {error}=await auth.updateUser({password});
   if(error)throw new Error("Passwort konnte nicht gespeichert werden. Bitte Passwortanforderungen prüfen und erneut versuchen.");
   const active=await checkMembership();
   verified=null;
   await auth.signOut({scope:"local"});
   if(!active)throw new Error("Passwort gespeichert, Konto aber noch nicht freigeschaltet. Bitte Administrator kontaktieren.");
   return true;
  }finally{busy=false;}
 },
 async cancel(){if(busy)return;verified=null;await auth.signOut({scope:"local"});}
 };
}
