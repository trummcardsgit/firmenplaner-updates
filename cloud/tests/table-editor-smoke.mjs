import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
import JSZip from "jszip";
import * as docx from "docx";
import {readFileSync} from "node:fs";
import {runTableCommand,TABLE_MAX_ROWS,TABLE_MAX_COLS} from "../public/table-editor.js";
import {createFeatures} from "../public/extended.js";

const ui=new JSDOM(readFileSync(new URL("../public/index.html",import.meta.url),"utf8"));
const menu=ui.window.document.getElementById("tp-table-context-menu");
assert.ok(menu,"Table context menu must be present in the Word fullscreen dialog");
assert.ok(menu.hasAttribute("hidden"),"Table context menu should initially be hidden");
assert.ok(ui.window.document.getElementById("tp-document-dialog").contains(menu),"Menu should be inside the modal top layer");
const options=["row-above","row-below","row-delete","col-left","col-right","col-delete","cell-left","cell-right","cell-clear","cell-delete","table-delete"];
for(const option of options){
 assert.ok(menu.querySelector('[data-table-action="'+option+'"]'),"Missing table menu action "+option);
}

const dom=new JSDOM('<div id="editor"><table><tbody><tr><th>Head A</th><th>Head B</th><th>Head C</th></tr><tr><td>First</td><td>Second</td><td>Third</td></tr></tbody></table><p>Text afterwards</p></div>');
globalThis.window=dom.window;
globalThis.document=dom.window.document;
globalThis.DOMParser=dom.window.DOMParser;
window.docx=docx;
const editor=document.getElementById("editor");
let table=editor.querySelector("table");
const cells=row=>[...row.cells];
const first=table.rows[1].cells[1];

let op=runTableCommand(first,"row-above");
assert.equal(table.rows.length,3);
assert.equal(op.selection.cellIndex,1);
assert.equal(table.rows[1].cells.length,3);
op=runTableCommand(op.selection,"row-below");
assert.equal(table.rows.length,4);
assert.equal(op.selection.cellIndex,1);

op=runTableCommand(table.rows[2].cells[1],"col-left");
assert.equal(table.rows.length,4);
assert.ok([...table.rows].every(row=>row.cells.length===4));
assert.equal(op.selection.cellIndex,1);
op=runTableCommand(op.selection,"col-right");
assert.ok([...table.rows].every(row=>row.cells.length===5));
assert.equal(op.selection.cellIndex,2);
runTableCommand(table.rows[0].cells[1],"col-delete");
assert.ok([...table.rows].every(row=>row.cells.length===4));

op=runTableCommand(table.rows[2].cells[1],"cell-left");
assert.equal(table.rows[2].cells.length,5);
assert.equal(table.rows[1].cells.length,4);
op=runTableCommand(op.selection,"cell-right");
assert.equal(table.rows[2].cells.length,6);
runTableCommand(op.selection,"cell-delete");
assert.equal(table.rows[2].cells.length,5);
const cell=table.rows[2].cells[0];
cell.textContent="Remove me";
runTableCommand(cell,"cell-clear");
assert.equal(cell.textContent,"");
runTableCommand(table.rows[1].cells[0],"row-delete");
assert.equal(table.rows.length,3);

const remaining=table.rows[0].cells[0];
for(let n=0;n<6;n++)runTableCommand(remaining,"col-right");
assert.ok(cells(table.rows[0]).length>=10,"Table must be able to grow past the previous 8-column export limit");
assert.equal(TABLE_MAX_COLS,20);
assert.equal(TABLE_MAX_ROWS,200);

const features=createFeatures({
 db:{},state:{user:{id:"test"},companies:[],entries:[],projects:[],documents:[],attachments:[]},
 esc:x=>String(x),fmt:x=>String(x),notice:()=>{},fail:err=>{throw err},
 refresh:async()=>{},company:()=>"Test"
});
const output=await features.toWord("Table edit test",editor.innerHTML);
const doc=await JSZip.loadAsync(await output.arrayBuffer());
const xml=await doc.file("word/document.xml").async("string");
assert.match(xml,/<w:tbl>/,"Expanded table should be exported");
const wordCols=[...xml.matchAll(/<w:gridCol /g)].length;
assert.ok(wordCols>=10,"Export must contain all columns, not truncate to eight");

const another=document.createElement("table");
another.innerHTML="<tbody><tr><td>Only cell</td></tr></tbody>";
editor.appendChild(another);
op=runTableCommand(another.rows[0].cells[0],"cell-delete");
assert.ok(op.tableRemoved);
assert.ok(!another.isConnected);
assert.ok(table.isConnected,"Deleting another table must not affect first table");
op=runTableCommand(table.rows[0].cells[0],"table-delete");
assert.ok(op.tableRemoved);
assert.equal(editor.querySelectorAll("table").length,0);
assert.match(editor.textContent,/Text afterwards/,"Surrounding document text must survive table deletion");

assert.throws(()=>runTableCommand(null,"col-right"));
console.log("Word table context menu tests passed: add/remove rows, columns and cells; clear cell; whole-table deletion; expanded DOCX export.");
