import assert from "node:assert/strict";
import * as docx from "docx";
import JSZip from "jszip";
import {JSDOM} from "jsdom";
import {readFileSync} from "node:fs";
import {createFeatures} from "../public/extended.js";

const dom=new JSDOM("<!doctype html><html><head></head><body></body></html>",{
 url:"https://trummcardsgit.github.io/firmenplaner-updates/"
});
globalThis.window=dom.window;
globalThis.document=dom.window.document;
globalThis.DOMParser=dom.window.DOMParser;
window.docx=docx;

const features=createFeatures({
 db:{},
 state:{user:{id:"test-user"},companies:[],entries:[],projects:[],documents:[],attachments:[]},
 esc:x=>String(x),
 fmt:x=>String(x),
 notice:()=>{},
 fail:err=>{throw err;},
 refresh:async()=>{},
 company:()=> "Musterfirma"
});

// Full-viewport Word-like workspace must exist in the published HTML.
const markup=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const styles=readFileSync(new URL("../public/styles.css",import.meta.url),"utf8");
const editorView=new JSDOM(markup).window.document;
const editorDialog=editorView.getElementById("tp-document-dialog");
assert.ok(editorDialog,"Full-page editor dialog must exist");
assert.ok(editorDialog.classList.contains("tp-document-fullscreen"),"Editor must use the fullscreen workspace");
for(const tab of ["file","home","insert","layout","view"]){
 assert.ok(editorDialog.querySelector('[data-ribbon-tab="'+tab+'"]'),"Missing ribbon tab: "+tab);
 assert.ok(editorDialog.querySelector('[data-ribbon-panel="'+tab+'"]'),"Missing ribbon content: "+tab);
}
for(const selector of ["#tp-word-close","#tp-document-title","#tp-document-save","#tp-document-export",
 "#tp-word-paper","#tp-document-body","#tp-word-count","#tp-word-zoom","#tp-word-zoom-value",
 "[data-format='table']","[data-font-family]","[data-font-size]","[data-color='fore']","[data-color='highlight']"]){
 assert.ok(editorDialog.querySelector(selector),"Missing editor functionality: "+selector);
}
assert.match(styles,/dialog\.tp-document-fullscreen\[open\]\s*\{[^}]*height:100dvh/s,
 "Opened Word workspace must occupy full viewport");
assert.match(styles,/#tp-document-dialog #tp-document-body/s,
 "Editor surface must be styled as a document sheet");

// A project can open a read-only Word preview without starting the editor.
const previewDialog=editorView.getElementById("tp-doc-preview-dialog");
assert.ok(previewDialog,"Project Word preview dialog should exist");
assert.ok(editorView.getElementById("tp-project-attachments"),"Project attachments must exist");
for(const selector of ["#tp-preview-title","#tp-preview-content","#tp-preview-download",
 "#tp-preview-close","#tp-preview-close-top"]){
 assert.ok(previewDialog.querySelector(selector),"Read-only preview missing "+selector);
}
assert.equal(previewDialog.querySelectorAll("[contenteditable]").length,0,
 "Read-only preview must never expose an editable content surface");
assert.doesNotMatch(previewDialog.outerHTML,/\bdata-format=|\bid="tp-document-save"/i,
 "Read-only preview must not include editing tools");
assert.match(styles,/dialog\.tp-doc-preview-dialog\[open\]/,
 "Project preview must be styled as a document viewer");

const previewState={
 user:{id:"test-user"},companies:[],entries:[],projects:[],solutions:[],
 documents:[{id:"doc-test",project_id:"project-test",entry_id:null,title:"Umstellung"}],
 attachments:[
  {id:"file-docx",project_id:"project-test",entry_id:null,file_name:"Plan.docx",file_size:1500},
  {id:"file-pdf",project_id:"project-test",entry_id:null,file_name:"Handbuch.pdf",file_size:2500}
 ]
};
const testFeatures=createFeatures({
 db:{},state:previewState,esc:x=>String(x),fmt:x=>String(x),
 notice:()=>{},fail:e=>{throw e},refresh:async()=>{},company:()=> "Musterfirma"
});
const previewButtons=testFeatures.attached("project","project-test");
assert.match(previewButtons,/data-doc-preview="doc-test"/,
 "TrummPlaner Word documents must have a preview button in projects");
assert.match(previewButtons,/data-file-preview="file-docx"/,
 "Uploaded DOCX attachments must have a preview button in projects");
assert.doesNotMatch(previewButtons,/data-file-preview="file-pdf"/,
 "Unsupported PDFs should not advertise Word preview");

const sample=[
 '<h1 style="text-align:center">Test-Dokument</h1>',
 '<p><span style="color:#ff0000;font-size:14pt;font-family:Arial">Roter Text</span> und <span style="background-color:#fff1a8">markiert</span>.</p>',
 '<table><tbody><tr><th style="background-color:#e8eff9">Titel</th><th>Wert</th></tr>',
 '<tr><td><span style="color:#00aa00">Status</span></td><td><strong>Erledigt</strong></td></tr></tbody></table>',
 '<ul><li>Erster Punkt</li></ul><ol><li>Zweiter Punkt</li></ol>',
 '<script>alert("xss")</script><img src="x" onerror="alert(1)">'
].join("\n");

const cleaned=features.cleanHtml(sample);
assert.match(cleaned,/<table>/i,"Table should remain editable");
assert.match(cleaned,/<th/i,"Table headers should remain editable");
assert.match(cleaned,/color:\s*(?:#FF0000|rgb\(255,\s*0,\s*0\))/i,"Text color should survive sanitization");
assert.match(cleaned,/font-size:\s*14pt/i,"Font size should survive sanitization");
assert.match(cleaned,/background-color:\s*(?:#FFF1A8|rgb\(255,\s*241,\s*168\))/i,"Highlight should survive sanitization");
assert.doesNotMatch(cleaned,/<script|<img|onerror/ig,"Dangerous HTML must be removed");

const blob=await features.toWord("Test-Dokument",cleaned);
const zipped=await JSZip.loadAsync(await blob.arrayBuffer());
const xml=await zipped.file("word/document.xml")?.async("string");
assert.ok(xml,"A real DOCX file must contain word/document.xml");
assert.match(xml,/<w:tbl>/,"Tables must be exported into DOCX");
assert.match(xml,/w:color[^>]+w:val="FF0000"/i,"Word should preserve red text");
assert.match(xml,/w:sz[^>]+w:val="28"/i,"Word should preserve 14 point text");
assert.match(xml,/<w:shd[^>]+w:fill="FFF1A8"/i,"Word should preserve text highlight");
assert.match(xml,/<w:jc[^>]+w:val="center"/i,"Paragraph alignment should be preserved");
assert.match(xml,/<w:numPr>/i,"List numbering should be preserved");
console.log("Word-Editor smoke test OK: safe HTML, tables, colors, font size, highlight, alignment, lists and DOCX export.");
