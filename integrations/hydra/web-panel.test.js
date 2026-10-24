"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { mountHydraDownloadPanel } = require("./web-panel");

class Element {
  constructor(tag, ownerDocument) {
    this.tagName = tag;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.textContent = "";
  }
  appendChild(x) { this.children.push(x); x.parentNode = this; return x; }
  removeChild(x) { this.children.splice(this.children.indexOf(x), 1); x.parentNode = null; }
  get firstChild() { return this.children[0]; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  setAttribute(k,v) { this.attributes[k] = v; }
  addEventListener(k, fn) { this.listeners[k] = fn; }
}
function root() {
  const doc = { createElement(tag) { return new Element(tag, doc); } };
  return new Element("main", doc);
}
function collect(el, output=[]) {
  output.push(el);
  for (const c of el.children) collect(c, output);
  return output;
}
test("not connected hides actionable downloads", async () => {
  const el = root();
  const ui = mountHydraDownloadPanel(el, {
    client: { async status() { return { connected: false, capabilities: [] }; } },
    gameId: "game:1", gameTitle: "Demo", pollMs: 0
  });
  await ui.ready;
  const texts = collect(el).map(x => x.textContent);
  assert.ok(texts.some(x => x.includes("not connected")));
  assert.equal(collect(el).filter(x => x.tagName === "button").length, 0);
  ui.destroy();
});
test("untrusted catalogue titles are rendered as text, not HTML", async () => {
  const el = root();
  const ui = mountHydraDownloadPanel(el, {
    client: {
      async status() { return { connected: true, capabilities: ["search"] }; },
      async search() { return [{ id: "game:1", title: "<img src=x onerror=alert(1)>", optionCount: 1 }]; },
      async requestInstall() { return { message: "Local confirmation required" }; }
    },
    gameId: "game:1", gameTitle: "Demo", pollMs: 0
  });
  await ui.ready;
  const search = collect(el).find(x => x.tagName === "button" && x.textContent === "Search for Downloads");
  assert.ok(search);
  await search.listeners.click();
  // async click is wrapped by safeRun, permit the event loop to flush.
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(collect(el).some(x => x.textContent.includes("<img src=x")));
  assert.equal(collect(el).filter(x => x.tagName === "img").length, 0);
  ui.destroy();
});
