// Loads project choices directly from Supabase whenever a task is opened or its company changes.
// Avoids stale state.projects snapshots (for example after creating projects in another tab).
export function createTaskProjectSelector({
 db,companySelect,kindSelect,projectSelect,projectField,hint,ownerId,submitButton,onError
}){
 let activeRequest=0;
 const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
 }[c]));
 const placeholder='<option value="">Ohne Projekt</option>';
 async function refresh(selectedProject=""){
  const request=++activeRequest;
  const kind=kindSelect.value;
  const companyId=companySelect.value;
  const show=kind==="task";
  projectField.classList.toggle("hidden",!show);
  projectSelect.disabled=true;
  if(!show){
   projectSelect.innerHTML=placeholder;
   hint.textContent="";
   if(submitButton)submitButton.disabled=false;
   return [];
  }
  if(!companyId){
   projectSelect.innerHTML=placeholder;
   hint.textContent="Wähle zuerst eine Firma aus.";
   if(submitButton)submitButton.disabled=false;
   return [];
  }
  projectSelect.innerHTML='<option value="">Projekte werden geladen …</option>';
  hint.textContent="Lade die Projekte der ausgewählten Firma …";
  if(submitButton)submitButton.disabled=true;
  try{
   const builder=db.from("tp_projects")
    .select("id,name,company_id")
    .eq("owner_id",ownerId())
    .eq("company_id",companyId)
    .order("name",{ascending:true});
   const {data,error}=await builder;
   if(error)throw error;
   if(request!==activeRequest||companySelect.value!==companyId||kindSelect.value!=="task")return [];
   // Defensive check in addition to Supabase RLS and server-side company filtering.
   const items=(data||[]).filter(p=>p.company_id===companyId&&p.id&&p.name);
   projectSelect.innerHTML=placeholder+items.map(p=>
    '<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>'
   ).join("");
   if(!items.length){
    const label=document.createElement("option");
    label.disabled=true;
    label.textContent="Keine Projekte für diese Firma vorhanden";
    projectSelect.appendChild(label);
    hint.textContent="Für diese Firma ist noch kein Projekt angelegt.";
   }else{
    hint.textContent=items.length===1?"1 Projekt verfügbar":items.length+" Projekte verfügbar";
   }
   const chosen=items.some(p=>p.id===selectedProject)?selectedProject:"";
   projectSelect.value=chosen;
   projectSelect.disabled=false;
   return items;
  }catch(error){
   if(request!==activeRequest)return [];
   projectSelect.innerHTML=placeholder;
   projectSelect.disabled=true;
   hint.textContent="Projekte konnten nicht geladen werden. Bitte das Fenster erneut öffnen.";
   onError?.(error);
   return [];
  }finally{
   if(request===activeRequest&&submitButton)submitButton.disabled=false;
  }
 }
 return {refresh,invalidate(){activeRequest++},get pending(){return !!submitButton?.disabled;}};
}
