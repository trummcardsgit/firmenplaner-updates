export const menuItems=Object.freeze({dashboard:"Übersicht",career:"Karriere",tickets:"Tickets",statistics:"Statistikcenter",inventory:"Inventar",tasks:"Aufgaben",notes:"Notizen",solutions:"Lösungen",projects:"Projekte",documents:"Word-Dokumente",companies:"Firmen",admin:"Benutzerverwaltung",settings:"Einstellungen"});
export const memberMenu=Object.freeze(['tickets','dashboard','tasks','notes','solutions','projects','companies','career','inventory']);
const defaults=[...memberMenu,...Object.keys(menuItems).filter(k=>!memberMenu.includes(k))];
export const ticketMenuItems=Object.freeze({all:"All Tickets",open:"Open Tickets",my:"My Tickets"});
export function normalizeTicketOrder(value){
 return [...new Set([...(Array.isArray(value)?value:[]).filter(k=>typeof k==="string"&&Object.hasOwn(ticketMenuItems,k)),...Object.keys(ticketMenuItems)])];
}
export function applyTicketOrder(document,order){
 for(const root of document.querySelectorAll("#tp-ticket-subnav,.tp-ticket-mobile-subnav")){
  const buttons=new Map([...root.querySelectorAll(":scope > [data-ticket-category]")].map(b=>[b.dataset.ticketCategory,b]));
  for(const key of normalizeTicketOrder(order)){const b=buttons.get(key);if(b)root.append(b);}
 }
}
const clean=a=>[...new Set((Array.isArray(a)?a:[]).filter(k=>typeof k==="string"&&Object.hasOwn(menuItems,k)))];
export function normalizeMenu(value={}){
 return {menu_order:[...new Set([...clean(value?.menu_order),...defaults])],hidden_items:clean(value?.hidden_items),ticket_order:normalizeTicketOrder(value?.ticket_order)};
}
export function allowedMenu(key,isAdmin){return Object.hasOwn(menuItems,key)&&(isAdmin===true||memberMenu.includes(key));}
export function visibleMenu(value,isAdmin){const p=normalizeMenu(value);return p.menu_order.filter(k=>allowedMenu(k,isAdmin));}
export function moveMenu(value,key,direction,isAdmin){
 const p=normalizeMenu(value),allowed=p.menu_order.filter(k=>allowedMenu(k,isAdmin)),i=allowed.indexOf(key),j=i+direction;
 if(i<0||j<0||j>=allowed.length||![-1,1].includes(direction))return p;
 const a=p.menu_order.indexOf(key),b=p.menu_order.indexOf(allowed[j]);[p.menu_order[a],p.menu_order[b]]=[p.menu_order[b],p.menu_order[a]];return p;
}
export function applyMenu(document,value,isAdmin,activeView){
 const p=normalizeMenu(value);applyTicketOrder(document,p.ticket_order);
 for(const root of document.querySelectorAll("#nav,.bottom-nav")){
  const buttons=new Map([...root.querySelectorAll(":scope > button[data-view]")].map(b=>[b.dataset.view,b]));
  const adjust=root.querySelector(":scope > [data-menu-customize]");
  const submenu=root.querySelector("#tp-ticket-subnav");
  for(const key of p.menu_order){
   const b=buttons.get(key);if(!b)continue;
   b.hidden=!allowedMenu(key,isAdmin);
   root.insertBefore(b,adjust||null);
   if(key==="tickets"&&submenu){root.insertBefore(submenu,adjust||null);submenu.hidden=b.hidden||activeView!=="tickets";b.setAttribute("aria-expanded",String(!submenu.hidden));}
  }
 }
}
export function createMenuEditor({document,db,userId,isAdmin,onSaved,onError}){
 const dialog=document.getElementById("tp-menu-dialog"),rows=document.getElementById("tp-menu-rows"),message=document.getElementById("tp-menu-message"),save=document.getElementById("tp-menu-save");
 const ticketRows=document.getElementById("tp-menu-ticket-rows"),mainSection=document.getElementById("tp-menu-main-section");
 let draft=normalizeMenu(),owner=null,busy=false,epoch=0,ticketOnly=false;
 function draw(){
  rows.replaceChildren();
  const allowed=draft.menu_order.filter(k=>allowedMenu(k,isAdmin()));
  for(const [i,key] of allowed.entries()){
   const row=document.createElement("div");row.className="tp-menu-row";row.dataset.menuKey=key;
   const label=document.createElement("span");label.textContent=menuItems[key];
   const checkLabel=document.createElement("label"),check=document.createElement("input");check.type="checkbox";check.checked=true;check.disabled=true;check.setAttribute("aria-label",menuItems[key]+" anzeigen");
   checkLabel.append(check,document.createTextNode("Sichtbar · Rolle"));
   const controls=document.createElement("div");controls.className="tp-menu-move";
   for(const [dir,symbol,word] of [[-1,"↑","nach oben"],[1,"↓","nach unten"]]){
    const b=document.createElement("button");b.type="button";b.textContent=symbol;b.setAttribute("aria-label",menuItems[key]+" "+word);b.disabled=busy||(dir===-1?i===0:i===allowed.length-1);
    b.onclick=()=>{draft=moveMenu(draft,key,dir,isAdmin());draw();rows.querySelector('[data-menu-key="'+key+'"] button[aria-label="'+menuItems[key]+' '+word+'"]')?.focus();};controls.append(b);
   }
   row.draggable=!busy;
   row.ondragstart=e=>{e.dataTransfer.setData("text/plain",key);e.dataTransfer.effectAllowed="move";};
   row.ondragover=e=>{if(!busy)e.preventDefault();};
   row.ondrop=e=>{e.preventDefault();if(busy)return;const from=e.dataTransfer.getData("text/plain");if(from===key||!allowedMenu(from,isAdmin()))return;const order=draft.menu_order.filter(k=>k!==from);const rect=row.getBoundingClientRect();order.splice(order.indexOf(key)+(e.clientY>rect.top+rect.height/2?1:0),0,from);draft.menu_order=order;draw();};
   row.append(label,checkLabel,controls);rows.append(row);
  }
  ticketRows.replaceChildren();
  for(const [i,key] of draft.ticket_order.entries()){
   const row=document.createElement("div");row.className="tp-menu-row tp-menu-ticket-row";row.dataset.ticketMenuKey=key;
   const label=document.createElement("span");label.textContent=ticketMenuItems[key];
   const controls=document.createElement("div");controls.className="tp-menu-move";
   for(const [dir,symbol,word] of [[-1,"↑","nach oben"],[1,"↓","nach unten"]]){
    const b=document.createElement("button");b.type="button";b.textContent=symbol;b.setAttribute("aria-label",ticketMenuItems[key]+" "+word);b.disabled=busy||i+dir<0||i+dir>=draft.ticket_order.length;
    b.onclick=()=>{if(b.disabled)return;[draft.ticket_order[i],draft.ticket_order[i+dir]]=[draft.ticket_order[i+dir],draft.ticket_order[i]];draw();ticketRows.querySelector('[data-ticket-menu-key="'+key+'"] button[aria-label="'+ticketMenuItems[key]+' '+word+'"]')?.focus();};controls.append(b);
   }
   row.draggable=!busy;row.ondragstart=e=>{e.dataTransfer.setData("text/plain",key);e.dataTransfer.effectAllowed="move";};
   row.ondragover=e=>{if(!busy)e.preventDefault();};
   row.ondrop=e=>{e.preventDefault();const from=e.dataTransfer.getData("text/plain");if(busy||from===key||!Object.hasOwn(ticketMenuItems,from))return;const order=draft.ticket_order.filter(k=>k!==from);const rect=row.getBoundingClientRect();order.splice(order.indexOf(key)+(e.clientY>rect.top+rect.height/2?1:0),0,from);draft.ticket_order=order;draw();};
   row.append(label,controls);ticketRows.append(row);
  }
  save.disabled=busy;document.getElementById("tp-menu-reset").disabled=busy;document.getElementById("tp-menu-cancel").disabled=busy;
 }
 function open(p,onlyTickets=false){if(!userId()||busy)return;owner=userId();epoch++;ticketOnly=onlyTickets;mainSection.hidden=ticketOnly;document.getElementById("tp-menu-heading").textContent=ticketOnly?"Ticket-Reihenfolge anpassen":"Mein Menü anpassen";draft=normalizeMenu(p);message.textContent="";draw();if(!dialog.open)dialog.showModal();}
 function reset(){epoch++;owner=null;busy=false;if(dialog.open)dialog.close();rows.replaceChildren();ticketRows.replaceChildren();message.textContent="";}
 document.getElementById("tp-menu-reset").onclick=()=>{if(!busy){if(ticketOnly)draft.ticket_order=normalizeTicketOrder();else draft=normalizeMenu();draw();}};
 document.getElementById("tp-menu-cancel").onclick=()=>{if(!busy)dialog.close();};
 dialog.addEventListener("cancel",e=>{if(busy)e.preventDefault();});
 document.getElementById("tp-menu-form").onsubmit=async e=>{
  e.preventDefault();if(busy||!owner||owner!==userId())return;
  const uid=owner,gen=epoch,p=normalizeMenu(draft);busy=true;message.textContent="Wird gespeichert …";draw();
  try{
   const {data,error}=await db.from("tp_menu_preferences").upsert({owner_id:uid,...p},{onConflict:"owner_id"}).select("menu_order,hidden_items,ticket_order").single();
   if(error||!data)throw error||new Error("Speicherung nicht bestätigt");
   if(gen!==epoch||uid!==userId())return;
   dialog.close();onSaved(normalizeMenu(data));
  }catch(e){if(gen===epoch&&uid===userId()){message.textContent="Menü konnte nicht gespeichert werden. Bitte erneut versuchen.";onError(e);}}
  finally{if(gen===epoch&&uid===userId()){busy=false;draw();}}
 };
 return {open,reset,isOpen:()=>dialog.open};
}
