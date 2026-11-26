// Restricted text markup. No user-supplied HTML is ever interpreted as HTML.
const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const tags={"**":"strong","*":"em","__":"u","~~":"s"};
function legacyInline(s,depth=0){
 if(depth>8)return escape(s);
 let out="",pos=0;
 const pattern=/(\*\*|__|~~|\*)(?=\S)/g;
 for(let m;(m=pattern.exec(s));){
  const marker=m[0],start=m.index,end=s.indexOf(marker,start+marker.length);
  if(end<=start+marker.length||/\s/.test(s[end-1]))continue;
  out+=escape(s.slice(pos,start))+"<"+tags[marker]+">"+legacyInline(s.slice(start+marker.length,end),depth+1)+"</"+tags[marker]+">";
  pos=end+marker.length;pattern.lastIndex=pos;
 }
 return out+escape(s.slice(pos));
}
const checkPattern=/^(\s*(?:-\s+)?\[)([ xX])(\]\s*)(.*)$/;
export function ticketTextHtml(value,interactive=false){
 return String(value??"").split(/\r?\n/).map((line,i)=>{
  const check=line.match(checkPattern);
  if(check)return '<div class="tp-rich-check"><input type="checkbox" aria-label="Checkliste Zeile '+(i+1)+'" '+(check[2].toLowerCase()==="x"?"checked ":"")+(interactive?'data-check-line="'+i+'"':'disabled')+'><span>'+inline(check[4])+'</span></div>';
  const heading=line.match(/^(#{1,3})\s+(.+)$/);
  if(heading)return '<div class="tp-rich-heading tp-rich-heading-'+heading[1].length+'">'+inline(heading[2])+'</div>';
  const list=line.match(/^(\s*)([-•]|\d+\.)\s+(.*)$/);
  if(list)return '<div class="tp-rich-list"><span class="tp-rich-bullet">'+escape(list[2]==="-"?"•":list[2])+'</span><span>'+inline(list[3])+'</span></div>';
  return '<div class="tp-rich-line">'+(line?inline(line):"<br>")+'</div>';
 }).join("");
}
export function canEditTicketDescription(ticket,uid,isAdmin,candidates=[]){
 return !!uid&&ticket?.status!=="closed"&&!!ticket&&(ticket.creator_id===uid||ticket.assignee_id===uid||isAdmin||ticket.status==="open"&&candidates.some(c=>String(c.ticket_id)===String(ticket.id)&&c.user_id===uid&&c.response==="pending"));
}
export function checklistEnter(value,start,end=start){
 const lineStart=value.lastIndexOf("\n",Math.max(0,start-1))+1,lineEnd=value.indexOf("\n",start);
 const line=value.slice(lineStart,lineEnd===-1?value.length:lineEnd),check=line.match(checkPattern);
 if(!check||start<lineStart+check[1].length+1+check[3].length)return null;
 if(!check[4].trim()&&start===end&&start===lineStart+line.length)return {value:value.slice(0,lineStart)+value.slice(start),cursor:lineStart};
 const prefix="\n"+check[1]+" "+check[3].replace(/\s*$/," ");
 return {value:value.slice(0,start)+prefix+value.slice(end),cursor:start+prefix.length};
}

const tokenTags={b:"strong",i:"em",u:"u",s:"s"};
// New markup is still plain text. Literal characters are escaped, and only
// these four balanced formatting tokens can produce HTML elements.
function inline(s,depth=0){
 if(depth>12)return escape(s);
 const pattern=/\\([\\*_\x7e\[\]])|\[\[([bius])\]\]/g;
 let out="",pos=0;
 for(let m;(m=pattern.exec(s));){
  if(m[1]){out+=legacyInline(s.slice(pos,m.index))+escape(m[1]);pos=pattern.lastIndex;continue;}
  const close="[[/"+m[2]+"]]";
  let end=pattern.lastIndex;
  while((end=s.indexOf(close,end))>=0){let slashes=0;for(let j=end-1;j>=0&&s[j]==="\\";j--)slashes++;if(slashes%2===0)break;end+=close.length;}
  if(end<0)continue;
  out+=legacyInline(s.slice(pos,m.index))+"<"+tokenTags[m[2]]+">"+inline(s.slice(pattern.lastIndex,end),depth+1)+"</"+tokenTags[m[2]]+">";
  pos=end+close.length;pattern.lastIndex=pos;
 }
 return out+legacyInline(s.slice(pos));
}

export function ticketEditorMarkup(name,label,max=20000,value=""){
 const tools=[["bold","B","Fett"],["italic","I","Kursiv"],["underline","U","Unterstrichen"],["strike","S","Durchgestrichen"],["heading","H","Überschrift"],["bullet","•","Aufzählung"],["number","1.","Nummerierung"],["check","☑","Checkliste"]];
 return '<div class="tp-rich-editor" data-ticket-editor data-max="'+Number(max)+'"><label id="tp-rich-label-'+escape(name)+'" for="tp-rich-'+escape(name)+'">'+escape(label)+'</label><div class="tp-rich-toolbar" role="group" aria-label="Textformatierung">'+tools.map(([cmd,symbol,title])=>'<button type="button" data-rich-command="'+cmd+'" title="'+title+'" aria-label="'+title+'" class="tp-rich-tool tp-rich-tool-'+cmd+'">'+symbol+'</button>').join("")+'</div><div id="tp-rich-'+escape(name)+'" class="tp-rich-surface" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="tp-rich-label-'+escape(name)+'" aria-required="true" tabindex="0" spellcheck="true"></div><input type="hidden" data-rich-value name="'+escape(name)+'" value="'+escape(value)+'"><small>Text markieren und direkt formatieren. Checkliste: Enter erzeugt ein neues Kästchen; Enter bei leerem Kästchen beendet die Liste.</small><small class="tp-rich-error" role="alert" hidden></small></div>';
}
const literal=s=>s.replace(/\u00a0/g," ").replace(/\u200b/g,"").replace(/[\\*_\x7e\[\]]/g,m=>"\\"+m);
function inlineText(node){
 if(node.nodeType===3)return literal(node.nodeValue||"");
 if(node.nodeType!==1||node.matches("input,[data-rich-marker],script,style,iframe,object"))return "";
 if(node.tagName==="BR")return "";
 const children=[...node.childNodes].map(inlineText).join("");
 if(!children)return "";
 const style=node.style,tag=node.tagName.toLowerCase();
 const types=[];
 if(["b","strong"].includes(tag)||style.fontWeight==="bold"||Number(style.fontWeight)>=600)types.push("b");
 if(["i","em"].includes(tag)||style.fontStyle==="italic")types.push("i");
 if(tag==="u"||/\bunderline\b/.test(style.textDecoration+" "+style.textDecorationLine))types.push("u");
 if(["s","strike","del"].includes(tag)||/\bline-through\b/.test(style.textDecoration+" "+style.textDecorationLine))types.push("s");
 return types.reduceRight((s,t)=>"[["+t+"]]"+s+"[[/"+t+"]]",children);
}
function rowKind(row){
 if(row?.matches(".tp-rich-check"))return "check";
 if(row?.matches(".tp-rich-heading"))return "heading";
 if(row?.matches(".tp-rich-list"))return row.querySelector(".tp-rich-bullet")?.textContent.trim().endsWith(".")?"number":"bullet";
 return "plain";
}
const bodyOf=row=>row?.querySelector(":scope > .tp-rich-body")||row;
function rowText(row,index=0){
 const kind=rowKind(row),body=bodyOf(row),text=inlineText(body);
 if(kind==="check")return "- ["+(row.querySelector("input")?.checked?"x":" ")+"] "+text;
 if(kind==="heading")return "## "+text;
 if(kind==="bullet")return "- "+text;
 if(kind==="number")return (row.querySelector(".tp-rich-bullet")?.textContent.trim()||"1.")+" "+text;
 return text;
}
export function serializeTicketEditor(surface){
 return [...surface.childNodes].map((node,i)=>node.nodeType===1?rowText(node,i):inlineText(node)).join("\n");
}
function createRow(doc,kind="plain",content=null,checked=false,number=1){
 const row=doc.createElement("div");
 row.className=kind==="check"?"tp-rich-check":kind==="heading"?"tp-rich-heading tp-rich-heading-2":kind==="bullet"||kind==="number"?"tp-rich-list":"tp-rich-line";
 row.dataset.richRow="";
 if(kind==="check"){
  const input=doc.createElement("input");input.type="checkbox";input.checked=checked;input.setAttribute("contenteditable","false");input.setAttribute("aria-label","Checkliste");input.dataset.richMarker="";row.append(input);
 }else if(kind==="bullet"||kind==="number"){
  const bullet=doc.createElement("span");bullet.className="tp-rich-bullet";bullet.textContent=kind==="bullet"?"•":number+".";bullet.setAttribute("contenteditable","false");bullet.dataset.richMarker="";row.append(bullet);
 }
 const body=doc.createElement("span");body.className="tp-rich-body";if(content)body.append(content);if(!body.childNodes.length)body.append(doc.createElement("br"));row.append(body);return row;
}
function hydrate(surface,value){
 const doc=surface.ownerDocument,temp=doc.createElement("div");temp.innerHTML=ticketTextHtml(value,true);
 surface.replaceChildren();
 for(const old of [...temp.children]){
  const kind=rowKind(old),content=doc.createDocumentFragment();
  const source=kind==="check"?old.querySelector("span"):kind==="bullet"||kind==="number"?old.lastElementChild:old;
  if(source)while(source.firstChild)content.append(source.firstChild);
  surface.append(createRow(doc,kind,content,!!old.querySelector("input")?.checked,parseInt(old.querySelector(".tp-rich-bullet")?.textContent)||1));
 }
 if(!surface.childNodes.length)surface.append(createRow(doc));
}
const editors=new WeakMap();
export function syncTicketEditor(root){
 const editor=editors.get(root);return editor?editor.sync(true):true;
}
export function mountTicketEditor(root){
 const surface=root.querySelector(".tp-rich-surface"),field=root.querySelector("[data-rich-value]"),message=root.querySelector(".tp-rich-error");
 if(!surface||!field)return;
 const doc=surface.ownerDocument,win=doc.defaultView,initial=field.value,max=Number(root.dataset.max);
 hydrate(surface,initial);
 const baseline=serializeTicketEditor(surface);
 let saved=null;
 const inside=r=>surface.contains(r.startContainer)&&surface.contains(r.endContainer);
 const remember=()=>{const selection=win.getSelection();if(selection?.rangeCount&&inside(selection.getRangeAt(0)))saved=selection.getRangeAt(0).cloneRange();};
 const restore=()=>{
  const selection=win.getSelection();surface.focus();
  if(saved&&inside(saved)){selection.removeAllRanges();selection.addRange(saved);}
  else if(!selection.rangeCount||!inside(selection.getRangeAt(0))){const r=doc.createRange();r.selectNodeContents(bodyOf(surface.lastElementChild)||surface);r.collapse(false);selection.removeAllRanges();selection.addRange(r);}
  return selection;
 };
 const rowAt=node=>{let el=node.nodeType===1?node:node.parentElement;if(el===surface)return surface.firstElementChild;return el?.closest("[data-rich-row]");};
 const caret=(body,end=false)=>{const r=doc.createRange();r.selectNodeContents(body);r.collapse(!end);const selection=win.getSelection();selection.removeAllRanges();selection.addRange(r);saved=r.cloneRange();};
 const sync=(validate=false)=>{
  const encoded=serializeTicketEditor(surface);field.value=encoded===baseline?initial:encoded;
  const plain=[...surface.querySelectorAll("[data-rich-row]")].map(r=>bodyOf(r).textContent).join("").trim()||surface.textContent.trim();
  const error=!plain?"Bitte Text eingeben.":field.value.length>max?"Der Text ist zu lang (maximal "+max+" Zeichen).":"";
  message.hidden=!error||!validate;message.textContent=validate?error:"";
  if(validate&&error){surface.focus();return false;}return true;
 };
 editors.set(root,{sync});
 function setKind(kind){
  const selection=restore(),r=selection.getRangeAt(0),start=rowAt(r.startContainer),end=rowAt(r.endContainer);
  const rows=[...surface.querySelectorAll(":scope > [data-rich-row]")];
  let a=rows.indexOf(start),b=rows.indexOf(end);if(a<0)a=0;if(b<a)b=a;
  const chosen=rows.slice(a,b+1);let last=null;
  for(const [i,old] of chosen.entries()){
   const body=bodyOf(old),fragment=doc.createDocumentFragment();
   while(body.firstChild)fragment.append(body.firstChild);
   const row=createRow(doc,kind===rowKind(old)?"plain":kind,fragment,false,i+1);old.replaceWith(row);last=row;
  }
  if(last)caret(bodyOf(last),true);sync();
 }
 const commands={bold:"bold",italic:"italic",underline:"underline",strike:"strikeThrough"};
 function command(cmd){
  if(commands[cmd]){
   restore();if(typeof doc.execCommand==="function"){doc.execCommand("styleWithCSS",false,false);doc.execCommand(commands[cmd],false,null);}
   remember();sync();return;
  }
  if(["heading","bullet","number","check"].includes(cmd))setKind(cmd);
 }
 root.querySelectorAll("[data-rich-command]").forEach(btn=>{
  btn.addEventListener("pointerdown",remember);
  btn.addEventListener("mousedown",e=>e.preventDefault());
  btn.addEventListener("click",()=>command(btn.dataset.richCommand));
 });
 surface.addEventListener("keyup",remember);surface.addEventListener("pointerup",remember);surface.addEventListener("focusout",remember);
 surface.addEventListener("input",()=>{remember();sync();});
 surface.addEventListener("change",e=>{if(e.target.matches("input[type=checkbox]"))sync();});
 surface.addEventListener("keydown",e=>{
  if((e.ctrlKey||e.metaKey)&&!e.altKey){const cmd={b:"bold",i:"italic",u:"underline"}[e.key.toLowerCase()];if(cmd){e.preventDefault();command(cmd);return;}}
  if(e.key!=="Enter"||e.ctrlKey||e.metaKey||e.isComposing)return;
  const selection=win.getSelection();if(!selection?.rangeCount)return;
  const r=selection.getRangeAt(0),row=rowAt(r.startContainer);if(!row||!inside(r))return;
  if(row!==rowAt(r.endContainer))return;
  const body=bodyOf(row),kind=rowKind(row);if(!body.contains(r.startContainer)||!body.contains(r.endContainer))return;
  e.preventDefault();
  if(!body.textContent.trim()&&kind!=="plain"){const next=createRow(doc);row.replaceWith(next);caret(bodyOf(next));sync();return;}
  r.deleteContents();
  const tail=doc.createRange();tail.selectNodeContents(body);tail.setStart(r.startContainer,r.startOffset);
  const fragment=tail.extractContents();
  if(!body.textContent&&!body.querySelector("br"))body.append(doc.createElement("br"));
  const nextKind=e.shiftKey?"plain":kind==="heading"?"plain":kind;
  const next=createRow(doc,nextKind,fragment,false,(parseInt(row.querySelector(".tp-rich-bullet")?.textContent)||0)+1);
  row.after(next);caret(bodyOf(next));sync();
 });
 // Paste text only; pasted HTML and dropped files cannot enter the editor.
 surface.addEventListener("paste",e=>{e.preventDefault();const text=e.clipboardData?.getData("text/plain")||"";if(!text)return;
  if(typeof doc.execCommand==="function")doc.execCommand("insertText",false,text);
  else{const sel=restore(),r=sel.getRangeAt(0);r.deleteContents();r.insertNode(doc.createTextNode(text));r.collapse(false);sel.removeAllRanges();sel.addRange(r);}
  remember();sync();
 });
 surface.addEventListener("drop",e=>e.preventDefault());
 sync();
}
