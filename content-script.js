const STORAGE_KEY = "pageFlowSiteSettings";

const DEFAULT_STATE = Object.freeze({
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
  pagePadding: 0
});

const ALLOWED_THEMES = new Set(["original", "warm", "contrast"]);
const ALLOWED_SIDEBAR_MODES = new Set(["original", "hide", "dim"]);
const ALLOWED_NAVIGATION_MODES = new Set(["original", "hide", "dim", "compact"]);
const ALLOWED_HEADER_MODES = new Set(["original", "hide", "compact"]);
const ALLOWED_FOOTER_MODES = new Set(["original", "hide"]);
let currentState = { ...DEFAULT_STATE };

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function sanitizeState(candidate = {}) {
  return {
    theme: ALLOWED_THEMES.has(candidate.theme) ? candidate.theme : DEFAULT_STATE.theme,
    hideImages: Boolean(candidate.hideImages),
    grayscaleImages: Boolean(candidate.grayscaleImages),
    readableFont: Boolean(candidate.readableFont),
    underlineLinks: Boolean(candidate.underlineLinks),
    reduceMotion: Boolean(candidate.reduceMotion),
    focusMode: Boolean(candidate.focusMode),
    fontScale: clamp(candidate.fontScale, 80, 160, DEFAULT_STATE.fontScale),
    lineHeight: clamp(candidate.lineHeight, 1.2, 2.2, DEFAULT_STATE.lineHeight),
    saturation: clamp(candidate.saturation, 0, 200, DEFAULT_STATE.saturation),
    brightness: clamp(candidate.brightness, 60, 140, DEFAULT_STATE.brightness),
    readingWidth: clamp(candidate.readingWidth, 0, 1200, DEFAULT_STATE.readingWidth),
    sidebarMode: ALLOWED_SIDEBAR_MODES.has(candidate.sidebarMode) ? candidate.sidebarMode : DEFAULT_STATE.sidebarMode,
    navigationMode: ALLOWED_NAVIGATION_MODES.has(candidate.navigationMode) ? candidate.navigationMode : DEFAULT_STATE.navigationMode,
    headerMode: ALLOWED_HEADER_MODES.has(candidate.headerMode) ? candidate.headerMode : DEFAULT_STATE.headerMode,
    footerMode: ALLOWED_FOOTER_MODES.has(candidate.footerMode) ? candidate.footerMode : DEFAULT_STATE.footerMode,
    paragraphSpacing: clamp(candidate.paragraphSpacing, 0, 40, DEFAULT_STATE.paragraphSpacing),
    pagePadding: clamp(candidate.pagePadding, 0, 48, DEFAULT_STATE.pagePadding)
  };
}

function siteKey() {
  return location.origin;
}

