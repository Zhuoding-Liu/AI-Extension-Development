import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const contentSource = await readFile(new URL("../content-script.js", import.meta.url), "utf8");
const popupSource = await readFile(new URL("../popup.js", import.meta.url), "utf8");
const popupHtmlSource = await readFile(new URL("../popup.html", import.meta.url), "utf8");
const workerSource = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");
const optionsSource = await readFile(new URL("../options.js", import.meta.url), "utf8");

function sanitize(input) {
  const prefix = contentSource.slice(0, contentSource.indexOf("function siteKey"));
  const context = {
    input,
    result: null,
    Set,
    Object,
    Number,
    String,
    Boolean,
    Math,
    cleanContextText(value, maxLength = 180) {
      return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
    }
  };
  vm.createContext(context);
  vm.runInContext(`${prefix}; result = sanitizeState(input);`, context);
  return structuredClone(context.result);
}

function neutralizeMarkup(input) {
  const prefix = contentSource.slice(0, contentSource.indexOf("function sanitizeGeneratedMarkup"));
  const context = { input, result: null, Set, Object, Number, String, Math };
  vm.createContext(context);
  vm.runInContext(`${prefix}; result = neutralizeGeneratedMarkup(input);`, context);
  return context.result;
}

test("strict state validation rejects coercion and invalid ranges", () => {
  const result = sanitize({
    hideImages: "false",
    readingWidth: 1,
    layoutPreset: "freeform",
    customBackground: "javascript:alert(1)",
    customText: "#abcdef"
  });
  assert.equal(result.hideImages, false);
  assert.equal(result.readingWidth, 480);
  assert.equal(result.layoutPreset, "original");
  assert.equal(result.customBackground, "");
  assert.equal(result.customText, "");
});

test("trusted feature content is sanitized and capped", () => {
  const result = sanitize({
    viewMode: "rebuild",
    rebuildLayout: "magazine",
    contentSummary: true,
    summaryText: "  A safe summary.  ",
    glossary: true,
    glossaryItems: [{ term: "API", definition: "Application programming interface" }],
    paragraphTranslation: true,
    paragraphTranslations: [
      { paragraphId: "p2", text: "Translated text" },
      { paragraphId: "selector:#secret", text: "Rejected" }
    ]
  });
  assert.equal(result.viewMode, "rebuild");
  assert.equal(result.rebuildLayout, "magazine");
  assert.equal(result.summaryText, "A safe summary.");
  assert.deepEqual(result.glossaryItems, [{ term: "API", definition: "Application programming interface" }]);
  assert.deepEqual(result.paragraphTranslations, [{ paragraphId: "p2", text: "Translated text" }]);
});

test("generated page scope accepts only a path without query or fragment", () => {
  assert.equal(sanitize({ generatedPagePath: "/articles/example" }).generatedPagePath, "/articles/example");
  assert.equal(sanitize({ generatedPagePath: "/articles/example?token=secret" }).generatedPagePath, "");
});

