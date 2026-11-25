// TrummPlaner quick due-date presets for the task editor.
// All values are local datetime-local strings, matching the existing due_at save flow.
const pad=n=>String(n).padStart(2,"0");
export const PRESET_DAYS={today:0,tomorrow:1,threeDays:3,oneWeek:7,twoWeeks:14};

export function dueDateForPreset(preset,now=new Date()){
 const current=new Date(now);
 if(Number.isNaN(current.getTime()))throw new Error("Ungültiges Ausgangsdatum.");
 let date;
 if(preset==="month"){
  const lastDayOfNextMonth=new Date(current.getFullYear(),current.getMonth()+2,0).getDate();
  date=new Date(current.getFullYear(),current.getMonth()+1,
   Math.min(current.getDate(),lastDayOfNextMonth),17,0,0,0);
 }else if(Object.hasOwn(PRESET_DAYS,preset)){
  date=new Date(current.getFullYear(),current.getMonth(),
   current.getDate()+PRESET_DAYS[preset],17,0,0,0);
 }else if(preset==="none"){
  return "";
 }else{
  throw new Error("Unbekannte Datumsvorlage: "+preset);
 }
 return date.getFullYear()+"-"+pad(date.getMonth()+1)+"-"+pad(date.getDate())+
  "T"+pad(date.getHours())+":"+pad(date.getMinutes());
}

export function installDueDatePresets(root=document,{now=()=>new Date()}={}){
 const field=root.getElementById("entry-due");
 const group=root.getElementById("tp-due-presets");
 const hint=root.getElementById("tp-due-hint");
 const kind=root.getElementById("entry-kind");
 const dueSection=root.getElementById("tp-due-field");
 const reminderSection=root.getElementById("entry-remind-field");
 if(!field||!group||!hint||!kind||!dueSection||!reminderSection){
  throw new Error("Die Datumsauswahl ist nicht vollständig eingebaut.");
 }
 const buttons=[...group.querySelectorAll("[data-due-preset]")];
 const formatDate=value=>{
  if(!value)return "Kein Fälligkeitstermin festgelegt.";
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return "Bitte einen gültigen Termin auswählen.";
  const readable=date.toLocaleString("de-AT",{
   weekday:"short",day:"2-digit",month:"2-digit",year:"numeric",
   hour:"2-digit",minute:"2-digit"
  });
  return "Fällig: "+readable+" Uhr · Termin ist vor dem Speichern noch änderbar.";
 };
 function sync(){
  const isTask=kind.value==="task";
  dueSection.classList.toggle("hidden",!isTask);
  reminderSection.classList.toggle("hidden",!isTask);
  for(const button of buttons){
   const preset=button.dataset.duePreset;
   const isActive=isTask&&field.value===dueDateForPreset(preset,now());
   button.classList.toggle("is-active",isActive);
   button.setAttribute("aria-pressed",String(isActive));
  }
  hint.textContent=formatDate(field.value);
 }
 group.addEventListener("click",event=>{
  const button=event.target.closest("button[data-due-preset]");
  if(!button||!group.contains(button)||button.disabled||kind.value!=="task")return;
  field.value=dueDateForPreset(button.dataset.duePreset,now());
  field.dispatchEvent(new root.defaultView.Event("input",{bubbles:true}));
  field.dispatchEvent(new root.defaultView.Event("change",{bubbles:true}));
  sync();
 });
 field.addEventListener("input",sync);
 field.addEventListener("change",sync);
 kind.addEventListener("change",sync);
 sync();
 return {sync};
}
