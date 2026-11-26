export const target="https://trummcardsgit.github.io/firmenplaner-updates/";
export function legacyDestination(requestUrl){
 const pathname=new URL(requestUrl).pathname,legacy="/trummplaner-site";
 const index=pathname.indexOf(legacy);
 let suffix=index>=0?pathname.substring(index+legacy.length):"";
 if(suffix.startsWith("/"))suffix=suffix.substring(1);
 const base=new URL(target);
 try{
  const destination=new URL(suffix,base);
  return destination.origin===base.origin&&destination.pathname.startsWith(base.pathname)&&!destination.username&&!destination.password?destination.href:target;
 }catch{return target;}
}
