import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFileSync} from "node:fs";
import {chromium} from "playwright";
const source=readFileSync(new URL("../public/ticket-text-editor.js",import.meta.url));
const css=readFileSync(new URL("../public/tickets.css",import.meta.url));
const fixture='import {ticketEditorMarkup,mountTicketEditor,ticketTextHtml,syncTicketEditor} from "/editor.js";document.querySelector("form").innerHTML=ticketEditorMarkup("description","Beschreibung",20000,"Alpha Beta");const root=document.querySelector("[data-ticket-editor]");mountTicketEditor(root);window.sync=()=>syncTicketEditor(root);window.render=()=>ticketTextHtml(root.querySelector("[data-rich-value]").value);';
const server=createServer((req,res)=>{
 const assets={"/editor.js":["text/javascript",source],"/fixture.js":["text/javascript",fixture],"/style.css":["text/css",css]};
 if(assets[req.url]){const [type,data]=assets[req.url];res.writeHead(200,{"content-type":type}).end(data);return;}
 res.writeHead(200,{"content-type":"text/html","content-security-policy":"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'"}).end('<!doctype html><link rel="stylesheet" href="/style.css"><form></form><script type="module" src="/fixture.js"></script>');
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const browser=await chromium.launch();
try{
 const page=await browser.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto("http://127.0.0.1:"+server.address().port);
 const surface=page.locator(".tp-rich-surface");
 await surface.waitFor();assert.equal(await page.locator(".tp-rich-preview,textarea").count(),0);
 await surface.click();
 await page.evaluate(()=>{const n=document.querySelector(".tp-rich-body").firstChild,r=document.createRange();r.setStart(n,0);r.setEnd(n,5);const s=getSelection();s.removeAllRanges();s.addRange(r);});
 await page.locator('[data-rich-command="bold"]').click();
 assert.equal(await surface.locator("b,strong").textContent(),"Alpha");
 await page.locator('[data-rich-command="italic"]').click();
 assert.ok(await surface.locator("i,em").count());
 assert.match(await page.evaluate(()=>window.render()),/<strong>|<em>/);
 await surface.click();await page.keyboard.press("End");
 await page.locator('[data-rich-command="check"]').click();
 assert.equal(await surface.locator('input[type=checkbox]').count(),1);
 await page.keyboard.press("Enter");assert.equal(await surface.locator('input[type=checkbox]').count(),2);
 await page.keyboard.type("Next task");
 await page.keyboard.press("Enter");assert.equal(await surface.locator('input[type=checkbox]').count(),3);
 await page.keyboard.press("Enter");assert.equal(await surface.locator('input[type=checkbox]').count(),2);
 await surface.locator('input[type=checkbox]').first().check();
 assert.equal(await page.evaluate(()=>window.sync()),true);
 const value=await page.locator("[data-rich-value]").inputValue();assert.match(value,/- \[x\]/);assert.match(value,/- \[ \] Next task/);
 assert.equal(errors.length,0,errors.join("\n"));
 console.log("Chromium: direct selected-text formatting, no preview, checkbox creation, Enter continuation, checked state and hidden serialization passed");
}finally{await browser.close();await new Promise(r=>server.close(r));}
