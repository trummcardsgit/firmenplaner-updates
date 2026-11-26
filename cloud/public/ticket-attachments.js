export const attachmentTypes={
 png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",pdf:"application/pdf",txt:"text/plain",csv:"text/csv",
 docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
 xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
 pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation"
};
export const attachmentAccept=Object.keys(attachmentTypes).map(x=>"."+x).join(",");
export const attachmentLimit=10*1024*1024;
export function validateAttachments(files){
 for(const file of files){
  const extension=file.name.split(".").pop().toLowerCase();
  if(!Object.hasOwn(attachmentTypes,extension))throw new Error("Dateityp nicht erlaubt: "+file.name);
  if(!file.size||file.size>attachmentLimit)throw new Error("Datei leer oder größer als 10 MB: "+file.name);
 }
 return files;
}
export async function uploadAttachments(bucket,ticketId,user,files,stillActive=()=>true){
 validateAttachments(files);
 const uploaded=[],failed=[];
 for(const file of files){
  if(!stillActive()){failed.push({file,error:"Sitzung geändert"});continue;}
  const extension=file.name.split(".").pop().toLowerCase();
  const name=file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g,"_");
  const safe=name.slice(0,110)+"."+extension;
  // Keep the original extension and avoid duplicating it for normal names.
  const filename=name.length<=120?name:safe;
  const path=String(ticketId)+"/"+user+"/"+crypto.randomUUID()+"-"+filename;
  try{
   const {error}=await bucket.upload(path,file,{upsert:false,contentType:attachmentTypes[extension]});
   if(error)throw error;
   uploaded.push(file);
  }catch(e){failed.push({file,error:e?.message||String(e)});}
 }
 return {uploaded,failed};
}
export function canAttach(ticket,user,admin,candidates){
 return !!user&&["open","accepted"].includes(ticket.status)&&(ticket.creator_id===user||ticket.assignee_id===user||admin||candidates.some(c=>String(c.ticket_id)===String(ticket.id)&&c.user_id===user&&c.response==="pending"));
}