test("preset CSS sanitizer still rejects unsafe and inaccessible declarations", () => {
  const result = sanitize({
    generatedHtml: "<main><h1>Safe document</h1><p>Readable content for the generated view.</p></main>",
    generatedCss: `
      body { background: url(https://example.test/track); }
      .hero { display: grid; grid-template-columns: 2fr 1fr; background: var(--pf-surface); position: fixed; }
      .copy { font-size: 10px; line-height: 1; color: #bbbbbb; padding: 2rem; }
      .safe { font-size: 18px; line-height: 1.6; color: var(--pf-text); }
      .unsafe-surface { background: var(--pf-accent); }
    `
  });

  assert.match(result.generatedCss, /\.custom-document \.hero/);
  assert.match(result.generatedCss, /grid-template-columns:2fr 1fr/);
  assert.match(result.generatedCss, /background:var\(--pf-surface\)/);
  assert.match(result.generatedCss, /font-size:18px/);
  assert.doesNotMatch(result.generatedCss, /url\(|position:fixed|font-size:10px|line-height:1(?:[;}])|#bbbbbb|unsafe-surface|body/);
  assert.equal(sanitize(result).generatedCss, result.generatedCss, "CSS sanitation must be idempotent across validation and preview");
});

test("AI Custom HTML keeps full-page CSS without the preset declaration allowlist", () => {
  const css = "@media (max-width: 800px) { body { background: linear-gradient(#fff, #eee); } } .hero { position: sticky; top: 0; }";
  const html = "<!doctype html><html><head><title>New design</title></head><body><main><h1>New page</h1></main></body></html>";
  const result = sanitize({ viewMode: "rebuild", rebuildLayout: "custom", generatedHtml: html, generatedCss: css });
  assert.equal(result.generatedHtml, html);
  assert.equal(result.generatedCss, css);
  assert.equal(sanitize(result).generatedCss, css);
  assert.match(workerSource, /complete, prompt-specific standalone HTML document/);
});

test("custom HTML navigation repairs mismatched sidebar links and button targets", () => {
  const source = contentSource.slice(contentSource.indexOf("const CUSTOM_FRAGMENT_ID"), contentSource.indexOf("function prepareSandboxedPage"));
  const makeNode = (tagName, textContent, id = "", attributes = {}, inNavigation = false) => ({
    tagName,
    textContent,
    id,
    attributes: { ...attributes },
    getAttribute(name) { return this.attributes[name] ?? null; },
    hasAttribute(name) { return Object.hasOwn(this.attributes, name); },
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    closest() { return inNavigation ? {} : null; },
    querySelector() { return this.firstHeading || null; }
  });
  const introduction = makeNode("H2", "Introduction", "introduction");
  const pricing = makeNode("H2", "Pricing", "pricing");
  const faqHeading = makeNode("H2", "Frequently asked questions");
  const faqSection = makeNode("SECTION", "", "faq");
  faqSection.firstHeading = faqHeading;
  const wrongLink = makeNode("A", "2. Pricing", "", { href: "#introduction", "data-pageflow-control": "c1" }, true);
  const missingLink = makeNode("A", "Introduction", "", { href: "#missing" }, true);
  const fragmentMatch = makeNode("A", "Read more", "", { href: "#frequently-asked-questions" }, true);
  const sidebarButton = makeNode("BUTTON", "Pricing", "", {}, true);
  const validLink = makeNode("A", "FAQ", "", { href: "#faq" }, true);
  const unknownLink = makeNode("A", "Unknown section", "", { href: "#nowhere" }, true);
  const all = [introduction, pricing, faqHeading, faqSection, wrongLink, missingLink, fragmentMatch, sidebarButton, validLink, unknownLink];
  const headings = [introduction, pricing, faqHeading];
  const links = [wrongLink, missingLink, fragmentMatch, sidebarButton, validLink, unknownLink];
  const parsed = {
    body: { querySelectorAll(selector) { return selector.startsWith("h1") ? headings : links; } },
    querySelectorAll() { return all.filter((node) => node.id); }
  };
  const context = { parsed, result: null, Map, Set, Array, String };
  vm.createContext(context);
  vm.runInContext(`${source}; repairCustomPageNavigation(parsed);`, context);
  assert.equal(wrongLink.getAttribute("href"), "#pricing");
  assert.equal(wrongLink.getAttribute("data-pageflow-control"), null);
  assert.equal(missingLink.getAttribute("href"), "#introduction");
  assert.equal(fragmentMatch.getAttribute("href"), `#${faqHeading.id}`);
  assert.equal(sidebarButton.getAttribute("data-pageflow-target"), "pricing");
  assert.equal(validLink.getAttribute("href"), "#faq");
  assert.equal(unknownLink.getAttribute("href"), null);
  assert.match(faqHeading.id, /^pageflow-section-\d+$/);
});

test("custom HTML sandbox bridge scrolls to a sidebar section inside the iframe", () => {
  const bridge = contentSource.match(/bridge\.textContent = `([\s\S]*?)`;\s*parsed\.head\.appendChild\(bridge\)/)?.[1];
  assert.ok(bridge, "sandbox bridge script must exist");
  const listeners = new Map();
  const target = {
    scrolled: false,
    focused: false,
    closest() { return null; },
    scrollIntoView(options) { this.scrolled = options.block === "start"; },
    hasAttribute() { return false; },
    setAttribute() {},
    focus() { this.focused = true; }
  };
  class ClickElement {
    closest(selector) { return selector === "[data-pageflow-control]" ? null : this; }
    getAttribute(name) { return name === "href" ? "#pricing" : null; }
  }
  const context = {
    Element: ClickElement,
    document: {
      addEventListener(name, listener) { listeners.set(name, listener); },
      getElementById(id) { return id === "pricing" ? target : null; },
      documentElement: { scrollHeight: 1000 }
    },
    parent: { postMessage() {} },
    window: { addEventListener() {} },
    matchMedia: () => ({ matches: true }),
    nonce: "test-token"
  };
  vm.createContext(context);
  vm.runInContext(bridge.replace("${JSON.stringify(nonce)}", JSON.stringify("test-token")), context);
  let prevented = false;
  listeners.get("click")({ target: new ClickElement(), preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(target.scrolled, true);
  assert.equal(target.focused, true);
});

test("legacy fragment sanitizer neutralizes active resources before DOM parsing", () => {
  const result = neutralizeMarkup(`
    <style>@import "https://tracker.test/style.css";</style>
    <iframe src="https://tracker.test/frame"></iframe>
    <main onclick="steal()"><img src="https://tracker.test/pixel" data-pageflow-image="img1"><a href="https://tracker.test">Safe label</a><button data-pageflow-control="c1" onclick="steal()">Open details</button></main>
  `);

  assert.doesNotMatch(result, /https?:|<style|<iframe|onclick=|\ssrc=|\shref=/i);
  assert.match(result, /data-pageflow-image="img1"/);
  assert.match(result, /Safe label/);
  assert.match(result, /<button data-pageflow-control="c1">Open details<\/button>/);
});

test("popup and content script default schemas remain identical", () => {
  const contentContext = { schema: "" };
  vm.createContext(contentContext);
  vm.runInContext(
    contentSource.slice(0, contentSource.indexOf("function clamp")) + "; schema = JSON.stringify(DEFAULT_STATE);",
    contentContext
  );

  const popupContext = { schema: "" };
  vm.createContext(popupContext);
  vm.runInContext(
    popupSource.slice(0, popupSource.indexOf("let activeTabId")) + "; schema = JSON.stringify(DEFAULT_STATE);",
    popupContext
  );

  assert.equal(popupContext.schema, contentContext.schema);
});

test("the popup keeps exactly the existing three modes", () => {
  const modes = Array.from(popupHtmlSource.matchAll(/data-ai-mode="([^"]+)"/g), (match) => match[1]);
  assert.deepEqual(modes, ["adapt", "rebuild", "custom"]);
});

test("every trusted registry feature has a boolean state flag and AI schema entry", () => {
  const context = { result: null };
  vm.createContext(context);
  vm.runInContext(
    contentSource.slice(0, contentSource.indexOf("function clamp")) +
      "; result = { features: Object.keys(FEATURE_REGISTRY), state: DEFAULT_STATE };",
    context
  );
  const result = structuredClone(context.result);
  assert.equal(result.features.length, 15);
  result.features.forEach((feature) => {
    assert.equal(typeof result.state[feature], "boolean", feature);
    assert.match(workerSource, new RegExp(`\\b${feature}\\b`));
  });
});

test("Claude adapter prepares custom mode and page context without temperature", async () => {
  let listener;
  const context = {
    console,
    JSON,
    String,
    Array,
    Error,
    chrome: {
      storage: {
        local: {
          get: async () => ({
            pageFlowAiConfig: {
              provider: "anthropic",
              endpoint: "https://api.anthropic.com/v1/messages",
              model: "claude-test",
              apiKey: "test-only"
            }
          }),
          set: async () => {}
        }
      },
      runtime: {
        onInstalled: { addListener() {} },
        onMessage: { addListener(fn) { listener = fn; } }
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(workerSource, context);

  const response = await new Promise((resolve) => {
    listener({
      type: "PAGEFLOW_AI_PREPARE",
      prompt: "Create a unique editorial page",
      requestedMode: "custom",
      currentState: {},
      pageContext: {
        paragraphs: [{ id: "p1", text: "DUPLICATE_PARAGRAPH_SHOULD_BE_REMOVED" }],
        visibleTextExcerpt: "DUPLICATE_EXCERPT_SHOULD_BE_REMOVED",
        contentModel: {
          title: "Introduction",
          groups: [{ heading: "Overview", blocks: [{ type: "paragraph", text: "Introduction content" }] }]
        }
      }
    }, null, resolve);
  });

  assert.equal(response.ok, true);
  assert.equal(response.configured, true);
  assert.equal(response.requestBody.max_tokens, 8000);
  assert.equal(response.timeoutMs, 180000);
  assert.equal(response.requestBody.temperature, undefined);
  assert.match(response.requestBody.system, /Return only one complete HTML document/);
  assert.match(response.requestBody.system, /Do not return JSON/);
  assert.match(response.requestBody.messages[0].content[0].text, /Requested mode: custom/);
  assert.match(response.requestBody.messages[0].content[0].text, /Introduction/);
  assert.doesNotMatch(response.requestBody.messages[0].content[0].text, /DUPLICATE_/);

  let parsed;
  listener({
    type: "PAGEFLOW_AI_PARSE",
    provider: "anthropic", requestedMode: "custom",
    status: 200,
    rawText: JSON.stringify({ content: [{ type: "text", text: JSON.stringify({
      summary: "A rebuilt reading page", settings: {
        viewMode: "rebuild", rebuildLayout: "custom",
        generatedHtml: "<!doctype html><html><head></head><body><main>Legacy page</main></body></html>"
      }
    }) }] })
  }, null, (value) => { parsed = value; });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.plan.settings.rebuildLayout, "custom");

  const longPrompt = `Keep every requested requirement: ${"accessible navigation and readable content; ".repeat(90)}final instruction`;
  const longResponse = await new Promise((resolve) => {
    listener({
      type: "PAGEFLOW_AI_PREPARE", prompt: longPrompt, requestedMode: "custom",
      currentState: {}, pageContext: { contentModel: { title: "Article", groups: [] } }
    }, null, resolve);
  });
  assert.equal(longResponse.ok, true);
  assert.match(longResponse.requestBody.messages[0].content[0].text, /final instruction/);
  const tooLongResponse = await new Promise((resolve) => {
    listener({
      type: "PAGEFLOW_AI_PREPARE", prompt: "x".repeat(8001), requestedMode: "custom",
      currentState: {}, pageContext: {}
    }, null, resolve);
  });
  assert.equal(tooLongResponse.ok, false);
  assert.match(tooLongResponse.error, /8,000 characters/);
});

test("AI Custom HTML continues a truncated response before accepting the complete page", () => {
  let listener;
  const context = {
    chrome: { runtime: { onInstalled: { addListener() {} }, onMessage: { addListener(fn) { listener = fn; } } } }
  };
  vm.createContext(context);
  vm.runInContext(workerSource, context);
  const beginning = "<!doctype html><html><head><title>Long page</title></head><body><main><p>First paragraph with enough overlap text. ";
  const ending = "First paragraph with enough overlap text. Second paragraph.</p></main></body></html>";
  let result;
  listener({
    type: "PAGEFLOW_AI_PARSE", provider: "anthropic", requestedMode: "custom", status: 200,
    rawText: JSON.stringify({ stop_reason: "max_tokens", content: [{ type: "text", text: beginning }] })
  }, null, (value) => { result = value; });
  assert.equal(result.ok, true);
  assert.equal(result.continuationText, beginning);
  assert.equal(result.plan, undefined);

  listener({
    type: "PAGEFLOW_AI_PARSE", provider: "anthropic", requestedMode: "custom", status: 200,
    previousHtml: result.continuationText,
    rawText: JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: ending }] })
  }, null, (value) => { result = value; });
  assert.equal(result.ok, true);
  assert.equal(result.plan.settings.generatedHtml,
    beginning + "Second paragraph.</p></main></body></html>");
});

test("OpenAI-compatible Custom HTML can continue a length-limited response", () => {
  let listener;
  const context = {
    chrome: { runtime: { onInstalled: { addListener() {} }, onMessage: { addListener(fn) { listener = fn; } } } }
  };
  vm.createContext(context);
  vm.runInContext(workerSource, context);
  let result;
  listener({
    type: "PAGEFLOW_AI_PARSE", provider: "openai", requestedMode: "custom", status: 200,
    rawText: JSON.stringify({ choices: [{ finish_reason: "length", message: {
      content: "<!doctype html><html><head></head><body><main>Start"
    } }] })
  }, null, (value) => { result = value; });
  assert.equal(result.ok, true);
  assert.match(result.continuationText, /<main>Start$/);
  listener({
    type: "PAGEFLOW_AI_PARSE", provider: "openai", requestedMode: "custom", status: 200,
    previousHtml: result.continuationText,
    rawText: JSON.stringify({ choices: [{ finish_reason: "stop", message: {
      content: " and finish</main></body></html>"
    } }] })
  }, null, (value) => { result = value; });
  assert.equal(result.ok, true);
  assert.match(result.plan.settings.generatedHtml, /Start and finish<\/main><\/body><\/html>$/);
});

test("a model that exhausts its output budget without HTML gets a specific error", () => {
  let listener;
  const context = {
    chrome: { runtime: { onInstalled: { addListener() {} }, onMessage: { addListener(fn) { listener = fn; } } } }
  };
  vm.createContext(context);
  vm.runInContext(workerSource, context);
  let result;
  listener({
    type: "PAGEFLOW_AI_PARSE", provider: "anthropic", requestedMode: "custom", status: 200,
    rawText: JSON.stringify({ stop_reason: "max_tokens", content: [] })
  }, null, (value) => { result = value; });
  assert.equal(result.ok, false);
  assert.match(result.error, /before returning any page content/);
});

test("AI Custom HTML accepts a complete raw document without JSON escaping", () => {
  let listener;
  const context = {
    chrome: {
      runtime: { onInstalled: { addListener() {} }, onMessage: { addListener(fn) { listener = fn; } } }
    }
  };
  vm.createContext(context);
  vm.runInContext(workerSource, context);
  const html = '<!doctype html><html lang="en"><head><title>Comfortable reading</title><style>body { font-size: 115%; }</style></head><body><aside>Contents</aside><main><h1>Article</h1></main></body></html>';
  let result;
  listener({
    type: "PAGEFLOW_AI_PARSE", provider: "anthropic", requestedMode: "custom", status: 200,
    rawText: JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: html }] })
  }, null, (value) => { result = value; });
  assert.equal(result.ok, true);
  assert.equal(result.plan.settings.generatedHtml, html);
  assert.equal(result.plan.settings.rebuildLayout, "custom");
  assert.equal(result.plan.settings.viewMode, "rebuild");
  listener({
    type: "PAGEFLOW_AI_PARSE", provider: "anthropic", requestedMode: "custom", status: 200,
    rawText: JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: `Here is the page:\n\`\`\`html\n${html}\n\`\`\`` }] })
  }, null, (value) => { result = value; });
  assert.equal(result.ok, true);
  assert.equal(result.plan.settings.generatedHtml, html);
});

