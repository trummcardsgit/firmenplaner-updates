// Restricted text markup. No user-supplied HTML is ever interpreted as HTML.
const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const tags={"**":"strong","*":"em","__":"u","~~":"s"};
function inline(s,depth=0){
 if(depth>8)return escape(s);
 let out="",pos=0;
 const pattern=/(\*\*|__|~~|\*)(?=\S)/g;
 for(let m;(m=pattern.exec(s));){
  const marker=m[0],start=m.index,end=s.indexOf(marker,start+marker.length);
  if(end<=start+marker.length||/\s/.test(s[end-1]))continue;
  out+=escape(s.slice(pos,start))+"<"+tags[marker]+">"+inline(s.slice(start+marker.length,end),depth+1)+"</"+tags[marker]+">";
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
export function ticketEditorMarkup(name,label,max=20000,value=""){
 const tools=[["bold","B","Fett"],["italic","I","Kursiv"],["underline","U","Unterstrichen"],["strike","S","Durchgestrichen"],["heading","H","Überschrift"],["bullet","•","Aufzählung"],["number","1.","Nummerierung"],["check","☑","Checkliste"]];
 return '<div class="tp-rich-editor" data-ticket-editor><label for="tp-rich-'+escape(name)+'">'+escape(label)+'</label><div class="tp-rich-toolbar" role="group" aria-label="Textformatierung">'+tools.map(([cmd,symbol,title])=>'<button type="button" data-rich-command="'+cmd+'" title="'+title+'" aria-label="'+title+'" class="tp-rich-tool tp-rich-tool-'+cmd+'">'+symbol+'</button>').join("")+'</div><textarea id="tp-rich-'+escape(name)+'" name="'+escape(name)+'" rows="7" required maxlength="'+Number(max)+'" placeholder="Text eingeben oder markieren und formatieren …">'+escape(value)+'</textarea><small>Text markieren und formatieren. Checkliste: Enter erzeugt ein neues Kästchen; Enter bei leerem Kästchen beendet die Liste.</small><div class="tp-rich-preview-label">Formatierte Vorschau</div><div class="tp-rich-preview" aria-label="Formatierte Vorschau"></div></div>';
}
export function mountTicketEditor(root){
 const area=root.querySelector("textarea"),preview=root.querySelector(".tp-rich-preview");
 if(!area||!preview)return;
 const render=()=>{preview.innerHTML=ticketTextHtml(area.value,true);};
 const set=(value,start,end=start)=>{
  if(value.length>area.maxLength)return;
  area.value=value;area.focus();area.setSelectionRange(start,end);render();
 };
 const command=cmd=>{
  const a=area.selectionStart,b=area.selectionEnd,v=area.value;
  const marker={bold:"**",italic:"*",underline:"__",strike:"~~"}[cmd];
  if(marker){
   const selected=v.slice(a,b);
   if(v.slice(a-marker.length,a)===marker&&v.slice(b,b+marker.length)===marker&&a>=marker.length)set(v.slice(0,a-marker.length)+selected+v.slice(b+marker.length),a-marker.length,b-marker.length);
   else if(selected.startsWith(marker)&&selected.endsWith(marker)&&selected.length>=2*marker.length)set(v.slice(0,a)+selected.slice(marker.length,-marker.length)+v.slice(b),a,b-2*marker.length);
   else set(v.slice(0,a)+marker+selected+marker+v.slice(b),a+marker.length,b+marker.length);
   return;
  }
  const prefix={heading:"## ",bullet:"- ",number:"1. ",check:"- [ ] "}[cmd];if(!prefix)return;
  const start=v.lastIndexOf("\n",Math.max(0,a-1))+1,next=v.indexOf("\n",b),end=next<0?v.length:next;
  const lines=v.slice(start,end).split("\n");
  const strip=/^(?:#{1,3}\s+|(?:-\s+)?\[[ xX]\]\s*|[-•]\s+|\d+\.\s+)/;
  const formatted=lines.map((line,i)=>(cmd==="number"?(i+1)+". ":prefix)+line.replace(strip,"")).join("\n");
  const cursor=a===b?Math.min(start+formatted.length,start+prefix.length+Math.max(0,a-start-lines[0].length+lines[0].replace(strip,"").length)):start;
  set(v.slice(0,start)+formatted+v.slice(end),cursor,a===b?cursor:start+formatted.length);
 };
 root.querySelectorAll("[data-rich-command]").forEach(btn=>{
  btn.addEventListener("mousedown",e=>e.preventDefault());
  btn.addEventListener("click",()=>command(btn.dataset.richCommand));
 });
 area.addEventListener("input",render);
 area.addEventListener("keydown",e=>{
  if((e.ctrlKey||e.metaKey)&&!e.altKey){const cmd={b:"bold",i:"italic",u:"underline"}[e.key.toLowerCase()];if(cmd){e.preventDefault();command(cmd);return;}}
  if(e.key==="Enter"&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!e.isComposing){
   const r=checklistEnter(area.value,area.selectionStart,area.selectionEnd);if(r){e.preventDefault();set(r.value,r.cursor);}
  }
 });
 preview.addEventListener("change",e=>{
  const target=e.target;if(!target.matches("input[data-check-line]"))return;
  const i=Number(target.dataset.checkLine),lines=area.value.split("\n");
  if(!Number.isInteger(i)||!checkPattern.test(lines[i]||""))return;
  lines[i]=lines[i].replace(checkPattern,(_,a,b,c,d)=>a+(target.checked?"x":" ")+c+d);
  const cursor=area.selectionStart;area.value=lines.join("\n");area.setSelectionRange(cursor,cursor);render();
 });
 render();
}
