import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const contentSource = await readFile(new URL("../content-script.js", import.meta.url), "utf8");
const popupSource = await readFile(new URL("../popup.js", import.meta.url), "utf8");
const workerSource = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");

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

test("custom CSS keeps layout freedom while rejecting unsafe and inaccessible declarations", () => {
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

test("custom HTML neutralizes active resources before DOM parsing", () => {
  const result = neutralizeMarkup(`
    <style>@import "https://tracker.test/style.css";</style>
    <iframe src="https://tracker.test/frame"></iframe>
    <main onclick="steal()"><img src="https://tracker.test/pixel" data-pageflow-image="img1"><a href="https://tracker.test">Safe label</a></main>
  `);

  assert.doesNotMatch(result, /https?:|<style|<iframe|onclick=|\ssrc=|\shref=/i);
  assert.match(result, /data-pageflow-image="img1"/);
  assert.match(result, /Safe label/);
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

test("Claude adapter carries custom mode and page context without temperature", async () => {
  let listener;
  let requestBody;
  let timeoutDelay;
  const context = {
    console,
    AbortController,
    setTimeout(_callback, delay) { timeoutDelay = delay; return 1; },
    clearTimeout() {},
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
    },
    fetch: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      assert.ok(options.signal);
      return {
        ok: true,
        json: async () => ({
          content: [{
            type: "text",
            text: JSON.stringify({
              summary: "A rebuilt reading page",
              settings: {
                viewMode: "rebuild",
                rebuildLayout: "custom",
                generatedHtml: "<main><h1>Introduction</h1><p>Generated layout content.</p></main>",
                generatedCss: ".layout { display: grid; }"
              }
            })
          }]
        })
      };
    }
  };
  vm.createContext(context);
  vm.runInContext(workerSource, context);

  const response = await new Promise((resolve) => {
    listener({
      type: "PAGEFLOW_AI_REQUEST",
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
  assert.equal(response.plan.settings.viewMode, "rebuild");
  assert.equal(response.plan.settings.rebuildLayout, "custom");
  assert.equal(requestBody.max_tokens, 8000);
  assert.equal(timeoutDelay, 180000);
  assert.equal(requestBody.temperature, undefined);
  assert.match(requestBody.messages[0].content[0].text, /Requested mode: custom/);
  assert.match(requestBody.messages[0].content[0].text, /Introduction/);
  assert.doesNotMatch(requestBody.messages[0].content[0].text, /DUPLICATE_/);
});