test("AI Custom HTML reports an incomplete document instead of a JSON-settings error", () => {
  let listener;
  const context = {
    chrome: {
      runtime: { onInstalled: { addListener() {} }, onMessage: { addListener(fn) { listener = fn; } } }
    }
  };
  vm.createContext(context);
  vm.runInContext(workerSource, context);
  let result;
  listener({
    type: "PAGEFLOW_AI_PARSE", provider: "anthropic", requestedMode: "custom", status: 200,
    rawText: JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: "<html><body><main>Incomplete" }] })
  }, null, (value) => { result = value; });
  assert.equal(result.ok, false);
  assert.match(result.error, /complete HTML page/);
  assert.doesNotMatch(result.error, /JSON settings/);
  listener({
    type: "PAGEFLOW_AI_PARSE", provider: "anthropic", requestedMode: "custom", status: 200,
    rawText: JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: '{"settings":{"generatedHtml":"<html>"' }] })
  }, null, (value) => { result = value; });
  assert.equal(result.ok, false);
  assert.match(result.error, /malformed JSON instead of a complete HTML page/);
});

test("AI JSON parser accepts a wrapped object with braces inside strings", () => {
  const context = {
    input: 'Here is the design:\n```json\n{"summary":"Use {clear} labels","settings":{"fontScale":115}}\n```\nReady.',
    result: null
  };
  vm.createContext(context);
  vm.runInContext(
    workerSource.slice(0, workerSource.indexOf("chrome.runtime.onInstalled")) + "; result = normalizePlan(input);",
    context
  );
  assert.equal(context.result.summary, "Use {clear} labels");
  assert.equal(context.result.settings.fontScale, 115);
});

