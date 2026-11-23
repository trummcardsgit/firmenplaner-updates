import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
import {readFileSync} from "node:fs";
import {installDictation} from "../public/dictation.js";

const html=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const dom=new JSDOM(html,{url:"https://trummcardsgit.github.io/firmenplaner-updates/"});
const doc=dom.window.document;
class MockRecognizer{
 static instances=[];
 constructor(){MockRecognizer.instances.push(this);this.stopped=false;this.aborted=false;}
 start(){this.onstart?.();}
 stop(){this.stopped=true;this.onend?.();}
 abort(){this.aborted=true;this.onend?.();}
 emit(items){this.onresult?.({results:items.map(x=>({0:{transcript:x.text},isFinal:x.final}))});}
 fail(error){this.onerror?.({error});this.onend?.();}
}
dom.window.SpeechRecognition=MockRecognizer;
const pending=[];
dom.window.setTimeout=(callback)=>{pending.push(callback);return pending.length;};
dom.window.clearTimeout=()=>{};
const controller=installDictation(doc,dom.window);
assert.ok(controller.supported);
const entry=doc.getElementById("entry-description");
const solution=doc.getElementById("solution-text");
const entryButton=doc.querySelector('[data-dictate="entry-description"]');
const solutionButton=doc.querySelector('[data-dictate="solution-text"]');
const entryDialog=doc.getElementById("editor");
const solutionDialog=doc.getElementById("solution-dialog");
assert.ok(entryButton&&solutionButton);
entryDialog.setAttribute("open","");
solutionDialog.setAttribute("open","");
entry.value="Drucker:";
let inputCount=0;
entry.addEventListener("input",()=>inputCount++);
entryButton.click();
assert.equal(controller.isRecording(),true);
assert.equal(entryButton.getAttribute("aria-pressed"),"true");
const first=MockRecognizer.instances.at(-1);
assert.equal(first.lang,"de-AT");
assert.equal(first.continuous,true);
assert.equal(first.interimResults,true);
first.emit([{text:"das Gerät",final:false}]);
assert.equal(entry.value,"Drucker:","Interim results must not overwrite saved text");
assert.match(doc.querySelector('[data-dictation-interim="entry-description"]').textContent,/das Gerät/);
first.emit([{text:"das Gerät wird nicht erkannt",final:true}]);
assert.equal(entry.value,"Drucker: das Gerät wird nicht erkannt");
assert.equal(inputCount,1);
first.emit([{text:"das Gerät wird nicht erkannt",final:true}]);
assert.equal(inputCount,1,"Repeated final results must not duplicate text");

// Unexpected browser ending after a pause should restart without losing content.
first.onend();
assert.match(doc.querySelector('[data-dictation-status="entry-description"]').textContent,/wieder aktiviert/);
pending.shift()();
const second=MockRecognizer.instances.at(-1);
assert.notEqual(first,second);
second.emit([{text:"Neuer Absatz",final:true}]);
second.emit([{text:"Papier nachgefüllt",final:true}]);
assert.match(entry.value,/\n\nPapier nachgefüllt/);
assert.equal(inputCount,3);
entryButton.click();
assert.equal(controller.isRecording(),false);
assert.equal(second.stopped,true);
assert.match(doc.querySelector('[data-dictation-status="entry-description"]').textContent,/Diktat/);

// Switching from a description to a solution ends the previous recognition.
entryButton.click();
const third=MockRecognizer.instances.at(-1);
doc.querySelector('[data-dictation-lang="solution-text"]').value="de-DE";
solutionButton.click();
assert.equal(third.aborted,true);
const fourth=MockRecognizer.instances.at(-1);
assert.equal(fourth.lang,"de-DE");
assert.equal(controller.isRecording(),true);
fourth.emit([{text:"Treiber neu installiert",final:true}]);
assert.equal(solution.value,"Treiber neu installiert");

// A submit during an active recording is blocked, because final audio may arrive late.
const submit=new dom.window.Event("submit",{bubbles:true,cancelable:true});
doc.getElementById("solution-form").dispatchEvent(submit);
assert.equal(submit.defaultPrevented,true);
assert.match(doc.querySelector('[data-dictation-status="solution-text"]').textContent,/erst mit/);

solutionDialog.dispatchEvent(new dom.window.Event("close"));
assert.equal(fourth.aborted,true);
assert.equal(controller.isRecording(),false);
fourth.emit([{text:"Dieser Text darf nicht erscheinen",final:true}]);
assert.equal(solution.value,"Treiber neu installiert");

// Browser permission failure must be visible and leave the field editable.
entryButton.click();
const fifth=MockRecognizer.instances.at(-1);
fifth.fail("not-allowed");
assert.equal(controller.isRecording(),false);
assert.match(doc.querySelector('[data-dictation-status="entry-description"]').textContent,/Mikrofonzugriff verweigert/);
assert.equal(entryButton.getAttribute("aria-pressed"),"false");

// In an unsupported browser show a usable fallback (mobile keyboard dictation).
const other=new JSDOM(html,{url:"https://example.com"});
const fallback=installDictation(other.window.document,other.window);
assert.equal(fallback.supported,false);
assert.ok(other.window.document.querySelector('[data-dictate="entry-description"]').disabled);
assert.match(other.window.document.querySelector('[data-dictation-status="entry-description"]').textContent,/Mikrofontaste/);
console.log("Dictation tests passed: de-AT/de-DE, interim/final text, no duplicates, pause recovery, stop, submit safety, permission errors and fallback.");
