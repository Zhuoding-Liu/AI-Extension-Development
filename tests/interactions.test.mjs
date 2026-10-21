import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const content = await readFile(new URL("../content-script.js", import.meta.url), "utf8");
const worker = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");

test("a saved button carrying both a section and source mapping stays in the AI document", () => {
  const script = content.match(/bridge\.textContent = `([\s\S]*?)`;\s*parsed\.head\.appendChild\(bridge\)/)[1];
  const listeners = new Map();
  const messages = [];
  let scrolled = false;
  const section = { closest() {}, scrollIntoView() { scrolled = true; } };
  class Button {
    closest() { return this; }
    getAttribute(name) { return { "data-pageflow-target": "overview", "data-pageflow-control": "c1" }[name] || null; }
  }
  const context = {
    Element: Button,
    parent: { postMessage(message) { messages.push(message.type); } },
    document: {
      addEventListener(type, listener) { listeners.set(type, listener); },
      getElementById(id) { return id === "overview" ? section : null; }
    },
    window: { addEventListener() {} },
    matchMedia: () => ({ matches: true })
  };
  vm.createContext(context);
  vm.runInContext(script.replace("${JSON.stringify(nonce)}", '"test-token"'), context);
  listeners.get("click")({ target: new Button(), preventDefault() {} });
  assert.equal(scrolled, true);
  assert.equal(messages.includes("PAGEFLOW_CUSTOM_CONTROL"), false);
});

test("source actions request a new original tab without activating the source control", async () => {
  const requests = [];
  let clicked = false;
  const targets = new Map([
    ["c1", { isConnected: true, matches: () => true, href: "https://example.test/account", click() { clicked = true; } }],
    ["c2", { isConnected: true, matches: () => false, id: "login", click() { clicked = true; } }],
    ["c3", { isConnected: true, matches: () => true, href: "javascript:alert(1)" }]
  ]);
  const status = {};
  const context = {
    targets, status, URL,
    location: { href: "https://example.test/article?view=full" },
    chrome: { runtime: { async sendMessage(request) { requests.push(request); return { ok: true }; } } }
  };
  vm.createContext(context);
  vm.runInContext(content.slice(content.indexOf("async function openOriginalControl"), content.indexOf("function showOriginalPage")), context);
  await context.openOriginalControl("c1", targets, status);
  await context.openOriginalControl("c2", targets, status);
  assert.equal(requests[0].type, "PAGEFLOW_OPEN_ORIGINAL_TAB");
  assert.equal(requests[0].url, "https://example.test/account");
  assert.equal(requests[1].url, context.location.href);
  assert.equal(requests[1].focusId, "login");
  assert.equal(clicked, false);
  await context.openOriginalControl("c3", targets, status);
  await context.openOriginalControl("missing", targets, status);
  assert.equal(requests.length, 2);
  assert.match(status.textContent, /no longer available/);
});

