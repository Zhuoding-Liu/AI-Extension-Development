const DEFAULT_STATE = {
  theme: "original",
  hideImages: false,
  grayscaleImages: false,
  readableFont: false,
  underlineLinks: false,
  reduceMotion: false,
  focusMode: false,
  fontScale: 100,
  lineHeight: 1.6,
  saturation: 100,
  brightness: 100,
  readingWidth: 0,
  sidebarMode: "original",
  navigationMode: "original",
  headerMode: "original",
  footerMode: "original",
  paragraphSpacing: 0,
  pagePadding: 0,
  layoutPreset: "original",
  customBackground: "",
  customText: "",
  customAccent: "",
  fontStyle: "original",
  textAlign: "original",
  sectionGap: 0,
  cornerRadius: 0,
  tableOfContents: false,
  readingProgress: false,
  backToTop: false,
  highlightHeadings: false
};

let activeTabId = null;
let currentState = { ...DEFAULT_STATE };
let updateTimer = null;
let pendingPlan = null;

const FIELD_LABELS = {
  theme: "Color theme", hideImages: "Images", grayscaleImages: "Image color",
  readableFont: "Readable font", underlineLinks: "Link highlighting",
  reduceMotion: "Reduced motion", focusMode: "Reading focus", fontScale: "Text size",
  lineHeight: "Line spacing", saturation: "Saturation", brightness: "Brightness",
  readingWidth: "Reading width", sidebarMode: "Sidebar", navigationMode: "Navigation",
  headerMode: "Header", footerMode: "Footer", paragraphSpacing: "Paragraph spacing",
  pagePadding: "Page padding", layoutPreset: "Layout", customBackground: "Background color",
  customText: "Text color", customAccent: "Accent color", fontStyle: "Font style",
  textAlign: "Text alignment", sectionGap: "Section gap", cornerRadius: "Corner radius",
  tableOfContents: "Table of contents", readingProgress: "Reading progress",
  backToTop: "Back to top", highlightHeadings: "Heading highlights"
};

const siteName = document.getElementById("siteName");
const status = document.getElementById("status");
const prompt = document.getElementById("aiPrompt");
const promptButton = document.getElementById("applyPrompt");
const aiPlan = document.getElementById("aiPlan");
const aiPlanSummary = document.getElementById("aiPlanSummary");
const aiPlanChanges = document.getElementById("aiPlanChanges");
const undoAi = document.getElementById("undoAi");

function setStatus(message, isError = false) {
  status.textContent = message;
  status.style.color = isError ? "#ff918f" : "";
}

function formatValue(key, value) {
  if (["fontScale", "saturation", "brightness"].includes(key)) return `${value}%`;
  if (key === "readingWidth") return Number(value) === 0 ? "Auto" : `${value}px`;
  return Number(value).toFixed(1);
}

function describePlanValue(value) {
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (value === "") return "Original";
  return String(value);
}

function filterPlanSettings(settings) {
  return Object.fromEntries(
    Object.entries(settings || {}).filter(([key]) => Object.prototype.hasOwnProperty.call(DEFAULT_STATE, key))
  );
}

function hidePlan() {
  pendingPlan = null;
  aiPlan.hidden = true;
  aiPlanChanges.replaceChildren();
}

function showPlan(plan) {
  const settings = filterPlanSettings(plan?.settings);
  const changes = Object.entries(settings).filter(([key, value]) => currentState[key] !== value);
  if (!changes.length) throw new Error("The AI returned no new usable settings.");

  pendingPlan = { summary: String(plan?.summary || "AI prepared a page design.").slice(0, 180), settings };
  aiPlanSummary.textContent = pendingPlan.summary;
  aiPlanChanges.replaceChildren(...changes.map(([key, value]) => {
    const item = document.createElement("li");
    item.textContent = `${FIELD_LABELS[key] || key}: ${describePlanValue(value)}`;
    return item;
  }));
  aiPlan.hidden = false;
  setStatus("Review the AI design before applying it.");
}

