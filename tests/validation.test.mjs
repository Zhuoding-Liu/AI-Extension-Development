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

test("Claude adapter carries mode and page context without temperature", async () => {
  let listener;
  let requestBody;
  const context = {
    console,
    AbortController,
    setTimeout,
    clearTimeout,
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
                rebuildLayout: "reading",
                pageSearch: true
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
      prompt: "Rebuild this article",
      requestedMode: "rebuild",
      currentState: {},
      pageContext: { paragraphs: [{ id: "p1", text: "Introduction" }] }
    }, null, resolve);
  });

  assert.equal(response.ok, true);
  assert.equal(response.plan.settings.viewMode, "rebuild");
  assert.equal(requestBody.max_tokens, 2400);
  assert.equal(requestBody.temperature, undefined);
  assert.match(requestBody.messages[0].content[0].text, /Requested mode: rebuild/);
  assert.match(requestBody.messages[0].content[0].text, /Introduction/);
});
