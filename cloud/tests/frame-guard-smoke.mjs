import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const source = readFileSync(new URL("../public/frame-guard.js", import.meta.url), "utf8");
const worker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const rootMarkup = '<html lang="de" hidden><head>';
const guardMarkup = '<script src="./frame-guard.js"></script>';
const guardIndex = html.indexOf(guardMarkup);

assert.ok(html.startsWith("<!doctype html>" + rootMarkup), "Document root must start concealed without depending on CSS or script");
assert.ok(guardIndex > html.indexOf('http-equiv="Content-Security-Policy"'), "Frame guard must follow the active CSP");
assert.ok(guardIndex < html.indexOf('<meta name="viewport"'), "Frame guard must run before application resources and markup");
assert.doesNotMatch(html.slice(0, guardIndex), /<script\b/i, "No executable script may precede the frame guard");
assert.match(worker, /const ASSETS=\[[^\]]*"\.\/frame-guard\.js"/, "Frame guard must remain available to the offline shell");

function runGuard({framed = false, blockedTop = false} = {}) {
  const state = {revealed: false, stopped: false, hidden: true, inert: false, ariaHidden: false, display: null};
  const ownWindow = {};
  const root = {
    hidden: true,
    inert: false,
    removeAttribute(name) {
      if (name === "hidden") {
        state.revealed = true;
        this.hidden = false;
      }
    },
    setAttribute(name, value) {
      if (name === "aria-hidden" && value === "true") state.ariaHidden = true;
    },
    style: {
      setProperty(name, value, priority) {
        if (name === "display") state.display = {value, priority};
      }
    }
  };
  const window = {
    self: ownWindow,
    get top() {
      if (blockedTop) throw new Error("top access denied");
      return framed ? {} : ownWindow;
    },
    stop() {
      state.stopped = true;
    }
  };
  const document = {
    documentElement: root
  };

  vm.runInNewContext(source, {window, document});
  state.hidden = root.hidden;
  state.inert = root.inert;
  return state;
}

assert.deepEqual(runGuard(), {revealed: true, stopped: false, hidden: false, inert: false, ariaHidden: false, display: null});
for (const result of [runGuard({framed: true}), runGuard({blockedTop: true})]) {
  assert.equal(result.revealed, false, "Framed content must never be revealed");
  assert.equal(result.hidden, true, "Framed document root must remain concealed");
  assert.equal(result.stopped, true, "Framed resource loading must stop");
  assert.equal(result.inert, true, "Framed controls must be non-interactive");
  assert.equal(result.ariaHidden, true, "Framed content must be hidden from accessibility interaction");
  assert.deepEqual(result.display, {value: "none", priority: "important"});
}
