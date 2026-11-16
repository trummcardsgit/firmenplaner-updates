import assert from "node:assert/strict";
import * as docx from "docx";
import JSZip from "jszip";
import {JSDOM} from "jsdom";
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
assert.match(cleaned,/color:\s*#FF0000/i,"Text color should survive sanitization");
assert.match(cleaned,/font-size:\s*14pt/i,"Font size should survive sanitization");
assert.match(cleaned,/background-color:\s*#FFF1A8/i,"Highlight should survive sanitization");
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
