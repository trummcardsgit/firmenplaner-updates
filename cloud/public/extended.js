
const BUCKET="tp-private-files";
const DOCX_MIME="application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const SCRIPT_DOCX="https://cdn.jsdelivr.net/npm/docx@9.15.3/dist/index.iife.js";
const SCRIPT_MAMMOTH="https://cdn.jsdelivr.net/npm/mammoth@1.13.0/mammoth.browser.js";

export function createFeatures({db,state,esc,fmt,notice,fail,refresh,company}){
 const $=id=>document.getElementById(id);
 const viewState={taskCompany:"",projectCompany:"",project:null,doc:null};
 const id=()=>state.user?.id;
 const parent= (row,type,key)=>type==="entry"?row.entry_id===key:row.project_id===key;
 const validDocs=()=>state.documents||[];
 const validFiles=()=>state.attachments||[];
 const validProjects=()=>state.projects||[];

 async function load(){
  if(!id())return;
  const [pr,doc,file]=await Promise.all([
   db.from("tp_projects").select("*").order("updated_at",{ascending:false}),
   db.from("tp_documents").select("*").order("updated_at",{ascending:false}),
   db.from("tp_attachments").select("*").order("created_at",{ascending:false})
  ]);
  for(const r of [pr,doc,file])if(r.error)throw r.error;
  state.projects=pr.data||[];state.documents=doc.data||[];state.attachments=file.data||[];
 }
 function optionCompanies(selected,allLabel="Alle Firmen"){
  let html='<option value="">'+esc(allLabel)+'</option>';
  html+=state.companies.map(c=>'<option value="'+c.id+'"'+(c.id===selected?' selected':'')+'>'+esc(c.name)+'</option>').join("");
  return html;
 }
 function projectName(projectId){return validProjects().find(x=>x.id===projectId)?.name||"Projekt gelöscht";}
 function labelForDocument(doc){
  if(doc.entry_id)return "Aufgabe/Notiz: "+(state.entries.find(x=>x.id===doc.entry_id)?.title||"Gelöscht");
  if(doc.project_id)return "Projekt: "+projectName(doc.project_id);
  return "Ohne Zuordnung";
 }
 function selectParent(value){
  let h='<option value="">Ohne Zuordnung</option>';
  for(const p of validProjects())h+='<option value="project:'+p.id+'"'+(value==="project:"+p.id?' selected':'')+'>Projekt: '+esc(company(p.company_id)+" · "+p.name)+'</option>';
  for(const e of state.entries)h+='<option value="entry:'+e.id+'"'+(value==="entry:"+e.id?' selected':'')+'>Aufgabe/Notiz: '+esc(company(e.company_id)+" · "+e.title)+'</option>';
  return h;
 }
 const blocked=new Set(["SCRIPT","STYLE","IFRAME","OBJECT","EMBED","SVG","MATH","FORM","INPUT","META","LINK","IMG","VIDEO","AUDIO"]);
 const allowed=new Set(["P","DIV","BR","B","STRONG","I","EM","U","H1","H2","H3","UL","OL","LI","BLOCKQUOTE","SPAN"]);
 function cleanHtml(raw){
  const parsed=new DOMParser().parseFromString(String(raw||""),"text/html");
  const target=document.createElement("div");
  function append(node,to){
   if(node.nodeType===3){to.appendChild(document.createTextNode(node.nodeValue||""));return;}
   if(node.nodeType!==1)return;
   if(blocked.has(node.tagName))return;
   if(!allowed.has(node.tagName)){for(const x of [...node.childNodes])append(x,to);return;}
   const child=document.createElement(node.tagName.toLowerCase());
   for(const x of [...node.childNodes])append(x,child);
   to.appendChild(child);
  }
  for(const node of [...parsed.body.childNodes])append(node,target);
  return target.innerHTML;
 }
 function htmlText(raw){
  const d=document.createElement("div");d.innerHTML=cleanHtml(raw);
  return d.textContent?.trim()||"";
 }
 function attached(type,key){
  if(!key)return '<p class="muted">Zuerst speichern, dann können Dateien und Word-Dokumente angehängt werden.</p>';
  const docs=validDocs().filter(x=>parent(x,type,key));
  const files=validFiles().filter(x=>parent(x,type,key));
  let html='<div class="tp-toolbar"><button type="button" class="subtle" data-doc-new="'+type+':'+key+'">+ Word-Dokument</button><button type="button" class="subtle" data-doc-import="'+type+':'+key+'">DOCX bearbeiten</button><button type="button" class="subtle" data-file-upload="'+type+':'+key+'">+ Datei anhängen</button></div>';
  if(!docs.length&&!files.length)html+='<p class="muted">Noch keine Dateien angehängt.</p>';
  for(const d of docs)html+='<div class="tp-file"><span>📝 '+esc(d.title)+'.docx</span><div><button type="button" class="subtle" data-doc-open="'+d.id+'">Bearbeiten</button><button type="button" class="subtle" data-doc-download="'+d.id+'">DOCX</button></div></div>';
  for(const f of files)html+='<div class="tp-file"><span>📎 '+esc(f.file_name)+' · '+Math.ceil(f.file_size/1024)+' KB</span><div><button type="button" class="subtle" data-file-download="'+f.id+'">Herunterladen</button><button type="button" class="subtle danger" data-file-delete="'+f.id+'">Löschen</button></div></div>';
  return html;
 }
 function setEntryAttachments(entryId){
  if($("entry-attachments"))$("entry-attachments").innerHTML=attached("entry",entryId);
 }
 function projectsPage(){
  const list=validProjects().filter(p=>!viewState.projectCompany||p.company_id===viewState.projectCompany);
  let html='<div class="toolbar"><select id="tp-project-company">'+optionCompanies(viewState.projectCompany)+'</select><button type="button" class="primary" data-project-new>+ Neues Projekt</button></div>';
  html+='<p class="muted">Eigene Projektablage je Firma – für Dokumentation, Umstellungen und Dateien.</p>';
  if(!list.length)return html+'<div class="empty">Hier gibt es noch kein Projekt. Lege dein erstes Projekt an.</div>';
  for(const p of list){
   const count=validDocs().filter(d=>d.project_id===p.id).length+validFiles().filter(f=>f.project_id===p.id).length;
   html+='<div class="item"><div class="meta"><span class="pill gold">'+esc(company(p.company_id))+'</span><span class="pill">'+esc({active:"Aktiv",paused:"Pausiert",done:"Abgeschlossen"}[p.status]||p.status)+'</span></div>';
   html+='<h3>'+esc(p.name)+'</h3><p>'+esc(p.summary||htmlText(p.content_html).slice(0,200)||"Noch keine Projektnotizen")+'</p>';
   html+='<div class="actions"><button type="button" data-project-open="'+p.id+'">Projekt öffnen</button><span class="muted">'+count+' Dokumente/Dateien</span></div></div>';
  }
  return html;
 }
 function documentsPage(){
  let html='<div class="toolbar"><button type="button" class="primary" data-doc-new>+ Word-Dokument erstellen</button><button type="button" class="subtle" data-doc-import>DOCX importieren</button></div>';
  html+='<p class="muted">Word-Dokumente werden in deiner privaten Ablage gespeichert. Du kannst sie bearbeiten, zuordnen und als .docx herunterladen.</p>';
  const documents=validDocs();
  if(!documents.length)return html+'<div class="empty">Noch keine Word-Dokumente erstellt.</div>';
  for(const d of documents){
   html+='<div class="item"><h3>📝 '+esc(d.title)+'</h3><p class="muted">'+esc(labelForDocument(d))+' · '+esc(fmt(d.updated_at))+'</p>';
   html+='<div class="actions"><button type="button" data-doc-open="'+d.id+'">Bearbeiten</button><button type="button" data-doc-download="'+d.id+'">DOCX herunterladen</button><button class="danger" type="button" data-doc-delete="'+d.id+'">Löschen</button></div></div>';
  }
  return html;
 }
 function openProject(item){
  if(!state.companies.length){notice("Bitte zuerst eine Firma anlegen.");return;}
  const p=item||{};
  viewState.project=p.id||null;
  $("tp-project-id").value=p.id||"";
  $("tp-project-name").value=p.name||"";
  $("tp-project-company-choice").innerHTML=optionCompanies(p.company_id||viewState.projectCompany||state.companies[0].id,"Firma auswählen");
  if(!$("tp-project-company-choice").value)$("tp-project-company-choice").value=state.companies[0].id;
  $("tp-project-summary").value=p.summary||"";
  $("tp-project-status").value=p.status||"active";
  $("tp-project-body").innerHTML=cleanHtml(p.content_html||"");
  $("tp-project-attachments").innerHTML=attached("project",p.id);
  $("tp-project-dialog").showModal();
 }
 function openDoc(item,attachmentType="",attachmentId=""){
  const doc=item||{};
  viewState.doc=doc.id||null;
  $("tp-document-id").value=doc.id||"";
  $("tp-document-title").value=doc.title||"Neues Dokument";
  const link=doc.entry_id?"entry:"+doc.entry_id:doc.project_id?"project:"+doc.project_id:attachmentType&&attachmentId?attachmentType+":"+attachmentId:"";
  $("tp-document-link").innerHTML=selectParent(link);
  $("tp-document-body").innerHTML=cleanHtml(doc.content_html||"<p></p>");
  $("tp-document-dialog").showModal();
 }
 const libraries={};
 function loadScript(src,check){
  if(check())return Promise.resolve();
  if(libraries[src])return libraries[src];
  libraries[src]=new Promise((resolve,reject)=>{
   const script=document.createElement("script");
   script.src=src;script.async=true;
   script.onload=()=>check()?resolve():reject(new Error("Dokumentbibliothek nicht verfügbar"));
   script.onerror=()=>reject(new Error("Dokumentbibliothek konnte nicht geladen werden. Internetverbindung prüfen."));
   document.head.appendChild(script);
  });
  return libraries[src];
 }
 async function toWord(title,raw){
  await loadScript(SCRIPT_DOCX,()=>!!window.docx?.Packer);
  const {Document,Paragraph,TextRun,HeadingLevel,Packer}=window.docx;
  const container=document.createElement("div");
  container.innerHTML=cleanHtml(raw);
  const paragraphs=[];
  function runs(node,style={}){
   if(node.nodeType===3)return node.nodeValue?[new TextRun({text:node.nodeValue,bold:!!style.bold,italics:!!style.italics,underline:style.underline?{}:undefined})]:[];
   if(node.nodeType!==1)return [];
   if(node.tagName==="BR")return [new TextRun({break:1})];
   const copy={...style};
   if(["B","STRONG"].includes(node.tagName))copy.bold=true;
   if(["I","EM"].includes(node.tagName))copy.italics=true;
   if(node.tagName==="U")copy.underline=true;
   return [...node.childNodes].flatMap(child=>runs(child,copy));
  }
  function para(node,extra={}){
   const content=runs(node);
   paragraphs.push(new Paragraph({...extra,children:content.length?content:[new TextRun("")]}));
  }
  function addBlocks(node){
   if(node.nodeType===3){
    if(node.nodeValue.trim())paragraphs.push(new Paragraph({text:node.nodeValue}));
    return;
   }
   if(node.nodeType!==1)return;
   const tag=node.tagName;
   if(["H1","H2","H3"].includes(tag)){
    para(node,{heading:tag==="H1"?HeadingLevel.HEADING_1:tag==="H2"?HeadingLevel.HEADING_2:HeadingLevel.HEADING_3});
   }else if(tag==="P"||tag==="BLOCKQUOTE"||tag==="LI"){
    para(node,tag==="LI"?{bullet:{level:0}}:{});
   }else if(tag==="UL"||tag==="OL"||tag==="DIV"){
    for(const child of node.childNodes)addBlocks(child);
   }else para(node);
  }
  for(const node of container.childNodes)addBlocks(node);
  if(!paragraphs.length)paragraphs.push(new Paragraph({text:""}));
  const doc=new Document({creator:"TrummPlaner",title,sections:[{children:paragraphs}]});
  return await Packer.toBlob(doc);
 }
 function downloadBlob(blob,fileName){
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=fileName;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),15000);
 }
 async function saveDocument(){
  const title=$("tp-document-title").value.trim(),raw=cleanHtml($("tp-document-body").innerHTML);
  if(!title)throw new Error("Bitte einen Dokumentnamen eingeben.");
  if(!htmlText(raw))throw new Error("Bitte erst einen Dokumenttext eingeben.");
  if(raw.length>500000)throw new Error("Dokument ist zu groß.");
  const value=$("tp-document-link").value;
  const data={owner_id:id(),title,content_html:raw,updated_at:new Date().toISOString(),entry_id:null,project_id:null};
  if(value.startsWith("entry:"))data.entry_id=value.slice(6);
  if(value.startsWith("project:"))data.project_id=value.slice(8);
  const blob=await toWord(title,raw);
  if(blob.size>15728640)throw new Error("DOCX ist zu groß (maximal 15 MB).");
  let docId=$("tp-document-id").value,stored;
  if(docId){
   stored=await db.from("tp_documents").update(data).eq("id",docId).select("*").single();
  }else{
   stored=await db.from("tp_documents").insert(data).select("*").single();
  }
  if(stored.error)throw stored.error;
  docId=stored.data.id;
  const path=id()+"/docs/"+docId+".docx";
  const upload=await db.storage.from(BUCKET).upload(path,blob,{upsert:true,contentType:DOCX_MIME,cacheControl:"60"});
  if(upload.error)throw new Error("Dokumenttext gespeichert, aber DOCX-Datei konnte nicht hochgeladen werden: "+upload.error.message);
  const u=await db.from("tp_documents").update({storage_path:path}).eq("id",docId);
  if(u.error)throw u.error;
  $("tp-document-dialog").close();
  await refresh();
  if(data.entry_id)setEntryAttachments(data.entry_id);
  if(data.project_id&&$("tp-project-dialog").open)$("tp-project-attachments").innerHTML=attached("project",data.project_id);
  notice("Word-Dokument gespeichert und privat abgelegt.");
 }
 async function importWord(type="",key=""){
  const file=await pickFile(".docx");
  if(!file)return;
  if(!file.name.toLowerCase().endsWith(".docx"))throw new Error("Bitte eine DOCX-Datei auswählen.");
  if(file.size>15728640)throw new Error("Datei ist zu groß (max. 15 MB).");
  await loadScript(SCRIPT_MAMMOTH,()=>!!window.mammoth?.convertToHtml);
  const buffer=await file.arrayBuffer();
  const result=await window.mammoth.convertToHtml({arrayBuffer:buffer});
  openDoc(null,type,key);
  $("tp-document-title").value=file.name.replace(/\.docx$/i,"").slice(0,180);
  $("tp-document-body").innerHTML=cleanHtml(result.value);
  const lost=result.messages?.filter(m=>m.type==="warning").length||0;
  notice(lost?"DOCX importiert. "+lost+" Formatierungswarnung(en). Bitte Inhalt prüfen.":"DOCX importiert. Du kannst den Inhalt jetzt bearbeiten und speichern.");
 }
 function pickFile(accept=""){
  return new Promise(resolve=>{
   const input=document.createElement("input");
   input.type="file";input.accept=accept;input.style.display="none";
   input.onchange=()=>{const selected=input.files?.[0]||null;input.remove();resolve(selected);};
   document.body.appendChild(input);input.click();
   // Cancellation is resolved on focus in browsers that do not dispatch change.
   input.addEventListener("cancel",()=>{input.remove();resolve(null)},{once:true});
  });
 }
 async function uploadFile(type,key){
  const file=await pickFile();
  if(!file)return;
  if(file.size>15728640)throw new Error("Die Datei darf höchstens 15 MB groß sein.");
  const suffix=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-130)||"datei";
  const path=id()+"/files/"+crypto.randomUUID()+"-"+suffix;
  const result=await db.storage.from(BUCKET).upload(path,file,{contentType:file.type||"application/octet-stream",cacheControl:"60"});
  if(result.error)throw result.error;
  const metadata={owner_id:id(),entry_id:type==="entry"?key:null,project_id:type==="project"?key:null,file_name:file.name.slice(0,250),storage_path:path,mime_type:file.type||"application/octet-stream",file_size:file.size};
  const insert=await db.from("tp_attachments").insert(metadata);
  if(insert.error){await db.storage.from(BUCKET).remove([path]);throw insert.error;}
  await refresh();
  if(type==="entry")setEntryAttachments(key);
  if(type==="project")$("tp-project-attachments").innerHTML=attached(type,key);
  notice("Datei sicher angehängt.");
 }
 async function downloadFile(row){
  const data=await db.storage.from(BUCKET).download(row.storage_path);
  if(data.error)throw data.error;
  downloadBlob(data.data,row.file_name);
 }
 async function deleteFile(row){
  if(!confirm("Datei '"+row.file_name+"' unwiderruflich löschen?"))return;
  const result=await db.storage.from(BUCKET).remove([row.storage_path]);
  if(result.error)throw result.error;
  const d=await db.from("tp_attachments").delete().eq("id",row.id);
  if(d.error)throw d.error;
  await refresh();
  if($("editor").open)setEntryAttachments(row.entry_id);
  if($("tp-project-dialog").open)$("tp-project-attachments").innerHTML=attached("project",row.project_id);
  notice("Datei gelöscht.");
 }
 async function downloadDocument(row){
  // Download latest stored DOCX (generated on saving).
  if(!row.storage_path)throw new Error("Dokument hat noch keine DOCX-Datei. Bitte Dokument öffnen und speichern.");
  const blob=await db.storage.from(BUCKET).download(row.storage_path);
  if(blob.error)throw blob.error;
  downloadBlob(blob.data,row.title.replace(/[\\/:*?"<>|]/g,"_")+".docx");
 }
 async function deleteDocument(row){
  if(!confirm("Word-Dokument '"+row.title+"' unwiderruflich löschen?"))return;
  if(row.storage_path){const res=await db.storage.from(BUCKET).remove([row.storage_path]);if(res.error)throw res.error;}
  const result=await db.from("tp_documents").delete().eq("id",row.id);
  if(result.error)throw result.error;
  await refresh();
  notice("Word-Dokument gelöscht.");
 }
 async function saveProject(){
  const projectId=$("tp-project-id").value;
  const data={owner_id:id(),name:$("tp-project-name").value.trim(),company_id:$("tp-project-company-choice").value,summary:$("tp-project-summary").value.trim(),content_html:cleanHtml($("tp-project-body").innerHTML),status:$("tp-project-status").value,updated_at:new Date().toISOString()};
  if(!data.name)throw new Error("Bitte einen Projektnamen eingeben.");
  if(!data.company_id)throw new Error("Bitte eine Firma auswählen.");
  if(data.content_html.length>500000)throw new Error("Projekttext ist zu lang.");
  const result=projectId?await db.from("tp_projects").update(data).eq("id",projectId).select("*").single():await db.from("tp_projects").insert(data).select("*").single();
  if(result.error)throw result.error;
  $("tp-project-id").value=result.data.id;
  $("tp-project-attachments").innerHTML=attached("project",result.data.id);
  await refresh();
  notice("Projekt gespeichert. Du kannst jetzt Word-Dokumente und Dateien anhängen.");
 }
 function splitLink(value){
  if(!value)return {type:"",key:""};
  const pos=value.indexOf(":");
  return {type:value.slice(0,pos),key:value.slice(pos+1)};
 }
 async function handleClick(event){
  const el=event.target.closest("button");if(!el)return;
  const d=el.dataset;
  try{
   if("projectNew" in d){openProject(null);return;}
   if(d.projectOpen){openProject(validProjects().find(x=>x.id===d.projectOpen));return;}
   if("docNew" in d){const v=splitLink(d.docNew);openDoc(null,v.type,v.key);return;}
   if("docImport" in d){const v=splitLink(d.docImport);await importWord(v.type,v.key);return;}
   if(d.docOpen){const doc=validDocs().find(x=>x.id===d.docOpen);if(doc)openDoc(doc);return;}
   if(d.docDownload){const doc=validDocs().find(x=>x.id===d.docDownload);if(doc)await downloadDocument(doc);return;}
   if(d.docDelete){const doc=validDocs().find(x=>x.id===d.docDelete);if(doc)await deleteDocument(doc);return;}
   if(d.fileDownload){const file=validFiles().find(x=>x.id===d.fileDownload);if(file)await downloadFile(file);return;}
   if(d.fileDelete){const file=validFiles().find(x=>x.id===d.fileDelete);if(file)await deleteFile(file);return;}
   if(d.fileUpload){const v=splitLink(d.fileUpload);await uploadFile(v.type,v.key);return;}
  }catch(error){fail(error);}
 }
 function init(){
  const content=$("content");
  content.addEventListener("click",handleClick);
  content.addEventListener("change",event=>{
   if(event.target?.id==="tp-project-company"){viewState.projectCompany=event.target.value;state.view==="projects"&&window.dispatchEvent(new Event("tp-refresh-view"));}
  });
  $("entry-attachments")?.addEventListener("click",handleClick);
  $("tp-project-attachments")?.addEventListener("click",handleClick);
  $("tp-document-save").addEventListener("click",async()=>{
   $("tp-document-save").disabled=true;
   try{await saveDocument();}catch(error){fail(error)}finally{$("tp-document-save").disabled=false;}
  });
  $("tp-document-export").addEventListener("click",async()=>{
   try{const title=$("tp-document-title").value.trim()||"Dokument";const blob=await toWord(title,$("tp-document-body").innerHTML);downloadBlob(blob,title.replace(/[\\/:*?"<>|]/g,"_")+".docx");}catch(e){fail(e)}
  });
  $("tp-project-save").addEventListener("click",async()=>{
   $("tp-project-save").disabled=true;
   try{await saveProject();}catch(error){fail(error)}finally{$("tp-project-save").disabled=false;}
  });
  function toolbar(event){
   const button=event.target.closest("button[data-format]");
   if(!button)return;
   event.preventDefault();
   const editor=button.closest("dialog").querySelector("[contenteditable]");
   if(!editor)return;
   editor.focus();
   const cmd=button.dataset.format;
   if(cmd==="h1"||cmd==="h2"||cmd==="p")document.execCommand("formatBlock",false,cmd);
   else if(cmd==="ul")document.execCommand("insertUnorderedList",false,null);
   else if(cmd==="ol")document.execCommand("insertOrderedList",false,null);
   else document.execCommand(cmd,false,null);
  }
  for(const dialog of [$("tp-document-dialog"),$("tp-project-dialog")]){
   dialog.addEventListener("mousedown",event=>{if(event.target.closest("button[data-format]"))event.preventDefault();});
   dialog.addEventListener("click",toolbar);
   dialog.addEventListener("paste",event=>{
    if(!event.target.closest("[contenteditable]"))return;
    event.preventDefault();
    document.execCommand("insertText",false,event.clipboardData?.getData("text/plain")||"");
   });
  }
 }
 return {load,init,projectsPage,documentsPage,setEntryAttachments,cleanHtml,attached,optionCompanies,
  get taskCompany(){return viewState.taskCompany;},
  set taskCompany(value){viewState.taskCompany=value||"";},
  get projectCompany(){return viewState.projectCompany;},
  set projectCompany(value){viewState.projectCompany=value||"";}
 };
}
