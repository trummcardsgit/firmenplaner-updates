// TrummPlaner: independent due-date and reminder quick presets.
// Both use local datetime-local values, as expected by the existing task form.
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
 const kind=root.getElementById("entry-kind");
 const dueSection=root.getElementById("tp-due-field");
 const reminderSection=root.getElementById("entry-remind-field");
 const configs=[
  {fieldId:"entry-due",groupId:"tp-due-presets",hintId:"tp-due-hint",
   dataAttr:"data-due-preset",label:"Fällig",empty:"Kein Fälligkeitstermin festgelegt."},
  {fieldId:"entry-remind",groupId:"tp-remind-presets",hintId:"tp-remind-hint",
   dataAttr:"data-remind-preset",label:"Erinnerung",empty:"Keine Erinnerung festgelegt."}
 ];
 if(!kind||!dueSection||!reminderSection)throw new Error("Die Datumsauswahl ist nicht vollständig eingebaut.");
 const controls=configs.map(config=>{
  const field=root.getElementById(config.fieldId);
  const group=root.getElementById(config.groupId);
  const hint=root.getElementById(config.hintId);
  if(!field||!group||!hint)throw new Error("Fehlendes Datumsfeld: "+config.fieldId);
  return {...config,field,group,hint,
   buttons:[...group.querySelectorAll("button["+config.dataAttr+"]")]};
 });
 function formatDate(control){
  if(!control.field.value)return control.empty;
  const date=new Date(control.field.value);
  if(Number.isNaN(date.getTime()))return "Bitte einen gültigen Termin auswählen.";
  const readable=date.toLocaleString("de-AT",{
   weekday:"short",day:"2-digit",month:"2-digit",year:"numeric",
   hour:"2-digit",minute:"2-digit"
  });
  const warning=control.fieldId==="entry-remind"&&!controls[0].field.value
   ?" Hinweis: Zum Speichern auch eine Fälligkeit auswählen.":"";
  return control.label+": "+readable+" Uhr · Du kannst den Termin noch ändern."+warning;
 }
 function sync(){
  const isTask=kind.value==="task";
  dueSection.classList.toggle("hidden",!isTask);
  reminderSection.classList.toggle("hidden",!isTask);
  const reference=now();
  for(const control of controls){
   for(const button of control.buttons){
    const preset=button.getAttribute(control.dataAttr);
    const selected=isTask&&control.field.value===dueDateForPreset(preset,reference);
    button.classList.toggle("is-active",selected);
    button.setAttribute("aria-pressed",String(selected));
   }
   control.hint.textContent=formatDate(control);
  }
 }
 for(const control of controls){
  control.group.addEventListener("click",event=>{
   const button=event.target.closest("button["+control.dataAttr+"]");
   if(!button||!control.group.contains(button)||button.disabled||kind.value!=="task")return;
   control.field.value=dueDateForPreset(button.getAttribute(control.dataAttr),now());
   control.field.dispatchEvent(new root.defaultView.Event("input",{bubbles:true}));
   control.field.dispatchEvent(new root.defaultView.Event("change",{bubbles:true}));
   sync();
  });
  control.field.addEventListener("input",sync);
  control.field.addEventListener("change",sync);
 }
 kind.addEventListener("change",sync);
 sync();
 return {sync};
}