function render(state) {
  currentState = { ...DEFAULT_STATE, ...state };

  document.querySelectorAll("[data-theme]").forEach((button) => {
    button.classList.toggle("active", button.dataset.theme === currentState.theme);
  });

  document.querySelectorAll("input[data-key]").forEach((input) => {
    const key = input.dataset.key;
    if (input.type === "checkbox") input.checked = Boolean(currentState[key]);
    else input.value = currentState[key];
  });

  document.querySelectorAll("output[data-output]").forEach((output) => {
    output.value = formatValue(output.dataset.output, currentState[output.dataset.output]);
  });
}

async function sendToPage(message) {
  if (!activeTabId) throw new Error("The current page is unavailable.");
  return chrome.tabs.sendMessage(activeTabId, message);
}

async function applyPatch(patch, quiet = false) {
  currentState = { ...currentState, ...patch };
  render(currentState);
  try {
    const response = await sendToPage({ type: "PAGEFLOW_SET_STATE", patch });
    if (!response?.ok) throw new Error(response?.error || "Unable to apply settings.");
    currentState = response.state;
    undoAi.hidden = !response.canUndo;
    hidePlan();
    if (!quiet) setStatus("Applied to this website.");
  } catch (error) {
    setStatus(error.message || "This page cannot be modified.", true);
  }
}

function schedulePatch(key, value) {
  clearTimeout(updateTimer);
  updateTimer = setTimeout(() => applyPatch({ [key]: value }, true), 70);
}

function localPromptToPatch(text) {
  const value = text.toLowerCase();
  const patch = {};
  const has = (...words) => words.some((word) => value.includes(word));

  if (has("warm", "soft colors", "sepia")) patch.theme = "warm";
  if (has("high contrast", "contrast")) patch.theme = "contrast";
  if (has("original color", "reset colors")) patch.theme = "original";

  if (has("hide image", "hide pictures", "no images")) patch.hideImages = true;
  if (has("show image", "show pictures", "restore images")) patch.hideImages = false;
  if (has("grayscale", "black and white images")) patch.grayscaleImages = true;
  if (has("color images", "restore color")) patch.grayscaleImages = false;
  if (has("readable font", "clearer font")) patch.readableFont = true;
  if (has("highlight links", "underline link")) patch.underlineLinks = true;
  if (has("reduce motion", "disable animation")) patch.reduceMotion = true;
  if (has("focus", "focus mode")) patch.focusMode = true;
  if (has("narrow", "reading width")) patch.readingWidth = 720;
  if (has("full width", "wide")) patch.readingWidth = 0;
  if (has("reading layout", "article layout")) patch.layoutPreset = "reading";
  if (has("card layout", "cards layout")) patch.layoutPreset = "cards";
  if (has("workspace layout", "two column")) patch.layoutPreset = "workspace";
  if (has("original layout", "restore layout")) patch.layoutPreset = "original";
  if (has("table of contents", "content outline")) patch.tableOfContents = true;
  if (has("reading progress", "progress bar")) patch.readingProgress = true;
  if (has("back to top")) patch.backToTop = true;
  if (has("highlight headings")) patch.highlightHeadings = true;
  if (has("serif font")) patch.fontStyle = "serif";
  if (has("monospace font", "mono font")) patch.fontStyle = "mono";

  if (has("larger text", "bigger text", "increase font")) patch.fontScale = Math.min(160, currentState.fontScale + 20);
  if (has("smaller text", "decrease font")) patch.fontScale = Math.max(80, currentState.fontScale - 15);
  if (has("more spacing", "increase line spacing")) patch.lineHeight = Math.min(2.2, currentState.lineHeight + 0.3);
  if (has("less color", "lower saturation")) patch.saturation = 65;

  return patch;
}

