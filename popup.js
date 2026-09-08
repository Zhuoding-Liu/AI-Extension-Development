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
  readingWidth: 0
};

let activeTabId = null;
let currentState = { ...DEFAULT_STATE };
let updateTimer = null;

const siteName = document.getElementById("siteName");
const status = document.getElementById("status");
const prompt = document.getElementById("aiPrompt");
const promptButton = document.getElementById("applyPrompt");

function setStatus(message, isError = false) {
  status.textContent = message;
  status.style.color = isError ? "#ff918f" : "";
}

function formatValue(key, value) {
  if (["fontScale", "saturation", "brightness"].includes(key)) return `${value}%`;
  if (key === "readingWidth") return Number(value) === 0 ? "Auto" : `${value}px`;
  return Number(value).toFixed(1);
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
  setStatus("Understanding your preferences…");
  try {
    const response = await chrome.runtime.sendMessage({
      type: "PAGEFLOW_AI_REQUEST",
      prompt: text,
      currentState
    });
    if (!response?.ok) throw new Error(response?.error || "The AI request failed.");

    const patch = response.configured ? response.patch : localPromptToPatch(text);
    if (!Object.keys(patch || {}).length) {
      throw new Error(response.configured ? "The AI returned no usable settings." : 'Try a request such as "larger text and hide images."');
    }
    await applyPatch(patch);
    const modeLabel = response.configured
      ? response.provider === "anthropic" ? "Claude connected" : "AI connected"
      : "Local rules";
    document.getElementById("aiMode").textContent = modeLabel;
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

document.getElementById("resetButton").addEventListener("click", async () => {
  try {
    const response = await sendToPage({ type: "PAGEFLOW_RESET" });
    if (!response?.ok) throw new Error(response?.error || "Unable to reset this website.");
    render(response.state);
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
    setStatus("Settings apply only to this website.");
  } catch {
    siteName.textContent = "Refresh the page and try again";
    setStatus("Newly installed extensions require a page refresh.", true);
  }
}

initialize();