test("large page context stays complete JSON and marks omitted content", () => {
  const context = {
    input: {
      page: { title: "Long article" },
      contentModel: {
        title: "Long article",
        controls: [{ id: "c1", label: "Open menu", kind: "button" }],
        groups: Array.from({ length: 50 }, (_, index) => ({
          heading: `Section ${index}`,
          blocks: [{ type: "paragraph", text: "Readable article content. ".repeat(35) }]
        }))
      }
    },
    result: null
  };
  vm.createContext(context);
  vm.runInContext(
    workerSource.slice(0, workerSource.indexOf("chrome.runtime.onInstalled")) +
      "; result = JSON.stringify(compactPageContext(input, true));",
    context
  );
  const result = JSON.parse(context.result);
  assert.ok(context.result.length <= 16000);
  assert.equal(result.contentModel.title, "Long article");
  assert.equal(result.contentModel.controls[0].id, "c1");
  assert.equal(result.contentModel.truncated, true);
  assert.ok(result.contentModel.groups.length < 50);
});

test("Claude output-limit errors are reported before attempting JSON parsing", async () => {
  let listener;
  const context = {
    chrome: {
      storage: { local: { get: async () => ({
        pageFlowAiConfig: {
          provider: "anthropic", endpoint: "https://api.anthropic.com/v1/messages",
          model: "claude-test", apiKey: "test-only"
        }
      }) } },
      runtime: { onInstalled: { addListener() {} }, onMessage: { addListener(fn) { listener = fn; } } }
    }
  };
  vm.createContext(context);
  vm.runInContext(workerSource, context);
  let response;
  listener({
    type: "PAGEFLOW_AI_PARSE", provider: "anthropic", status: 200,
    rawText: JSON.stringify({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"settings":{' }] })
  }, null, (value) => { response = value; });
  assert.equal(response.ok, false);
  assert.match(response.error, /output limit/);
});

test("AI network request runs in the popup, not the service worker", async () => {
  let calledUrl;
  let timeoutDelay;
  let parsedMode;
  const context = {
    currentState: {},
    requestedMode: "adapt",
    AbortController,
    setTimeout(_callback, delay) { timeoutDelay = delay; return 1; },
    clearTimeout() {},
    chrome: { runtime: { sendMessage: async (message) => {
      if (message.type === "PAGEFLOW_AI_PREPARE") return { ok: true, configured: true, provider: "anthropic", endpoint: "https://api.anthropic.com/v1/messages",
        headers: { "x-api-key": "test-only" }, requestBody: { model: "claude-test" }, timeoutMs: 90000 };
      parsedMode = message.requestedMode;
      return { ok: true, plan: { summary: "Larger text", settings: { fontScale: 115 } } };
    } } },
    fetch: async (url, request) => {
      calledUrl = url;
      assert.ok(request.signal);
      return { status: 200, text: async () => '{"content":[]}' };
    },
    result: null
  };
  vm.createContext(context);
  vm.runInContext(
    popupSource.slice(popupSource.indexOf("async function requestAiFromPopup"), popupSource.indexOf("async function runSmartPrompt")) +
      '; result = requestAiFromPopup("Increase text size", {});',
    context
  );
  const result = await context.result;
  assert.equal(calledUrl, "https://api.anthropic.com/v1/messages");
  assert.equal(timeoutDelay, 90000);
  assert.equal(parsedMode, "adapt");
  assert.equal(result.plan.settings.fontScale, 115);
});

test("popup requests a bounded Claude continuation and never previews the partial HTML", async () => {
  const partial = "<!doctype html><html><head><title>Article</title></head><body><main>Start ";
  const complete = `${partial}finished</main></body></html>`;
  const requests = [];
  const parses = [];
  const statuses = [];
  const context = {
    currentState: {}, requestedMode: "custom", AbortController,
    setTimeout() { return 1; }, clearTimeout() {},
    setStatus(message) { statuses.push(message); },
    chrome: { runtime: { sendMessage: async (message) => {
      if (message.type === "PAGEFLOW_AI_PREPARE") return {
        ok: true, configured: true, provider: "anthropic", endpoint: "https://api.anthropic.com/v1/messages",
        headers: { "x-api-key": "test-only" }, timeoutMs: 180000,
        requestBody: { model: "claude-test", max_tokens: 8000,
          messages: [{ role: "user", content: [{ type: "text", text: "Design the article" }] }] }
      };
      parses.push(message);
      return parses.length === 1
        ? { ok: true, continuationText: partial }
        : { ok: true, plan: { summary: "Complete", settings: { generatedHtml: complete } } };
    } } },
    fetch: async (_url, request) => {
      requests.push(JSON.parse(request.body));
      return { status: 200, text: async () => '{"content":[]}' };
    },
    result: null
  };
  vm.createContext(context);
  vm.runInContext(
    popupSource.slice(popupSource.indexOf("async function requestAiFromPopup"), popupSource.indexOf("async function runSmartPrompt")) +
      '; result = requestAiFromPopup("Design the article", {});',
    context
  );
  const result = await context.result;
  assert.equal(requests.length, 2);
  assert.equal(parses[0].previousHtml, "");
  assert.equal(parses[1].previousHtml, partial);
  assert.equal(requests[1].messages[1].role, "assistant");
  assert.equal(requests[1].messages[1].content[0].text, partial);
  assert.match(requests[1].messages[2].content[0].text, /Continue the preceding HTML/);
  assert.equal(result.plan.settings.generatedHtml, complete);
  assert.equal(statuses.length, 1);
});

test("popup stops after three incomplete Custom HTML responses", async () => {
  let requests = 0;
  const context = {
    currentState: {}, requestedMode: "custom", AbortController,
    setTimeout() { return 1; }, clearTimeout() {}, setStatus() {},
    chrome: { runtime: { sendMessage: async (message) => message.type === "PAGEFLOW_AI_PREPARE"
      ? { ok: true, configured: true, provider: "anthropic", endpoint: "https://api.anthropic.com/v1/messages",
        headers: {}, timeoutMs: 180000, requestBody: { messages: [{ role: "user", content: "Design" }] } }
      : { ok: true, continuationText: `<!doctype html><html><body>${"Partial ".repeat(requests)}` } } },
    fetch: async () => { requests += 1; return { status: 200, text: async () => "{}" }; },
    result: null
  };
  vm.createContext(context);
  vm.runInContext(
    popupSource.slice(popupSource.indexOf("async function requestAiFromPopup"), popupSource.indexOf("async function runSmartPrompt")) +
      '; result = requestAiFromPopup("Design", {});',
    context
  );
  await assert.rejects(context.result, /still incomplete after three AI responses/);
  assert.equal(requests, 3);
});

test("popup reconnects a missing page script once", async () => {
  let sends = 0;
  let injections = 0;
  const context = {
    activeTabId: 17,
    chrome: {
      tabs: { sendMessage: async () => {
        sends += 1;
        if (sends === 1) throw new Error("Could not establish connection. Receiving end does not exist.");
        return { ok: true };
      } },
      scripting: { executeScript: async (request) => {
        injections += 1;
        assert.equal(request.target.tabId, 17);
        assert.deepEqual(Array.from(request.files), ["content-script.js"]);
      } }
    },
    result: null
  };
  vm.createContext(context);
  vm.runInContext(
    popupSource.slice(popupSource.indexOf("async function sendToPage"), popupSource.indexOf("async function applyPatch")) +
      "; result = sendToPage({type: 'PAGEFLOW_GET_CONTEXT'});",
    context
  );
  assert.deepEqual(await context.result, { ok: true });
  assert.equal(sends, 2);
  assert.equal(injections, 1);
});

test("switching modes cannot reuse stale custom HTML as a preset rebuild", () => {
  const context = { result: null };
  vm.createContext(context);
  vm.runInContext(
    popupSource.slice(popupSource.indexOf("function settingsForMode"), popupSource.indexOf("async function runSmartPrompt")) +
      '; result = { rebuild: settingsForMode({ rebuildLayout: "custom", generatedHtml: "<main>old</main>" }, "rebuild"), custom: settingsForMode({}, "custom") };',
    context
  );
  assert.equal(context.result.rebuild.viewMode, "rebuild");
  assert.equal(context.result.rebuild.rebuildLayout, "reading");
  assert.equal(context.result.rebuild.generatedHtml, undefined);
  assert.equal(context.result.custom.rebuildLayout, "custom");
});

test("saving a new endpoint path keeps permission for the same API origin", async () => {
  let submit;
  const removed = [];
  const elements = Object.fromEntries(["aiForm", "provider", "endpoint", "endpointHint", "model", "apiKey", "status", "clear"]
    .map((id) => [id, { value: "", textContent: "", style: {}, addEventListener(type, handler) {
      if (id === "aiForm" && type === "submit") submit = handler;
    } }]));
  const config = {
    provider: "anthropic", endpoint: "https://api.anthropic.com/v1/old-path",
    model: "claude-test", apiKey: "test-only"
  };
  const context = {
    document: { getElementById: (id) => elements[id] },
    chrome: {
      storage: { local: {
        get: async () => ({ pageFlowAiConfig: config }),
        set: async (value) => { Object.assign(config, value.pageFlowAiConfig); }
      } },
      permissions: {
        request: async () => true,
        remove: async (value) => { removed.push(value); }
      }
    },
    URL
  };
  vm.createContext(context);
  vm.runInContext(optionsSource, context);
  await Promise.resolve();
  elements.endpoint.value = "https://api.anthropic.com/v1/messages";
  await submit({ preventDefault() {} });
  assert.equal(config.endpoint, "https://api.anthropic.com/v1/messages");
  assert.equal(removed.length, 0);
});