async function runSmartPrompt() {
  const text = prompt.value.trim();
  if (!text) {
    prompt.focus();
    setStatus("Describe how you would like the page to look.", true);
    return;
  }

  promptButton.disabled = true;
  setStatus("Reading the current page safely…");
  try {
    let pageContext = {};
    try {
      const contextResponse = await sendToPage({ type: "PAGEFLOW_GET_CONTEXT" });
      if (contextResponse?.ok) pageContext = contextResponse.context || {};
    } catch {
      // AI customization can still use the current PageFlow settings without context.
    }

    setStatus("Understanding your preferences…");
    const response = await chrome.runtime.sendMessage({
      type: "PAGEFLOW_AI_REQUEST",
      prompt: text,
      currentState,
      pageContext
    });
    if (!response?.ok) throw new Error(response?.error || "The AI request failed.");

    if (response.configured) {
      const validation = await sendToPage({ type: "PAGEFLOW_VALIDATE_AI_PLAN", patch: response.plan?.settings });
      if (!validation?.ok) throw new Error(validation?.error || "The AI design could not be validated.");
      showPlan({ ...response.plan, settings: validation.patch });
      document.getElementById("aiMode").textContent = response.provider === "anthropic" ? "Claude connected" : "AI connected";
    } else {
      const patch = localPromptToPatch(text);
      if (!Object.keys(patch).length) {
        throw new Error('Try a request such as "larger text and hide images."');
      }
      await applyPatch(patch);
      document.getElementById("aiMode").textContent = "Local rules";
    }
    prompt.value = "";
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    promptButton.disabled = false;
  }
}

document.querySelectorAll("[data-theme]").forEach((button) => {
  button.addEventListener("click", () => applyPatch({ theme: button.dataset.theme }));
});

document.querySelectorAll("input[data-key]").forEach((input) => {
  input.addEventListener("input", () => {
    const key = input.dataset.key;
    const value = input.type === "checkbox" ? input.checked : Number(input.value);
    if (input.type === "range") {
      document.querySelector(`[data-output="${key}"]`).value = formatValue(key, value);
      schedulePatch(key, value);
    } else {
      applyPatch({ [key]: value });
    }
  });
});

document.getElementById("applyAi").addEventListener("click", async () => {
  if (!pendingPlan) return;
  try {
    const response = await sendToPage({ type: "PAGEFLOW_APPLY_AI_PLAN", patch: pendingPlan.settings });
    if (!response?.ok) throw new Error(response?.error || "Unable to apply the AI design.");
    render(response.state);
    undoAi.hidden = !response.canUndo;
    hidePlan();
    setStatus("AI design applied. You can undo it.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.getElementById("dismissAi").addEventListener("click", () => {
  hidePlan();
  setStatus("AI design dismissed. The page was not changed.");
});

undoAi.addEventListener("click", async () => {
  try {
    const response = await sendToPage({ type: "PAGEFLOW_UNDO_AI_PLAN" });
    if (!response?.ok) throw new Error(response?.error || "Unable to undo the AI design.");
    render(response.state);
    undoAi.hidden = !response.canUndo;
    setStatus("The last AI design was undone.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.getElementById("resetButton").addEventListener("click", async () => {
  try {
    const response = await sendToPage({ type: "PAGEFLOW_RESET" });
    if (!response?.ok) throw new Error(response?.error || "Unable to reset this website.");
    render(response.state);
    undoAi.hidden = true;
    hidePlan();
    setStatus("This website has been reset.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

promptButton.addEventListener("click", runSmartPrompt);
prompt.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    runSmartPrompt();
  }
});

document.getElementById("openOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());

async function initialize() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/.test(tab.url || "")) {
    siteName.textContent = "This browser page cannot be modified";
    document.querySelector("main").classList.add("disabled");
    return;
  }

  activeTabId = tab.id;
  try {
    const response = await sendToPage({ type: "PAGEFLOW_GET_STATE" });
    if (!response?.ok) throw new Error("Connection failed.");
    siteName.textContent = response.site || new URL(tab.url).hostname;
    render(response.state);
    undoAi.hidden = !response.canUndo;
    const stored = await chrome.storage.local.get("pageFlowAiConfig");
    const config = stored.pageFlowAiConfig || {};
    document.getElementById("aiMode").textContent = config.endpoint
      ? config.provider === "anthropic" ? "Claude ready" : "AI ready"
      : "Local rules";
    setStatus("Settings apply only to this website.");
  } catch {
    siteName.textContent = "Refresh the page and try again";
    setStatus("Newly installed extensions require a page refresh.", true);
  }
}

initialize();
