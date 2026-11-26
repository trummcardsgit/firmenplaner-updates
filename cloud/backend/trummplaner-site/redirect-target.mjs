export const target="https://trummcardsgit.github.io/firmenplaner-updates/";
export function legacyDestination(requestUrl){
 try{
  const pathname=new URL(requestUrl).pathname;
  const match=pathname.match(/^\/(?:functions\/v1\/)?trummplaner-site(?:\/(.*))?$/);
  if(!match)return null;
  const suffix=match[1]||"";
  // Accept relative, ordinary resource paths only; reject URL schemes, empty
  // segments and encoded path separators or traversal, including nested escapes.
  if(suffix&&suffix.split("/").some((segment,i,parts)=>{
   if(!segment)return i!==parts.length-1;
   let decoded=decodeURIComponent(segment);
   return !/^[A-Za-z0-9._~-]+$/.test(decoded)||decoded==="."||decoded==="..";
  }))return null;
  const base=new URL(target),destination=new URL(suffix,base);
  return destination.origin===base.origin&&destination.pathname.startsWith(base.pathname)&&!destination.username&&!destination.password?destination.href:null;
 }catch{return null;}
}