function ensureStyles() {
  if (document.getElementById("pageflow-ai-styles")) return;

  const style = document.createElement("style");
  style.id = "pageflow-ai-styles";
  style.textContent = `
    html.pageflow-font-size {
      font-size: var(--pageflow-font-scale, 100%) !important;
    }

    html.pageflow-filter {
      filter: var(--pageflow-filter, none) !important;
    }

    html.pageflow-line-height body {
      line-height: var(--pageflow-line-height, normal) !important;
    }

    html.pageflow-readable-font body,
    html.pageflow-readable-font button,
    html.pageflow-readable-font input,
    html.pageflow-readable-font textarea,
    html.pageflow-readable-font select {
      font-family: Arial, "Noto Sans SC", "Microsoft YaHei", sans-serif !important;
      letter-spacing: 0.015em !important;
    }

    html.pageflow-underlined-links a:not([role="button"]) {
      text-decoration: underline !important;
      text-underline-offset: 0.18em !important;
      text-decoration-thickness: 0.1em !important;
    }

    html.pageflow-hide-images img,
    html.pageflow-hide-images picture,
    html.pageflow-hide-images input[type="image"] {
      display: none !important;
    }

    html.pageflow-grayscale-images img,
    html.pageflow-grayscale-images picture,
    html.pageflow-grayscale-images video {
      filter: grayscale(1) !important;
    }


    html.pageflow-warm body {
      background-color: #fffaf0 !important;
    }

    html.pageflow-reduce-motion *,
    html.pageflow-reduce-motion *::before,
    html.pageflow-reduce-motion *::after {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
      transition-duration: 0.001ms !important;
    }

    html.pageflow-sidebar-hide :where(aside, [role="complementary"]) {
      display: none !important;
    }

    html.pageflow-sidebar-dim :where(aside, [role="complementary"]) {
      opacity: 0.24 !important;
    }

    html.pageflow-navigation-hide :where(nav, [role="navigation"]) {
      display: none !important;
    }

    html.pageflow-navigation-dim :where(nav, [role="navigation"]) {
      opacity: 0.3 !important;
    }

    html.pageflow-navigation-compact :where(nav, [role="navigation"]) {
      box-sizing: border-box !important;
      max-height: 64px !important;
      overflow: auto !important;
    }

    html.pageflow-header-hide :where(header, [role="banner"]) {
      display: none !important;
    }

    html.pageflow-header-compact :where(header, [role="banner"]) {
      box-sizing: border-box !important;
      max-height: 88px !important;
      overflow: auto !important;
    }

    html.pageflow-footer-hide footer {
      display: none !important;
    }

    html.pageflow-paragraph-spacing p {
      margin-bottom: var(--pageflow-paragraph-spacing) !important;
    }

    html.pageflow-page-padding :where(main, article, [role="main"]) {
      box-sizing: border-box !important;
      padding-left: var(--pageflow-page-padding) !important;
      padding-right: var(--pageflow-page-padding) !important;
    }

    html.pageflow-focus :where(header, nav, aside, footer, [role="banner"], [role="navigation"], [role="complementary"]) {
      opacity: 0.22 !important;
      transition: opacity 160ms ease !important;
    }

    html.pageflow-focus :where(header, nav, aside, footer, [role="banner"], [role="navigation"], [role="complementary"]):hover,
    html.pageflow-focus :where(header, nav, aside, footer, [role="banner"], [role="navigation"], [role="complementary"]):focus-within {
      opacity: 1 !important;
    }

    html.pageflow-reading-width :where(main, article, [role="main"]) {
      box-sizing: border-box !important;
      max-width: var(--pageflow-reading-width) !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function themeFilter(state) {
  const themeFilters = {
    original: "",
    warm: "sepia(0.18)",
    contrast: "contrast(1.32)"
  };
  const filters = [
    themeFilters[state.theme],
    state.saturation === DEFAULT_STATE.saturation ? "" : `saturate(${state.saturation}%)`,
    state.brightness === DEFAULT_STATE.brightness ? "" : `brightness(${state.brightness}%)`
  ].filter(Boolean).join(" ");
  return filters || "none";
}

function applyState(nextState) {
  currentState = sanitizeState(nextState);
  ensureStyles();

  const root = document.documentElement;
  const classes = [
    "pageflow-font-size",
    "pageflow-line-height",
    "pageflow-filter",
    "pageflow-warm",
    "pageflow-readable-font",
    "pageflow-underlined-links",
    "pageflow-hide-images",
    "pageflow-grayscale-images",
    "pageflow-reduce-motion",
    "pageflow-focus",
    "pageflow-reading-width",
    "pageflow-sidebar-hide",
    "pageflow-sidebar-dim",
    "pageflow-navigation-hide",
    "pageflow-navigation-dim",
    "pageflow-navigation-compact",
    "pageflow-header-hide",
    "pageflow-header-compact",
    "pageflow-footer-hide",
    "pageflow-paragraph-spacing",
    "pageflow-page-padding"
  ];
  root.classList.remove(...classes);

  root.classList.toggle("pageflow-font-size", currentState.fontScale !== DEFAULT_STATE.fontScale);
  root.classList.toggle("pageflow-line-height", currentState.lineHeight !== DEFAULT_STATE.lineHeight);
  root.classList.toggle("pageflow-filter", themeFilter(currentState) !== "none");
  root.classList.toggle("pageflow-warm", currentState.theme === "warm");
  root.classList.toggle("pageflow-readable-font", currentState.readableFont);
  root.classList.toggle("pageflow-underlined-links", currentState.underlineLinks);
  root.classList.toggle("pageflow-hide-images", currentState.hideImages);
  root.classList.toggle("pageflow-grayscale-images", currentState.grayscaleImages);
  root.classList.toggle("pageflow-reduce-motion", currentState.reduceMotion);
  root.classList.toggle("pageflow-focus", currentState.focusMode);
  root.classList.toggle("pageflow-reading-width", currentState.readingWidth > 0);
  root.classList.toggle("pageflow-sidebar-hide", currentState.sidebarMode === "hide");
  root.classList.toggle("pageflow-sidebar-dim", currentState.sidebarMode === "dim");
  root.classList.toggle("pageflow-navigation-hide", currentState.navigationMode === "hide");
  root.classList.toggle("pageflow-navigation-dim", currentState.navigationMode === "dim");
  root.classList.toggle("pageflow-navigation-compact", currentState.navigationMode === "compact");
  root.classList.toggle("pageflow-header-hide", currentState.headerMode === "hide");
  root.classList.toggle("pageflow-header-compact", currentState.headerMode === "compact");
  root.classList.toggle("pageflow-footer-hide", currentState.footerMode === "hide");
  root.classList.toggle("pageflow-paragraph-spacing", currentState.paragraphSpacing > 0);
  root.classList.toggle("pageflow-page-padding", currentState.pagePadding > 0);

  root.style.setProperty("--pageflow-font-scale", `${currentState.fontScale}%`);
  root.style.setProperty("--pageflow-line-height", String(currentState.lineHeight));
  root.style.setProperty("--pageflow-filter", themeFilter(currentState));
  root.style.setProperty("--pageflow-reading-width", `${currentState.readingWidth}px`);
  root.style.setProperty("--pageflow-paragraph-spacing", `${currentState.paragraphSpacing}px`);
  root.style.setProperty("--pageflow-page-padding", `${currentState.pagePadding}px`);
}

function cleanContextText(value, maxLength = 180) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email redacted]")
    .replace(/\b(?:\d[ -]*?){12,19}\b/g, "[number redacted]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[token redacted]")
    .trim()
    .slice(0, maxLength);
}

function visibleTextExcerpt(root, maxLength = 1800) {
  if (!root) return "";
  const excluded = "script, style, noscript, template, input, textarea, select, option, button, [contenteditable='true'], [aria-hidden='true']";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parts = [];
  let totalLength = 0;
  let inspectedNodes = 0;
  let node;

  while ((node = walker.nextNode()) && inspectedNodes < 500 && totalLength < maxLength) {
    inspectedNodes += 1;
    const parent = node.parentElement;
    if (!parent || parent.closest(excluded)) continue;

    const style = getComputedStyle(parent);
    if (style.display === "none" || style.visibility === "hidden") continue;

    const text = cleanContextText(node.nodeValue, 240);
    if (!text) continue;
    parts.push(text);
    totalLength += text.length + 1;
  }

  return cleanContextText(parts.join(" "), maxLength);
}

function regionSummary(selector) {
  const element = document.querySelector(selector);
  if (!element) return { exists: false };

  return {
    exists: true,
    tag: element.tagName.toLowerCase(),
    role: cleanContextText(element.getAttribute("role"), 40),
    textLength: Math.min(20000, cleanContextText(element.innerText, 20000).length),
    headings: element.querySelectorAll("h1, h2, h3").length,
    links: element.querySelectorAll("a").length,
    images: element.querySelectorAll("img, picture").length
  };
}

function getPageContext() {
  const primaryContent = document.querySelector("article, main, [role='main']") || document.body;
  const bodyStyle = document.body ? getComputedStyle(document.body) : null;
  const contentStyle = primaryContent ? getComputedStyle(primaryContent) : null;
  const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
    .slice(0, 14)
    .map((heading) => cleanContextText(heading.innerText, 160))
    .filter(Boolean);

  return {
    page: {
      hostname: location.hostname,
      pathname: cleanContextText(location.pathname, 300),
      title: cleanContextText(document.title, 200),
      language: cleanContextText(document.documentElement.lang, 30)
    },
    viewport: {
      width: Math.max(0, Math.round(window.innerWidth)),
      height: Math.max(0, Math.round(window.innerHeight))
    },
    structure: {
      headings: document.querySelectorAll("h1, h2, h3").length,
      paragraphs: document.querySelectorAll("p").length,
      images: document.querySelectorAll("img, picture").length,
      links: document.querySelectorAll("a").length,
      buttons: document.querySelectorAll("button, [role='button']").length,
      forms: document.querySelectorAll("form").length
    },
    regions: {
      header: regionSummary("header, [role='banner']"),
      navigation: regionSummary("nav, [role='navigation']"),
      main: regionSummary("main, [role='main']"),
      article: regionSummary("article"),
      sidebar: regionSummary("aside, [role='complementary']"),
      footer: regionSummary("footer")
    },
    headings,
    visibleTextExcerpt: visibleTextExcerpt(primaryContent),
    appearance: bodyStyle ? {
      backgroundColor: cleanContextText(bodyStyle.backgroundColor, 60),
      textColor: cleanContextText(bodyStyle.color, 60),
      fontFamily: cleanContextText(bodyStyle.fontFamily, 120),
      fontSize: cleanContextText(bodyStyle.fontSize, 30),
      contentDisplay: cleanContextText(contentStyle?.display, 30),
      contentMaxWidth: cleanContextText(contentStyle?.maxWidth, 30)
    } : {}
  };
}

async function saveState(state) {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const settings = stored[STORAGE_KEY] || {};
  settings[siteKey()] = state;
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

async function loadState() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const saved = stored[STORAGE_KEY]?.[siteKey()];
  applyState(saved ? { ...DEFAULT_STATE, ...saved } : DEFAULT_STATE);
}

const initialization = loadState().catch(() => applyState(DEFAULT_STATE));

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "PAGEFLOW_GET_STATE") {
    initialization.then(() => sendResponse({ ok: true, state: currentState, site: location.hostname }));
    return true;
  }

  if (message?.type === "PAGEFLOW_GET_CONTEXT") {
    initialization
      .then(() => sendResponse({ ok: true, context: getPageContext() }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "PAGEFLOW_SET_STATE") {
    const nextState = sanitizeState({ ...currentState, ...message.patch });
    applyState(nextState);
    saveState(nextState)
      .then(() => sendResponse({ ok: true, state: nextState }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "PAGEFLOW_RESET") {
    applyState(DEFAULT_STATE);
    saveState(DEFAULT_STATE)
      .then(() => sendResponse({ ok: true, state: { ...DEFAULT_STATE } }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});
