// TrummPlaner speech-to-text for task descriptions and saved solutions.
// Uses the browser-provided Web Speech API; it never records audio to TrummPlaner Storage.
export function installDictation(root=document, host=window){
 const Recognizer=host.SpeechRecognition||host.webkitSpeechRecognition;
 const wrappers=[...root.querySelectorAll("[data-dictation-target]")];
 let active=null;
 const errorMessages={
  "not-allowed":"Mikrofonzugriff verweigert. Bitte die Mikrofonberechtigung für TrummPlaner erlauben.",
  "service-not-allowed":"Der Browser hat die Spracherkennung blockiert. Bitte Spracheingabe in den Browsereinstellungen prüfen.",
  "audio-capture":"Kein Mikrofon verfügbar. Bitte das Mikrofon oder die Windows-/Handy-Berechtigung prüfen.",
  "network":"Die Spracherkennung hat keine Verbindung. Internet prüfen und Diktat erneut starten.",
  "language-not-supported":"Diese Sprache wird vom Erkennungsdienst nicht unterstützt. Bitte Deutsch (Deutschland) auswählen.",
  "bad-grammar":"Die Spracherkennung konnte nicht gestartet werden.",
  "phrases-not-supported":"Diese Spracherkennung unterstützt die Spracheinstellung nicht."
 };
 const lookup={};
 for(const wrapper of wrappers){
  const fieldId=wrapper.dataset.dictationTarget;
  const target=root.getElementById(fieldId);
  const button=wrapper.querySelector("[data-dictate]");
  const status=wrapper.querySelector("[data-dictation-status]");
  const interim=wrapper.querySelector("[data-dictation-interim]");
  const selector=wrapper.querySelector("[data-dictation-lang]");
  if(!target||!button||!status||!interim||!selector)continue;
  const context={fieldId,target,button,status,interim,selector,dialog:target.closest("dialog")};
  lookup[fieldId]=context;
  if(!Recognizer){
   button.disabled=true;
   button.title="Keine Browser-Spracherkennung verfügbar";
   status.textContent="Browser unterstützt Diktat nicht. Nutze die Mikrofontaste deiner Smartphone-Tastatur.";
  }
  button.addEventListener("click",()=>toggle(context));
  selector.addEventListener("change",()=>{
   if(active===context){
    status.textContent="Zum Sprachwechsel bitte erst stoppen und erneut diktieren.";
   }
  });
  context.dialog?.addEventListener("close",()=>{if(active?.fieldId===context.fieldId)stop({abort:true,message:"Diktat beendet."});});
  if(fieldId==="solution-text"){
   root.getElementById("solution-save-to-library")?.addEventListener("change",event=>{
    if(!event.target.checked&&active?.fieldId===context.fieldId)stop({abort:true,message:"Diktat beendet."});
   });
  }
 }
 function setState(ctx,mode,message){
  const recording=mode==="recording"||mode==="starting";
  ctx.button.classList.toggle("is-recording",recording);
  ctx.button.setAttribute("aria-pressed",String(recording));
  ctx.button.querySelector(".tp-dictation-button-label").textContent=recording?"Stoppen":"Diktieren";
  ctx.status.textContent=message;
  ctx.status.classList.toggle("tp-dictation-error",mode==="error");
  if(!recording)ctx.interim.textContent="";
 }
 function appendFinal(ctx,raw){
  let spoken=String(raw||"").trim();
  if(!spoken)return;
  if(/^neuer absatz[.!?]?$/i.test(spoken))spoken="\n\n";
  else if(/^neue zeile[.!?]?$/i.test(spoken))spoken="\n";
  else if(/^punkt[.!?]?$/i.test(spoken))spoken=".";
  else if(/^komma[.!?]?$/i.test(spoken))spoken=",";
  else if(/^fragezeichen[.!?]?$/i.test(spoken))spoken="?";
  else if(/^ausrufezeichen[.!?]?$/i.test(spoken))spoken="!";
  const original=ctx.target.value||"";
  const prefix=spoken.startsWith("\n")||!original||/\s$/.test(original)||/^[,.;:!?]/.test(spoken)?"":" ";
  let combined=original+prefix+spoken;
  const max=ctx.target.maxLength>0?ctx.target.maxLength:Infinity;
  if(combined.length>max){
   combined=combined.slice(0,max);
   ctx.limitReached=true;
  }
  if(combined!==original){
   ctx.target.value=combined;
   ctx.target.dispatchEvent(new host.Event("input",{bubbles:true}));
   ctx.target.scrollTop=ctx.target.scrollHeight;
   ctx.fragments++;
  }
 }
 function finalize(ctx,message,mode="idle"){
  if(ctx.restartTimer){host.clearTimeout(ctx.restartTimer);ctx.restartTimer=null;}
  ctx.wanted=false;
  if(active===ctx)active=null;
  ctx.recognition=null;
  setState(ctx,mode,message|| (ctx.fragments?"Diktat beendet. Text prüfen und anschließend speichern.":"Diktat beendet."));
 }
 function stop({abort=false,message}={}){
  const ctx=active;
  if(!ctx)return;
  ctx.wanted=false;
  if(ctx.restartTimer){host.clearTimeout(ctx.restartTimer);ctx.restartTimer=null;}
  ctx.endMessage=message|| (abort?"Diktat beendet.":"Diktat wird abgeschlossen …");
  if(abort){
   // Closing the dialog must not append late browser events.
   ctx.ignoreResults=true;
   try{ctx.recognition?.abort();}catch{}
   finalize(ctx,ctx.endMessage);
  }else{
   setState(ctx,"idle","Diktat wird abgeschlossen …");
   try{ctx.recognition?.stop();}catch{finalize(ctx,"Diktat beendet. Text prüfen und speichern.");}
  }
 }
 function beginSession(ctx){
  if(!ctx.wanted||active!==ctx)return;
  const recognition=new Recognizer();
  recognition.lang=ctx.selector.value==="de-DE"?"de-DE":"de-AT";
  recognition.continuous=true;
  recognition.interimResults=true;
  recognition.maxAlternatives=1;
  ctx.recognition=recognition;
  ctx.processed=new Set();
  ctx.heardThisSession=false;
  ctx.ignoreResults=false;
  recognition.onstart=()=>{
   if(active===ctx&&ctx.wanted)setState(ctx,"recording","🔴 Aufnahme läuft · deutlich sprechen, Pause ist erlaubt.");
  };
  recognition.onresult=event=>{
   if(active!==ctx||ctx.ignoreResults||!ctx.dialog?.open)return;
   const interim=[];
   for(let i=0;i<(event.results?.length||0);i++){
    const result=event.results[i];
    const transcript=String(result?.[0]?.transcript||"").trim();
    if(!transcript)continue;
    ctx.heardThisSession=true;
    if(result.isFinal){
     if(!ctx.processed.has(i)){
      ctx.processed.add(i);
      appendFinal(ctx,transcript);
     }
    }else interim.push(transcript);
   }
   ctx.interim.textContent=interim.length?"Wird erkannt: "+interim.join(" "):"";
   if(ctx.limitReached&&ctx.wanted){
    ctx.wanted=false;
    ctx.endMessage="Maximale Textlänge erreicht. Bitte Text kontrollieren und speichern.";
    try{recognition.stop();}catch{finalize(ctx,ctx.endMessage);}
   }
  };
  recognition.onerror=event=>{
   if(active!==ctx)return;
   const error=event.error||"";
   if(error==="aborted"&&!ctx.wanted)return;
   if(error==="no-speech"){
    ctx.silenceCount++;
    ctx.endMessage=ctx.silenceCount>=3?"Keine Sprache erkannt. Mikrofon prüfen und Diktat erneut starten.":"Kurze Sprechpause. Mikrofon wird erneut aktiviert …";
    if(ctx.silenceCount>=3)ctx.wanted=false;
    return;
   }
   ctx.wanted=false;
   ctx.endMessage=errorMessages[error]||"Spracherkennung unterbrochen. Bitte erneut starten.";
   ctx.error=true;
  };
  recognition.onend=()=>{
   if(active!==ctx)return;
   ctx.interim.textContent="";
   if(ctx.heardThisSession){ctx.silenceCount=0;ctx.blankEndCount=0;}
   else ctx.blankEndCount++;
   if(!ctx.wanted||!ctx.dialog?.open){
    finalize(ctx,ctx.endMessage||(ctx.fragments?"Diktat beendet. Text prüfen und speichern.":"Keine Sprache erkannt."),ctx.error?"error":"idle");
    return;
   }
   if(ctx.blankEndCount>=4){
    finalize(ctx,"Spracherkennung wurde mehrfach ohne Text beendet. Bitte Diktat erneut starten.","error");
    return;
   }
   setState(ctx,"starting","Sprechpause · Mikrofon wird wieder aktiviert …");
   ctx.restartTimer=host.setTimeout(()=>{
    ctx.restartTimer=null;
    if(active!==ctx||!ctx.wanted)return;
    try{beginSession(ctx);}
    catch{finalize(ctx,"Automatisches Fortsetzen nicht möglich. Bitte erneut auf Diktieren tippen.","error");}
   },ctx.blankEndCount>1?900:400);
  };
  recognition.start();
 }
 function start(ctx){
  if(!Recognizer)return;
  if(active){
   stop({abort:true,message:"Diktat gewechselt."});
  }
  if(!ctx.dialog?.open){
   setState(ctx,"error","Bitte zuerst das Eingabefenster öffnen.");
   return;
  }
  const session={...ctx,wanted:true,fragments:0,silenceCount:0,blankEndCount:0,limitReached:false,
   endMessage:"",error:false,recognition:null,restartTimer:null,processed:new Set(),ignoreResults:false};
  active=session;
  setState(ctx,"starting","Mikrofon wird aktiviert · Bitte Zugriff erlauben …");
  try{beginSession(session);}
  catch(error){
   finalize(session,errorMessages[error?.name]||"Mikrofonstart fehlgeschlagen. Bitte Berechtigung und Browser prüfen.","error");
  }
 }
 function toggle(ctx){
  if(active?.fieldId===ctx.fieldId){stop();return;}
  start(ctx);
 }
 root.addEventListener("visibilitychange",()=>{
  if(root.hidden&&active)stop({abort:true,message:"Diktat wegen App-Wechsel beendet. Der erkannte Text bleibt erhalten."});
 });
 // Prevent saving mid-utterance; otherwise the last final speech result could be lost.
 for(const formId of ["entry-form","solution-form"]){
  root.getElementById(formId)?.addEventListener("submit",event=>{
   if(active&&active.dialog===event.target.closest("dialog")){
    event.preventDefault();
    event.stopImmediatePropagation();
    active.status.textContent="Bitte Diktat erst mit „Stoppen“ abschließen und danach speichern.";
    active.button.focus();
   }
  },true);
 }
 return {supported:!!Recognizer,start:fieldId=>lookup[fieldId]&&start(lookup[fieldId]),stop,
  isRecording:()=>!!active};
}