function workerHarness(failStorage = false) {
  let listener;
  const entries = {};
  const events = [];
  const context = {
    URL,
    chrome: {
      runtime: {
        onInstalled: { addListener() {} },
        onMessage: { addListener(fn) { listener = fn; } }
      },
      storage: { session: {
        async get(key) { return { [key]: entries[key] }; },
        async set(values) {
          if (failStorage) throw new Error("Storage unavailable");
          Object.assign(entries, values);
          events.push("marked");
        },
        async remove(key) { delete entries[key]; }
      } },
      tabs: {
        async create(options) { events.push(["created", options]); return { id: 21 }; },
        async update(tabId, options) { events.push(["navigated", tabId, options]); },
        async remove(tabId) { events.push(["removed", tabId]); }
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(worker, context);
  return {
    events,
    request(message, sender = { tab: { id: 7 }, frameId: 0 }) {
      return new Promise((resolve) => listener(message, sender, resolve));
    }
  };
}

test("the original tab is marked before navigation and cannot replace the saved AI tab", async () => {
  const harness = workerHarness();
  const opened = await harness.request({ type: "PAGEFLOW_OPEN_ORIGINAL_TAB", url: "https://example.test/article", focusId: "login" });
  assert.equal(opened.ok, true);
  assert.equal(harness.events[0][1].url, "about:blank");
  assert.equal(harness.events[0][1].active, false);
  assert.equal(harness.events[0][1].openerTabId, 7);
  assert.equal(harness.events[1], "marked");
  assert.equal(harness.events[2][0], "navigated");
  assert.equal(harness.events[2][1], 21);
  assert.equal(harness.events[2][2].url, "https://example.test/article");
  const source = await harness.request({ type: "PAGEFLOW_ORIGINAL_TAB_STATE" });
  assert.equal(source.original, false);
  const original = await harness.request({ type: "PAGEFLOW_ORIGINAL_TAB_STATE" }, { tab: { id: 21 }, frameId: 0 });
  assert.equal(original.original, true);
  assert.equal(original.focusId, "login");
  const consumed = await harness.request({ type: "PAGEFLOW_ORIGINAL_TAB_STATE" }, { tab: { id: 21 }, frameId: 0 });
  assert.equal(consumed.original, false, "a later Keep/Return choice must not be overridden");
});

test("invalid action destinations never open tabs, and failed markers clean up blank tabs", async () => {
  const harness = workerHarness();
  for (const url of ["javascript:alert(1)", "file:///private/tmp/test", "https://name:secret@example.test", "not a URL"]) {
    assert.equal((await harness.request({ type: "PAGEFLOW_OPEN_ORIGINAL_TAB", url })).ok, false);
  }
  assert.equal((await harness.request({ type: "PAGEFLOW_OPEN_ORIGINAL_TAB", url: "https://example.test" }, {})).ok, false);
  assert.equal(harness.events.length, 0);
  const failed = workerHarness(true);
  assert.equal((await failed.request({ type: "PAGEFLOW_OPEN_ORIGINAL_TAB", url: "https://example.test" })).ok, false);
  assert.deepEqual(failed.events.at(-1), ["removed", 21]);
  assert.equal(failed.events.some((event) => event[0] === "navigated"), false);
});

test("opening an original tab uses its tab marker without changing saved AI settings", async () => {
  let originalVisible = false;
  let applied;
  const saved = { viewMode: "rebuild", rebuildLayout: "custom", generatedHtml: "<html>Saved design</html>" };
  const context = {
    STORAGE_KEY: "settings",
    DEFAULT_STATE: {},
    siteKey: () => "https://example.test",
    setOriginalPageVisible(value) { originalVisible = value; },
    applyState(state) { assert.equal(originalVisible, true); applied = state; },
    chrome: {
      storage: { local: { get: async () => ({ settings: { "https://example.test": saved } }) } },
      runtime: { sendMessage: async () => ({ ok: true, original: true }) }
    }
  };
  vm.createContext(context);
  vm.runInContext(content.slice(content.indexOf("async function loadState"), content.indexOf("const initialization =")), context);
  await context.loadState();
  assert.equal(applied.viewMode, "rebuild");
  assert.equal(applied.generatedHtml, saved.generatedHtml);
});

test("Keep this view clears a stale original-page preference before rendering", async () => {
  const customRenderer = content.slice(content.indexOf("function renderCustomPageView"), content.indexOf("function renderRebuildView"));
  const handler = customRenderer.slice(customRenderer.indexOf('keep.addEventListener("click"'), customRenderer.indexOf("actions.appendChild(keep)"));
  let keep;
  let originalVisible = true;
  const events = [];
  const context = {
    keep: { addEventListener(_type, listener) { keep = listener; } },
    currentState: {}, pendingRebuildState: { viewMode: "rebuild", rebuildLayout: "custom" },
    state: {}, aiStateHistory: [], status: {},
    sanitizeState: (state) => state,
    async saveState() { events.push("saved"); },
    setOriginalPageVisible(value) { originalVisible = value; },
    applyState() { assert.equal(originalVisible, false); events.push("rendered"); }
  };
  vm.createContext(context);
  vm.runInContext(handler, context);
  await keep();
  assert.deepEqual(events, ["saved", "rendered"]);
});
