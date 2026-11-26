export function createRecovery(auth,ui,redirectTo){
 let email="",verified=false,busy=false;
 const message=(m)=>ui.message(m);
 const lock=async fn=>{if(busy)return;busy=true;ui.busy(true);try{await fn()}catch{message("Die Aktion konnte nicht ausgeführt werden. Bitte versuche es später erneut.")}finally{busy=false;ui.busy(false)}};
 return {
  open(value=""){email="";verified=false;ui.open(value);},
  async request(value){return lock(async()=>{email=value.trim();if(!email)return;const {error}=await auth.resetPasswordForEmail(email,{redirectTo});if(error){message(error.status===429?"Zu viele Anfragen. Bitte warte etwas.":"Code konnte nicht angefordert werden. Bitte versuche es später erneut.");return}verified=false;ui.code();message("Falls das Konto existiert, wurde ein Code gesendet.");})},
  async verify(token){return lock(async()=>{if(!email||!/^\d{6}$/.test(token)){message("Bitte den sechsstelligen Code eingeben.");return}const {data,error}=await auth.verifyOtp({email,token,type:"recovery"});if(error||!data?.session){message("Der Code ist ungültig oder abgelaufen. Fordere einen neuen an.");return}verified=true;ui.password();message("Code bestätigt. Lege dein neues Passwort fest.");})},
  async save(password,repeat){return lock(async()=>{if(!verified){message("Bitte zuerst den E-Mail-Code bestätigen.");return}if(password.length<12||password!==repeat){message("Mindestens 12 Zeichen verwenden. Beide Passwörter müssen übereinstimmen.");return}const {error}=await auth.updateUser({password});if(error){message("Passwort konnte nicht gespeichert werden. Bitte prüfe die Anforderungen oder fordere einen neuen Code an.");return}verified=false;email="";const result=await auth.signOut({scope:"global"});ui.done();message(result?.error?"Passwort gespeichert. Bitte erneut anmelden.":"Passwort gespeichert. Melde dich mit dem neuen Passwort an.");})},
  async cancel(){return lock(async()=>{if(verified)await auth.signOut({scope:"local"});verified=false;email="";ui.done();message("");})}
 }
}
