
import {runTableCommand,TABLE_MAX_ROWS,TABLE_MAX_COLS} from "./table-editor.js";
const BUCKET="tp-private-files";
const DOCX_MIME="application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const SCRIPT_DOCX="https://cdn.jsdelivr.net/npm/docx@9.15.3/dist/index.iife.js";
const SCRIPT_MAMMOTH="https://cdn.jsdelivr.net/npm/mammoth@1.13.0/mammoth.browser.js";

export function createFeatures({db,state,esc,fmt,notice,fail,refresh,company,openTask=()=>{},showProjectTasks=()=>{}}){
 const $=id=>document.getElementById(id);
 const viewState={taskCompany:"",taskProject:"",projectCompany:"",project:null,doc:null};
 const id=()=>state.user?.id;
 const parent= (row,type,key)=>type==="entry"?row.entry_id===key:row.project_id===key;
 const validDocs=()=>state.documents||[];
 const validFiles=()=>state.attachments||[];
 const validProjects=()=>state.projects||[];
 function projectName(projectId){
  return validProjects().find(p=>p.id===projectId)?.name||"Nicht mehr zugeordnet";
 }
 function projectOptions(companyId="",selected=""){
  const projects=validProjects().filter(p=>!companyId||p.company_id===companyId)
   .sort((a,b)=>company(a.company_id).localeCompare(company(b.company_id),"de")||a.name.localeCompare(b.name,"de"));
  return '<option value=""'+(!selected?' selected':'')+'>Alle Projekte</option>'+
   '<option value="__none__"'+(selected==="__none__"?' selected':'')+'>Ohne Projekt</option>'+
   projects.map(p=>'<option value="'+esc(p.id)+'"'+(p.id===selected?' selected':'')+'>'+
    esc(companyId?p.name:company(p.company_id)+" · "+p.name)+'</option>').join("");
 }
 function projectTaskRows(projectId){
  return (state.entries||[]).filter(e=>e.kind==="task"&&e.project_id===projectId);
 }
 function renderProjectTasks(projectId){
  if(!projectId)return '<p class="muted">Speichere zuerst das Projekt, um ihm Aufgaben zuzuordnen.</p>';
  const tasks=projectTaskRows(projectId)
   .sort((a,b)=>(a.status==="done")-(b.status==="done")||(a.due_at||"9999").localeCompare(b.due_at||"9999"));
  const open=tasks.filter(t=>t.status!=="done").length;
  let html='<div class="tp-project-task-summary"><strong>'+open+' offen</strong><span>'+
    (tasks.length-open)+' erledigt · '+tasks.length+' insgesamt</span></div>';
  if(!tasks.length)html+='<p class="muted">Hier sind noch keine Aufgaben verknüpft. Lege eine neue Aufgabe an oder ordne eine bestehende Aufgabe diesem Projekt zu.</p>';
  for(const e of tasks){
   html+='<div class="tp-project-task-row">'+
    '<span class="tp-project-task-status'+(e.status==="done"?" is-done":"")+'">'+(e.status==="done"?"✓":"○")+'</span>'+
    '<div class="tp-project-task-info"><strong>'+esc(e.title)+'</strong>'+
    '<span class="muted">'+(e.status==="done"?"Erledigt":"Offen")+
    (e.due_at?" · Fällig "+esc(fmt(e.due_at)):"")+'</span></div>'+
    '<button type="button" class="subtle" data-project-task-edit="'+esc(e.id)+'">Bearbeiten</button>'+
   '</div>';
  }
  html+='<button type="button" class="subtle tp-project-all-tasks" data-project-task-filter="'+esc(projectId)+'">Alle Projektaufgaben anzeigen</button>';
  return html;
 }
 function updateProjectTaskPanel(projectId){
  const tasksBox=$("tp-project-tasks");
  if(!tasksBox)return;
  tasksBox.innerHTML=renderProjectTasks(projectId);
  const addButton=$("tp-project-new-task");
  if(addButton){
   addButton.disabled=!projectId;
   addButton.title=projectId?"Neue Aufgabe für dieses Projekt":"Bitte Projekt zuerst speichern";
  }
 }


 async function load(){
  if(!id())return;
  const [pr,doc,file]=await Promise.all([
   db.from("tp_projects").select("*").order("updated_at",{ascending:false}),
   db.from("tp_documents").select("*").order("updated_at",{ascending:false}),
   db.from("tp_attachments").select("*").order("created_at",{ascending:false})
  ]);
  for(const r of [pr,doc,file])if(r.error)throw r.error;
  state.projects=pr.data||[];state.documents=doc.data||[];state.attachments=file.data||[];
  if($("tp-project-dialog")?.open)updateProjectTaskPanel($("tp-project-id").value);
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
 const blocked=new Set(["SCRIPT","STYLE","IFRAME","OBJECT","EMBED","SVG","MATH","FORM","INPUT","META","LINK","IMG","VIDEO","AUDIO","CANVAS","BASE"]);
 const allowed=new Set(["P","DIV","BR","B","STRONG","I","EM","U","S","STRIKE","H1","H2","H3","UL","OL","LI","BLOCKQUOTE","SPAN","FONT","TABLE","THEAD","TBODY","TFOOT","TR","TH","TD","HR"]);
 const fonts=["Arial","Calibri","Georgia","Times New Roman","Verdana","Courier New"];
 const fontSizes=[8,10,12,14,18,24,36];
 function safeColor(raw){
  if(!raw)return "";
  const value=String(raw).trim();
  if(/^#[\da-f]{6}$/i.test(value))return value.slice(1).toUpperCase();
  if(/^#[\da-f]{3}$/i.test(value))return [...value.slice(1)].map(c=>(c+c).toUpperCase()).join("");
  const rgb=value.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0(?:\.\d+)?|1(?:\.0+)?))?\s*\)$/i);
  if(rgb){
   if(rgb[4]!==undefined&&Number(rgb[4])<1)return "";
   const parts=rgb.slice(1,4).map(Number);
   if(parts.some(v=>v>255))return "";
   return parts.map(v=>v.toString(16).padStart(2,"0").toUpperCase()).join("");
  }
  return "";
 }
 function safeSize(raw){
  const match=String(raw||"").trim().match(/^(\d+(?:\.\d+)?)\s*(pt|px)$/i);
  if(!match)return null;
  const pt=Number(match[1])*(match[2].toLowerCase()==="px"?0.75:1);
  if(pt<7||pt>72)return null;
  return Math.round(pt*2)/2;
 }
 function safeFont(raw){
  const name=String(raw||"").split(",")[0].trim().replace(/^['"]|['"]$/g,"");
  return fonts.find(x=>x.toLowerCase()===name.toLowerCase())||"";
 }
 function cleanHtml(raw){
  const parsed=new DOMParser().parseFromString(String(raw||""),"text/html");
  const target=document.createElement("div");
  function append(node,to){
   if(node.nodeType===3){to.appendChild(document.createTextNode(node.nodeValue||""));return;}
   if(node.nodeType!==1)return;
   if(blocked.has(node.tagName))return;
   if(!allowed.has(node.tagName)){for(const x of [...node.childNodes])append(x,to);return;}
   const tag=node.tagName==="FONT"?"span":node.tagName.toLowerCase();
   const child=document.createElement(tag);
   const color=safeColor(node.style.color||node.getAttribute("color"));
   const background=safeColor(node.style.backgroundColor||node.getAttribute("bgcolor"));
   const rawSize=node.tagName==="FONT"&&node.getAttribute("size")
     ?fontSizes[Math.max(0,Math.min(6,Number(node.getAttribute("size"))-1))]
     :null;
   const size=rawSize||safeSize(node.style.fontSize);
   const font=safeFont(node.style.fontFamily||node.getAttribute("face"));
   if(color)child.style.color="#"+color;
   if(background)child.style.backgroundColor="#"+background;
   if(size)child.style.fontSize=size+"pt";
   if(font)child.style.fontFamily=font.includes(" ")?"'"+font+"'":font;
   if(/^(bold|[6-9]00)$/i.test(node.style.fontWeight))child.style.fontWeight="bold";
   if(node.style.fontStyle==="italic")child.style.fontStyle="italic";
   if(node.style.textDecorationLine?.includes("underline"))child.style.textDecoration="underline";
   if(node.style.textDecorationLine?.includes("line-through"))child.style.textDecoration="line-through";
   if(["P","DIV","H1","H2","H3","TD","TH"].includes(node.tagName)&&["left","center","right","justify"].includes(node.style.textAlign))
    child.style.textAlign=node.style.textAlign;
   if(tag==="table"){
    const caption=node.getAttribute("aria-label");
    if(caption)child.setAttribute("aria-label",caption.slice(0,120));
   }
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
  for(const d of docs)html+='<div class="tp-file"><span>📝 '+esc(d.title)+'.docx</span><div><button type="button" class="subtle tp-preview-button" data-doc-preview="'+d.id+'">👁 Vorschau</button><button type="button" class="subtle" data-doc-open="'+d.id+'">Bearbeiten</button><button type="button" class="subtle" data-doc-download="'+d.id+'">DOCX</button></div></div>';
  for(const f of files)html+='<div class="tp-file"><span>📎 '+esc(f.file_name)+' · '+Math.ceil(f.file_size/1024)+' KB</span><div>'+(f.file_name.toLowerCase().endsWith(".docx")?'<button type="button" class="subtle tp-preview-button" data-file-preview="'+f.id+'">👁 Vorschau</button>':'')+'<button type="button" class="subtle" data-file-download="'+f.id+'">Herunterladen</button><button type="button" class="subtle danger" data-file-delete="'+f.id+'">Löschen</button></div></div>';
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
   const tasks=projectTaskRows(p.id);
   const openTasks=tasks.filter(t=>t.status==="open").length;
   html+='<div class="item"><div class="meta"><span class="pill gold">'+esc(company(p.company_id))+'</span><span class="pill">'+esc({active:"Aktiv",paused:"Pausiert",done:"Abgeschlossen"}[p.status]||p.status)+'</span></div>';
   html+='<h3>'+esc(p.name)+'</h3><p>'+esc(p.summary||htmlText(p.content_html).slice(0,200)||"Noch keine Projektnotizen")+'</p>';
   html+='<div class="actions"><button type="button" data-project-open="'+p.id+'">Projekt öffnen</button><button type="button" class="subtle danger" data-project-delete="'+p.id+'">Projekt löschen</button><span class="tp-project-count">'+openTasks+' offene Aufgaben</span><span class="muted">'+tasks.length+' Aufgaben · '+count+' Dokumente/Dateien</span></div></div>';
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
  $("tp-project-delete").classList.toggle("hidden",!p.id);
  $("tp-project-name").value=p.name||"";
  $("tp-project-company-choice").innerHTML=optionCompanies(p.company_id||viewState.projectCompany||state.companies[0].id,"Firma auswählen");
  if(!$("tp-project-company-choice").value)$("tp-project-company-choice").value=state.companies[0].id;
  $("tp-project-summary").value=p.summary||"";
  $("tp-project-status").value=p.status||"active";
  $("tp-project-body").innerHTML=cleanHtml(p.content_html||"");
  $("tp-project-attachments").innerHTML=attached("project",p.id);
  updateProjectTaskPanel(p.id||"");
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
  $("tp-document-dialog").dispatchEvent(new Event("tp-word-open"));
  $("tp-document-body").focus();
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
  const {Document,Paragraph,TextRun,HeadingLevel,Packer,Table,TableCell,TableRow,
   WidthType,BorderStyle,AlignmentType,ShadingType}=window.docx;
  const container=document.createElement("div");
  container.innerHTML=cleanHtml(raw);
  const elements=[];
  function runStyle(node,existing={}){
   const style={...existing};
   if(["B","STRONG","TH"].includes(node.tagName)||node.style.fontWeight==="bold")style.bold=true;
   if(["I","EM"].includes(node.tagName)||node.style.fontStyle==="italic")style.italics=true;
   if(node.tagName==="U"||node.style.textDecorationLine?.includes("underline"))style.underline={};
   if(["S","STRIKE"].includes(node.tagName)||node.style.textDecorationLine?.includes("line-through"))style.strike=true;
   const color=safeColor(node.style.color);
   const highlight=safeColor(node.style.backgroundColor);
   const size=safeSize(node.style.fontSize);
   const font=safeFont(node.style.fontFamily);
   if(color)style.color=color;
   if(highlight)style.shading={type:ShadingType.CLEAR,fill:highlight};
   if(size)style.size=Math.round(size*2);
   if(font)style.font=font;
   return style;
  }
  function runs(node,inherited={}){
   if(node.nodeType===3){
    if(!node.nodeValue)return [];
    return [new TextRun({text:node.nodeValue,...inherited})];
   }
   if(node.nodeType!==1)return [];
   if(node.tagName==="BR")return [new TextRun({break:1})];
   if(["TABLE","UL","OL"].includes(node.tagName))return [];
   const next=runStyle(node,inherited);
   return [...node.childNodes].flatMap(child=>runs(child,next));
  }
  function paragraph(node,settings={},forced={}){
   const alignment={left:AlignmentType.LEFT,center:AlignmentType.CENTER,right:AlignmentType.RIGHT,justify:AlignmentType.JUSTIFIED};
   const align=node?.style?.textAlign;
   const options={...settings};
   if(align&&alignment[align])options.alignment=alignment[align];
   const parts=runs(node,forced);
   return new Paragraph({...options,children:parts.length?parts:[new TextRun({text:""})]});
  }
  function makeTable(tableNode){
   const rows=[...tableNode.querySelectorAll("tr")].filter(tr=>tr.closest("table")===tableNode).slice(0,TABLE_MAX_ROWS);
   if(!rows.length)return null;
   const cellsOf=tr=>[...tr.children].filter(td=>["TD","TH"].includes(td.tagName)).slice(0,TABLE_MAX_COLS);
   const count=Math.max(1,...rows.map(tr=>cellsOf(tr).length));
   const width=9000;
   const base=Math.floor(width/count);
   const widths=Array.from({length:count},(_,i)=>i===count-1?width-base*(count-1):base);
   const line={style:BorderStyle.SINGLE,size:5,color:"C8D0DB"};
   const borders={top:line,bottom:line,left:line,right:line};
   const wordRows=rows.map((tr,rowIndex)=>{
    const cells=cellsOf(tr);
    const isHead=rowIndex===0 && cells.some(c=>c.tagName==="TH");
    const result=widths.map((w,i)=>{
     const cell=cells[i];
     const label=cell||document.createElement("td");
     const isHeader=cell?.tagName==="TH";
     const fill=safeColor(label.style?.backgroundColor)||(isHeader?"E8EFF9":"");
     return new TableCell({
      width:{size:w,type:WidthType.DXA},
      borders,
      margins:{top:95,bottom:95,left:125,right:125},
      shading:fill?{type:ShadingType.CLEAR,fill}:undefined,
      children:[paragraph(label,{},isHeader?{bold:true}:{})]
     });
    });
    return new TableRow({children:result,tableHeader:isHead,cantSplit:true});
   });
   return new Table({
    width:{size:width,type:WidthType.DXA},
    columnWidths:widths,
    rows:wordRows
   });
  }
  function addList(list,level=0){
   const isNumbered=list.tagName==="OL";
   for(const li of [...list.children].filter(x=>x.tagName==="LI")){
    const textHolder=document.createElement("div");
    textHolder.style.textAlign=li.style.textAlign;
    for(const part of [...li.childNodes]){
     if(part.nodeType===1 && ["UL","OL"].includes(part.tagName))continue;
     textHolder.appendChild(part.cloneNode(true));
    }
    elements.push(paragraph(textHolder,
     isNumbered?{numbering:{reference:"trummplaner-numbering",level:Math.min(level,2)}}:{bullet:{level:Math.min(level,2)}}));
    for(const nested of [...li.children].filter(n=>["UL","OL"].includes(n.tagName)))addList(nested,level+1);
   }
  }
  function addBlock(node){
   if(node.nodeType===3){
    if(node.nodeValue.trim())elements.push(new Paragraph({children:runs(node)}));
    return;
   }
   if(node.nodeType!==1)return;
   const tag=node.tagName;
   if(tag==="TABLE"){
    const table=makeTable(node);
    if(table)elements.push(table);
   }else if(["OL","UL"].includes(tag)){
    addList(node);
   }else if(tag==="HR"){
    elements.push(new Paragraph({border:{bottom:{style:BorderStyle.SINGLE,color:"B5BDCA",size:7,space:1}},children:[new TextRun({text:" "})]}));
   }else if(["H1","H2","H3"].includes(tag)){
    elements.push(paragraph(node,{heading:tag==="H1"?HeadingLevel.HEADING_1:tag==="H2"?HeadingLevel.HEADING_2:HeadingLevel.HEADING_3}));
   }else if(tag==="DIV" && [...node.children].some(x=>["P","DIV","H1","H2","H3","UL","OL","TABLE","HR"].includes(x.tagName))){
    for(const child of [...node.childNodes])addBlock(child);
   }else{
    elements.push(paragraph(node));
   }
  }
  for(const node of [...container.childNodes])addBlock(node);
  if(!elements.length)elements.push(new Paragraph({text:""}));
  const levels=Array.from({length:3},(_,i)=>({
   level:i,format:"decimal",text:"%"+(i+1)+".",alignment:AlignmentType.LEFT,
   style:{paragraph:{indent:{left:(i+1)*720,hanging:320}}}
  }));
  const doc=new Document({
   creator:"TrummPlaner",title,
   numbering:{config:[{reference:"trummplaner-numbering",levels}]},
   sections:[{children:elements}]
  });
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
  $("tp-document-id").value=docId;
  viewState.doc=docId;
  await refresh();
  $("tp-document-dialog").dispatchEvent(new Event("tp-word-saved"));
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
  $("tp-document-dialog").dispatchEvent(new Event("tp-word-imported"));
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
 function showDocumentPreview(title,html,source,kind,recordId){
  const dialog=$("tp-doc-preview-dialog");
  if(!dialog)throw new Error("Die Vorschau-Oberfläche ist nicht verfügbar. Bitte TrummPlaner neu laden.");
  $("tp-preview-title").textContent=title;
  $("tp-preview-subtitle").textContent="Nur ansehen · keine Bearbeitung";
  $("tp-preview-source").textContent=source;
  $("tp-preview-content").innerHTML=cleanHtml(html||"");
  if(!$("tp-preview-content").textContent.trim()&&!$("tp-preview-content").querySelector("table")){
   $("tp-preview-content").textContent="Dieses Dokument enthält keinen darstellbaren Text.";
  }
  const download=$("tp-preview-download");
  download.dataset.previewKind=kind;
  download.dataset.previewId=recordId;
  download.hidden=false;
  $("tp-preview-scroll").scrollTop=0;
  dialog.showModal();
 }
 function previewStoredWord(row){
  if(!row)throw new Error("Word-Dokument nicht gefunden.");
  showDocumentPreview(row.title+".docx",row.content_html||"","TrummPlaner-Dokument", "doc",row.id);
 }
 async function previewAttachedWord(row){
  if(!row||!row.file_name.toLowerCase().endsWith(".docx"))throw new Error("Für diese Datei ist keine Word-Vorschau verfügbar.");
  const {data,error}=await db.storage.from(BUCKET).download(row.storage_path);
  if(error)throw error;
  await loadScript(SCRIPT_MAMMOTH,()=>!!window.mammoth?.convertToHtml);
  const converted=await window.mammoth.convertToHtml({arrayBuffer:await data.arrayBuffer()});
  showDocumentPreview(row.file_name,converted.value||"","Angehängte DOCX-Datei","file",row.id);
  const warningCount=converted.messages?.filter(m=>m.type==="warning").length||0;
  if(warningCount)notice("Die Vorschau zeigt den Dokumentinhalt; einzelne Word-Layoutdetails können abweichen.");
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
  updateProjectTaskPanel(result.data.id);
  notice("Projekt gespeichert. Du kannst jetzt Word-Dokumente und Dateien anhängen.");
 }
 async function deleteProject(projectId){
  const project=validProjects().find(p=>p.id===projectId);
  if(!project)throw new Error("Das Projekt wurde nicht gefunden. Bitte die Seite neu laden.");
  // Check current server data, not the possibly outdated local project snapshot.
  const [files,tasks,docs]=await Promise.all([
   db.from("tp_attachments").select("id,file_name").eq("owner_id",id()).eq("project_id",projectId),
   db.from("tp_entries").select("id",{count:"exact",head:true}).eq("owner_id",id()).eq("project_id",projectId),
   db.from("tp_documents").select("id",{count:"exact",head:true}).eq("owner_id",id()).eq("project_id",projectId)
  ]);
  if(files.error)throw files.error;
  if(tasks.error)throw tasks.error;
  if(docs.error)throw docs.error;
  if(files.data?.length){
   const names=files.data.slice(0,3).map(f=>f.file_name).join(", ");
   throw new Error("Dieses Projekt hat noch "+files.data.length+" Dateianhang/Dateianhänge ("+names+"). "+
    "Bitte diese zuerst im Projekt herunterladen oder löschen. So gehen keine Dateien versehentlich verloren.");
  }
  const taskCount=tasks.count||0;
  const docCount=docs.count||0;
  const warning="Projekt „"+project.name+"“ wirklich endgültig löschen?\n\n"+
   "Firma: "+company(project.company_id)+"\n"+
   taskCount+" verknüpfte Aufgabe(n) bleiben erhalten und werden zu „Ohne Projekt“.\n"+
   docCount+" Word-Dokument(e) bleiben im Reiter „Word-Dokumente“ erhalten, aber ohne Projektzuordnung.\n\n"+
   "Nur die Projektinformationen und Projektnotizen werden endgültig gelöscht.";
  if(!confirm(warning))return false;
  const buttons=[...document.querySelectorAll("[data-project-delete]")].filter(b=>b.dataset.projectDelete===projectId);
  if($("tp-project-id").value===projectId)buttons.push($("tp-project-delete"));
  buttons.forEach(b=>b.disabled=true);
  try{
   const result=await db.from("tp_projects").delete().eq("id",projectId).eq("owner_id",id()).select("id");
   if(result.error)throw result.error;
   if(!result.data?.length)throw new Error("Projekt wurde nicht gelöscht. Es wurde möglicherweise bereits entfernt.");
   if($("tp-project-id").value===projectId&&$("tp-project-dialog").open)$("tp-project-dialog").close();
   if(viewState.taskProject===projectId)viewState.taskProject="";
   if(viewState.project===projectId)viewState.project=null;
   await refresh();
   notice("Projekt „"+project.name+"“ gelöscht. Verknüpfte Aufgaben und Word-Dokumente wurden behalten.");
   return true;
  }finally{
   buttons.forEach(b=>b.disabled=false);
  }
 }
 function splitLink(value){
  if(!value)return {type:"",key:""};
  const pos=value.indexOf(":");
  return {type:value.slice(0,pos),key:value.slice(pos+1)};
 }
 function handleProjectTaskClick(event){
  const button=event.target.closest("button");
  if(!button)return;
  const pId=$("tp-project-id").value;
  if(!pId)return;
  const project=validProjects().find(p=>p.id===pId);
  if(!project)return;
  if("projectTaskNew" in button.dataset){
   openTask({companyId:project.company_id,projectId:pId});
  }else if(button.dataset.projectTaskEdit){
   const entry=projectTaskRows(pId).find(t=>t.id===button.dataset.projectTaskEdit);
   if(entry)openTask({entryId:entry.id,projectId:pId,companyId:project.company_id});
  }else if(button.dataset.projectTaskFilter){
   $("tp-project-dialog").close();
   showProjectTasks({companyId:project.company_id,projectId:pId});
  }
 }
 async function handleClick(event){
  const el=event.target.closest("button");if(!el)return;
  const d=el.dataset;
  try{
   if("projectNew" in d){openProject(null);return;}
   if(d.projectOpen){openProject(validProjects().find(x=>x.id===d.projectOpen));return;}
   if(d.projectDelete){await deleteProject(d.projectDelete);return;}
   if("docNew" in d){const v=splitLink(d.docNew);openDoc(null,v.type,v.key);return;}
   if("docImport" in d){const v=splitLink(d.docImport);await importWord(v.type,v.key);return;}
   if(d.docPreview){const doc=validDocs().find(x=>x.id===d.docPreview);if(doc)previewStoredWord(doc);return;}
   if(d.filePreview){const file=validFiles().find(x=>x.id===d.filePreview);if(file)await previewAttachedWord(file);return;}
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
  $("tp-project-tasks")?.addEventListener("click",handleProjectTaskClick);
  $("tp-project-new-task")?.addEventListener("click",handleProjectTaskClick);
  // Project remains open beneath the read-only preview.
  const previewDialog=$("tp-doc-preview-dialog");
  const closePreview=()=>previewDialog.close();
  $("tp-preview-close-top").addEventListener("click",closePreview);
  $("tp-preview-close").addEventListener("click",closePreview);
  previewDialog.addEventListener("close",()=>{
   $("tp-preview-content").replaceChildren();
   const button=$("tp-preview-download");
   delete button.dataset.previewKind;
   delete button.dataset.previewId;
  });
  $("tp-preview-download").addEventListener("click",async()=>{
   const button=$("tp-preview-download");
   button.disabled=true;
   try{
    if(button.dataset.previewKind==="doc"){
     const doc=validDocs().find(d=>d.id===button.dataset.previewId);
     if(!doc)throw new Error("Dokument nicht mehr vorhanden.");
     await downloadDocument(doc);
    }else if(button.dataset.previewKind==="file"){
     const file=validFiles().find(f=>f.id===button.dataset.previewId);
     if(!file)throw new Error("Anhang nicht mehr vorhanden.");
     await downloadFile(file);
    }
   }catch(error){fail(error)}finally{button.disabled=false;}
  });
  $("tp-document-save").addEventListener("click",async()=>{
   $("tp-document-save").disabled=true;
   setWordStatus("Wird gespeichert …");
   try{await saveDocument();}catch(error){setWordDirty(true);fail(error)}finally{$("tp-document-save").disabled=false;}
  });
  $("tp-document-export").addEventListener("click",async()=>{
   try{const title=$("tp-document-title").value.trim()||"Dokument";const blob=await toWord(title,$("tp-document-body").innerHTML);downloadBlob(blob,title.replace(/[\\/:*?"<>|]/g,"_")+".docx");}catch(e){fail(e)}
  });
  const wordDialog=$("tp-document-dialog");
  const wordEditor=$("tp-document-body");
  const wordPaper=$("tp-word-paper");
  let wordDirty=false;
  function updateWordCount(){
   const str=wordEditor.innerText||wordEditor.textContent||"";
   const words=str.trim().match(/\S+/g)?.length||0;
   const count=$("tp-word-count");
   if(count)count.textContent=words+" Wörter · "+str.length+" Zeichen";
  }
  function setWordStatus(message){
   $("tp-word-save-state").textContent=message;
  }
  function setWordDirty(value){
   wordDirty=!!value;
   setWordStatus(wordDirty?"● Nicht gespeichert":$("tp-document-id").value?"✓ Gespeichert":"Neues Dokument");
   updateWordCount();
  }
  function switchRibbon(name){
   const allowed=["file","home","insert","layout","view"];
   if(!allowed.includes(name))name="home";
   wordDialog.querySelectorAll("[data-ribbon-tab]").forEach(tab=>{
    const on=tab.dataset.ribbonTab===name;
    tab.classList.toggle("is-active",on);
    tab.setAttribute("aria-selected",String(on));
    tab.tabIndex=on?0:-1;
   });
   wordDialog.querySelectorAll("[data-ribbon-panel]").forEach(panel=>{
    panel.hidden=panel.dataset.ribbonPanel!==name;
   });
  }
  function setWordZoom(value){
   const z=Math.max(60,Math.min(140,Number(value)||100));
   wordPaper.style.zoom=z+"%";
   $("tp-word-zoom").value=String(z);
   $("tp-word-zoom-value").textContent=z+" %";
  }
  function closeWordEditor(){
   if(wordDirty&&!confirm("Du hast ungespeicherte Änderungen. Möchtest du den Dokumenteditor wirklich verlassen?"))return;
   wordDialog.close();
   wordDirty=false;
  }
  wordDialog.addEventListener("tp-word-open",()=>{
   switchRibbon("home");
   setWordZoom(100);
   lastEditor=null;lastRange=null;
   setWordDirty(false);
  });
  wordDialog.addEventListener("tp-word-imported",()=>setWordDirty(true));
  wordDialog.addEventListener("tp-word-saved",()=>setWordDirty(false));
  wordEditor.addEventListener("input",()=>setWordDirty(true));
  $("tp-document-title").addEventListener("input",()=>setWordDirty(true));
  $("tp-document-link").addEventListener("change",()=>setWordDirty(true));
  $("tp-word-close").addEventListener("click",closeWordEditor);
  wordDialog.addEventListener("cancel",event=>{
   event.preventDefault();
   closeWordEditor();
  });
  wordDialog.addEventListener("keydown",event=>{
   const activeTab=event.target.closest("[data-ribbon-tab]");
   if(activeTab&&["ArrowLeft","ArrowRight"].includes(event.key)){
    event.preventDefault();
    const tabs=[...wordDialog.querySelectorAll("[data-ribbon-tab]")];
    const current=tabs.indexOf(activeTab);
    const next=tabs[(current+(event.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length];
    switchRibbon(next.dataset.ribbonTab);
    next.focus();
    return;
   }
   if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="s"){
    event.preventDefault();
    $("tp-document-save").click();
   }
  });
  wordDialog.addEventListener("click",event=>{
   const tab=event.target.closest("[data-ribbon-tab]");
   if(tab){switchRibbon(tab.dataset.ribbonTab);return;}
   const action=event.target.closest("[data-word-action]");
   if(!action)return;
   const name=action.dataset.wordAction;
   if(name==="save")$("tp-document-save").click();
   if(name==="export")$("tp-document-export").click();
   if(name==="zoom-in")setWordZoom(Number($("tp-word-zoom").value)+10);
   if(name==="zoom-out")setWordZoom(Number($("tp-word-zoom").value)-10);
   if(name==="zoom-reset")setWordZoom(100);
  });
  $("tp-word-zoom").addEventListener("input",event=>setWordZoom(event.target.value));
  $("tp-project-delete").addEventListener("click",async()=>{
   const idValue=$("tp-project-id").value;
   if(!idValue)return;
   try{await deleteProject(idValue)}catch(error){fail(error)}
  });
  $("tp-project-save").addEventListener("click",async()=>{
   $("tp-project-save").disabled=true;
   try{await saveProject();}catch(error){fail(error)}finally{$("tp-project-save").disabled=false;}
  });
  let lastEditor=null,lastRange=null;
  const dialogs=[$("tp-document-dialog"),$("tp-project-dialog")];
  const editorOf=element=>element.closest("dialog")?.querySelector("[contenteditable]");
  const tableMenu=$("tp-table-context-menu");
  let selectedTableCell=null;
  let tableLongPressTimer=null;
  let touchStart=null;
  function hideTableMenu(){
   tableMenu.hidden=true;
   selectedTableCell=null;
  }
  function showTableMenu(cell,x,y){
   if(!wordDialog.open||!cell||!wordEditor.contains(cell))return;
   selectedTableCell=cell;
   tableMenu.hidden=false;
   tableMenu.style.left="0px";
   tableMenu.style.top="0px";
   // Keep the entire menu visible near the clicked cell, including near screen edges.
   const bounds=tableMenu.getBoundingClientRect();
   const left=Math.max(8,Math.min(x,window.innerWidth-bounds.width-8));
   const top=Math.max(8,Math.min(y,window.innerHeight-bounds.height-8));
   tableMenu.style.left=Math.round(left)+"px";
   tableMenu.style.top=Math.round(top)+"px";
   tableMenu.focus({preventScroll:true});
  }
  function focusTableCell(cell){
   if(cell&&wordEditor.contains(cell)){
    wordEditor.focus();
    const range=document.createRange();
    range.selectNodeContents(cell);
    range.collapse(true);
    const sel=window.getSelection();
    if(sel){sel.removeAllRanges();sel.addRange(range);}
    lastEditor=wordEditor;
    lastRange=range.cloneRange();
   }else wordEditor.focus();
  }
  wordEditor.addEventListener("contextmenu",event=>{
   const cell=event.target.closest("td,th");
   if(!cell||!wordEditor.contains(cell)||!cell.closest("table"))return;
   event.preventDefault();
   showTableMenu(cell,event.clientX,event.clientY);
  });
  // The installed PWA has no right mouse button on phones. Long-press a cell.
  wordEditor.addEventListener("pointerdown",event=>{
   if(event.pointerType!=="touch")return;
   const cell=event.target.closest("td,th");
   if(!cell||!wordEditor.contains(cell))return;
   clearTimeout(tableLongPressTimer);
   touchStart={x:event.clientX,y:event.clientY};
   tableLongPressTimer=setTimeout(()=>{
    tableLongPressTimer=null;
    showTableMenu(cell,touchStart.x,touchStart.y);
   },650);
  });
  const cancelLongPress=()=>{clearTimeout(tableLongPressTimer);tableLongPressTimer=null;touchStart=null;};
  wordEditor.addEventListener("pointerup",cancelLongPress);
  wordEditor.addEventListener("pointercancel",cancelLongPress);
  wordEditor.addEventListener("pointermove",event=>{
   if(touchStart&&Math.hypot(event.clientX-touchStart.x,event.clientY-touchStart.y)>12)cancelLongPress();
  });
  wordDialog.addEventListener("tp-word-open",hideTableMenu);
  wordDialog.addEventListener("close",hideTableMenu);
  wordDialog.addEventListener("scroll",hideTableMenu,true);
  wordDialog.addEventListener("pointerdown",event=>{
   if(!tableMenu.hidden&&!event.target.closest("#tp-table-context-menu")&&!event.target.closest("td,th"))hideTableMenu();
  });
  tableMenu.addEventListener("keydown",event=>{
   if(event.key==="Escape"){event.stopPropagation();hideTableMenu();wordEditor.focus();}
   if(event.key==="ArrowDown"||event.key==="ArrowUp"){
    event.preventDefault();
    const buttons=[...tableMenu.querySelectorAll("[data-table-action]")];
    const current=buttons.indexOf(document.activeElement);
    const direction=event.key==="ArrowDown"?1:-1;
    buttons[(current+direction+buttons.length)%buttons.length]?.focus();
   }
  });
  tableMenu.addEventListener("click",event=>{
   const button=event.target.closest("[data-table-action]");
   if(!button||!selectedTableCell)return;
   event.preventDefault();
   event.stopPropagation();
   const cell=selectedTableCell;
   const command=button.dataset.tableAction;
   hideTableMenu();
   if(command==="table-delete"&&!confirm("Die gesamte Tabelle einschließlich aller Inhalte wirklich löschen?")){
    focusTableCell(cell);return;
   }
   try{
    const action=runTableCommand(cell,command);
    if(action.changed){
     setWordDirty(true);
     focusTableCell(action.selection);
    }
   }catch(error){fail(error);focusTableCell(cell);}
  });

  function rememberSelection(){
   const sel=window.getSelection();
   if(!sel?.rangeCount||!sel.anchorNode)return;
   const editor=dialogs.map(d=>d.querySelector("[contenteditable]")).find(e=>e?.contains(sel.anchorNode));
   if(!editor)return;
   lastEditor=editor;
   lastRange=sel.getRangeAt(0).cloneRange();
  }
  document.addEventListener("selectionchange",rememberSelection);
  function restoreSelection(editor){
   editor.focus();
   if(lastEditor===editor&&lastRange){
    try{
     const sel=window.getSelection();
     sel.removeAllRanges();
     sel.addRange(lastRange.cloneRange());
    }catch{ /* Selection was invalidated by editing. */ }
   }
  }
  function addTable(editor,dialog){
   const count=(selector,defaultValue)=>Math.max(2,Math.min(8,Number(dialog.querySelector(selector)?.value||defaultValue)||defaultValue));
   const rows=count("[data-table-rows]",3),cols=count("[data-table-cols]",3);
   let html="<table><tbody>";
   for(let i=0;i<rows;i++){
    html+="<tr>";
    for(let j=0;j<cols;j++)html+=(i===0?"<th>":"<td>")+"<br>"+(i===0?"</th>":"</td>");
    html+="</tr>";
   }
   html+="</tbody></table><p><br></p>";
   if(!document.execCommand("insertHTML",false,html)){
    const wrapper=document.createElement("div");
    wrapper.innerHTML=html;
    const sel=window.getSelection();
    const range=sel?.rangeCount?sel.getRangeAt(0):null;
    if(range&&editor.contains(range.commonAncestorContainer)){
     range.deleteContents();
     while(wrapper.firstChild)range.insertNode(wrapper.firstChild);
    }else while(wrapper.firstChild)editor.appendChild(wrapper.firstChild);
   }
   const tables=editor.querySelectorAll("table");
   const firstCell=tables[tables.length-1]?.querySelector("th,td");
   if(firstCell){
    const range=document.createRange();
    range.selectNodeContents(firstCell);
    range.collapse(true);
    const selection=window.getSelection();
    selection.removeAllRanges();selection.addRange(range);
    lastEditor=editor;lastRange=range.cloneRange();
   }
  }
  function runToolbar(event){
   const button=event.target.closest("button[data-format]");
   if(!button)return;
   event.preventDefault();
   const dialog=button.closest("dialog");
   const editor=editorOf(button);
   if(!editor)return;
   restoreSelection(editor);
   const cmd=button.dataset.format;
   if(cmd==="table")addTable(editor,dialog);
   else if(cmd==="rule")document.execCommand("insertHorizontalRule",false,null);
   else if(["h1","h2","p"].includes(cmd))document.execCommand("formatBlock",false,cmd);
   else if(cmd==="ul")document.execCommand("insertUnorderedList",false,null);
   else if(cmd==="ol")document.execCommand("insertOrderedList",false,null);
   else document.execCommand(cmd,false,null);
   if(dialog===wordDialog)setWordDirty(true);
   rememberSelection();
  }
  for(const dialog of dialogs){
   dialog.addEventListener("mousedown",event=>{
    if(event.target.closest("button[data-format]"))event.preventDefault();
   });
   dialog.addEventListener("click",runToolbar);
   dialog.addEventListener("change",event=>{
    const input=event.target;
    if(!input.matches("[data-color],[data-font-size],[data-font-family]"))return;
    const editor=editorOf(input);
    if(!editor)return;
    restoreSelection(editor);
    if(input.matches("[data-color]")){
     if(input.dataset.color==="fore")document.execCommand("foreColor",false,input.value);
     else{
      const ok=document.execCommand("hiliteColor",false,input.value);
      if(!ok)document.execCommand("backColor",false,input.value);
     }
    }else if(input.matches("[data-font-size]")){
     if(/^[1-7]$/.test(input.value))document.execCommand("fontSize",false,input.value);
    }else if(input.matches("[data-font-family]")){
     if(fonts.includes(input.value))document.execCommand("fontName",false,input.value);
    }
    if(dialog===wordDialog)setWordDirty(true);
    rememberSelection();
    if(input.matches("select"))input.selectedIndex=0;
   });
   dialog.addEventListener("paste",event=>{
    if(!event.target.closest("[contenteditable]"))return;
    event.preventDefault();
    document.execCommand("insertText",false,event.clipboardData?.getData("text/plain")||"");
   });
  }
 }
 return {load,init,projectsPage,documentsPage,setEntryAttachments,cleanHtml,toWord,attached,optionCompanies,projectOptions,projectName,deleteProject,
  get taskCompany(){return viewState.taskCompany;},
  set taskCompany(value){viewState.taskCompany=value||"";},
  get taskProject(){return viewState.taskProject;},
  set taskProject(value){viewState.taskProject=value||"";},
  get projectCompany(){return viewState.projectCompany;},
  set projectCompany(value){viewState.projectCompany=value||"";}
 };
}
