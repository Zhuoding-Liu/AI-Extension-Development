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
});

const ALLOWED_THEMES = new Set(["original", "warm", "contrast"]);
const ALLOWED_SIDEBAR_MODES = new Set(["original", "hide", "dim"]);
const ALLOWED_NAVIGATION_MODES = new Set(["original", "hide", "dim", "compact"]);
const ALLOWED_HEADER_MODES = new Set(["original", "hide", "compact"]);
const ALLOWED_FOOTER_MODES = new Set(["original", "hide"]);
const ALLOWED_LAYOUT_PRESETS = new Set(["original", "reading", "cards", "workspace"]);
const ALLOWED_FONT_STYLES = new Set(["original", "sans", "serif", "mono"]);
const ALLOWED_TEXT_ALIGNMENTS = new Set(["original", "left", "center", "justify"]);
const aiStateHistory = [];
let currentState = { ...DEFAULT_STATE };
let progressScrollHandler = null;

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function sanitizeColor(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "";
}

function relativeLuminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map((channel) => parseInt(channel, 16) / 255);
  const linear = channels.map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(first, second) {
  const light = Math.max(relativeLuminance(first), relativeLuminance(second));
  const dark = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (light + 0.05) / (dark + 0.05);
}

function sanitizePalette(candidate) {
  let background = sanitizeColor(candidate.customBackground);
  let text = sanitizeColor(candidate.customText);
  let accent = sanitizeColor(candidate.customAccent);

  if ((background || text) && (!background || !text || contrastRatio(background, text) < 4.5)) {
    background = "";
    text = "";
  }
  if (background && accent && contrastRatio(background, accent) < 3) accent = "";
  return { background, text, accent };
}

function sanitizeState(candidate = {}) {
  const palette = sanitizePalette(candidate);
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
    pagePadding: clamp(candidate.pagePadding, 0, 48, DEFAULT_STATE.pagePadding),
    layoutPreset: ALLOWED_LAYOUT_PRESETS.has(candidate.layoutPreset) ? candidate.layoutPreset : DEFAULT_STATE.layoutPreset,
    customBackground: palette.background,
    customText: palette.text,
    customAccent: palette.accent,
    fontStyle: ALLOWED_FONT_STYLES.has(candidate.fontStyle) ? candidate.fontStyle : DEFAULT_STATE.fontStyle,
    textAlign: ALLOWED_TEXT_ALIGNMENTS.has(candidate.textAlign) ? candidate.textAlign : DEFAULT_STATE.textAlign,
    sectionGap: clamp(candidate.sectionGap, 0, 48, DEFAULT_STATE.sectionGap),
    cornerRadius: clamp(candidate.cornerRadius, 0, 32, DEFAULT_STATE.cornerRadius),
    tableOfContents: Boolean(candidate.tableOfContents),
    readingProgress: Boolean(candidate.readingProgress),
    backToTop: Boolean(candidate.backToTop),
    highlightHeadings: Boolean(candidate.highlightHeadings)
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

    html.pageflow-custom-background :where(body, main, article, [role="main"]) { background-color: var(--pageflow-background) !important; }
    html.pageflow-custom-text body { color: var(--pageflow-text) !important; }
    html.pageflow-custom-text :where(p, li, blockquote, label, h1, h2, h3, h4, h5, h6) { color: var(--pageflow-text) !important; }
    html.pageflow-custom-accent a { color: var(--pageflow-accent) !important; }
    html.pageflow-font-sans body { font-family: Arial, "Noto Sans", sans-serif !important; }
    html.pageflow-font-serif body { font-family: Georgia, "Times New Roman", serif !important; }
    html.pageflow-font-mono body { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important; }
    html.pageflow-text-left :where(main, article, [role="main"]) { text-align: left !important; }
    html.pageflow-text-center :where(main, article, [role="main"]) { text-align: center !important; }
    html.pageflow-text-justify :where(main, article, [role="main"]) { text-align: justify !important; }

    html.pageflow-layout-reading :where(main, article, [role="main"]) {
      box-sizing: border-box !important;
      max-width: var(--pageflow-layout-width, 760px) !important;
      margin-inline: auto !important;
    }

    html.pageflow-layout-cards :where(main, [role="main"]) > :where(article, section),
    html.pageflow-layout-cards article > section {
      box-sizing: border-box !important;
      margin-block: var(--pageflow-section-gap, 20px) !important;
      padding: clamp(16px, 3vw, 30px) !important;
      border: 1px solid color-mix(in srgb, var(--pageflow-accent, #7254ec) 28%, transparent) !important;
      border-radius: var(--pageflow-corner-radius, 14px) !important;
      background: color-mix(in srgb, var(--pageflow-background, #ffffff) 94%, var(--pageflow-accent, #7254ec)) !important;
      box-shadow: 0 8px 28px rgba(0, 0, 0, .08) !important;
    }

    html.pageflow-layout-workspace :where(main, [role="main"]) {
      box-sizing: border-box !important;
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      align-items: start !important;
      gap: var(--pageflow-section-gap, 24px) !important;
    }

    html.pageflow-layout-workspace :where(main, [role="main"]) > :where(header, nav, h1, [role="banner"]) { grid-column: 1 / -1 !important; }
    html.pageflow-layout-workspace :where(main, [role="main"]) > :where(article, section) {
      min-width: 0 !important;
      border-radius: var(--pageflow-corner-radius, 12px) !important;
    }

    html.pageflow-highlight-headings :where(h1, h2, h3) {
      border-inline-start: 4px solid var(--pageflow-accent, #7254ec) !important;
      padding-inline-start: .55em !important;
    }

    @media (max-width: 900px) {
      html.pageflow-layout-workspace :where(main, [role="main"]) { grid-template-columns: minmax(0, 1fr) !important; }
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

function reconcileTableOfContents(enabled) {
  document.getElementById("pageflow-toc-host")?.remove();
  if (!enabled || !document.body) return;

  const headings = Array.from(document.querySelectorAll("main h1, main h2, main h3, article h1, article h2, article h3, [role='main'] h1, [role='main'] h2, [role='main'] h3"))
    .filter((heading) => cleanContextText(heading.textContent, 120))
    .slice(0, 24);
  if (headings.length < 2) return;

  const host = document.createElement("div");
  host.id = "pageflow-toc-host";
  const shadow = host.attachShadow({ mode: "open" });
  const panel = document.createElement("nav");
  panel.setAttribute("aria-label", "PageFlow table of contents");
  const title = document.createElement("strong");
  title.textContent = "On this page";
  panel.appendChild(title);

  headings.forEach((heading) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = heading.tagName === "H3" ? "level-3" : heading.tagName === "H2" ? "level-2" : "";
    button.textContent = cleanContextText(heading.textContent, 90);
    button.addEventListener("click", () => heading.scrollIntoView({ behavior: currentState.reduceMotion ? "auto" : "smooth", block: "start" }));
    panel.appendChild(button);
  });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; position: fixed; z-index: 2147483646; top: 88px; right: 18px; width: min(250px, calc(100vw - 36px)); }
    nav { box-sizing: border-box; max-height: min(62vh, 520px); overflow: auto; padding: 14px; border: 1px solid #d9d5e8; border-radius: 14px; background: rgba(255,255,255,.96); box-shadow: 0 12px 34px rgba(30,24,55,.18); color: #26232f; font: 13px/1.35 Arial, sans-serif; backdrop-filter: blur(10px); }
    strong { display: block; margin-bottom: 8px; color: #57418e; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
    button { all: unset; box-sizing: border-box; display: block; width: 100%; padding: 6px 7px; border-radius: 7px; cursor: pointer; color: #34303d; }
    button:hover, button:focus-visible { background: #eee9ff; color: #4d31a3; outline: none; }
    .level-2 { padding-left: 16px; font-size: 12px; }
    .level-3 { padding-left: 26px; font-size: 11px; color: #605b67; }
  `;
  shadow.append(style, panel);
  document.documentElement.appendChild(host);
}

function updateReadingProgress() {
  const bar = document.getElementById("pageflow-progress-host")?.shadowRoot?.getElementById("bar");
  if (!bar) return;
  const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  bar.style.width = `${Math.min(100, Math.max(0, window.scrollY / scrollable * 100))}%`;
}

function reconcileReadingProgress(enabled) {
  document.getElementById("pageflow-progress-host")?.remove();
  if (progressScrollHandler) {
    window.removeEventListener("scroll", progressScrollHandler);
    progressScrollHandler = null;
  }
  if (!enabled) return;

  const host = document.createElement("div");
  host.id = "pageflow-progress-host";
  const shadow = host.attachShadow({ mode: "open" });
  const track = document.createElement("div");
  track.innerHTML = '<span id="bar"></span>';
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; position: fixed; z-index: 2147483647; inset: 0 0 auto; height: 4px; pointer-events: none; }
    div { height: 4px; background: rgba(114,84,236,.18); }
    span { display: block; width: 0; height: 100%; background: var(--pageflow-accent, #7254ec); transition: width 80ms linear; }
  `;
  shadow.append(style, track);
  document.documentElement.appendChild(host);
  progressScrollHandler = updateReadingProgress;
  window.addEventListener("scroll", progressScrollHandler, { passive: true });
  updateReadingProgress();
}

function reconcileBackToTop(enabled) {
  document.getElementById("pageflow-back-to-top-host")?.remove();
  if (!enabled) return;

  const host = document.createElement("div");
  host.id = "pageflow-back-to-top-host";
  const shadow = host.attachShadow({ mode: "open" });
  const button = document.createElement("button");
  button.type = "button";
  button.title = "Back to top";
  button.setAttribute("aria-label", "Back to top");
  button.textContent = "↑";
  button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: currentState.reduceMotion ? "auto" : "smooth" }));
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; position: fixed; z-index: 2147483646; right: 20px; bottom: 20px; }
    button { width: 44px; height: 44px; border: 0; border-radius: 50%; background: var(--pageflow-accent, #7254ec); color: white; box-shadow: 0 8px 24px rgba(45,30,100,.3); cursor: pointer; font: 700 22px/1 Arial, sans-serif; }
    button:hover, button:focus-visible { filter: brightness(1.12); outline: 3px solid rgba(114,84,236,.3); outline-offset: 2px; }
  `;
  shadow.append(style, button);
  document.documentElement.appendChild(host);
}

function reconcileBuiltInFeatures(state) {
  reconcileTableOfContents(state.tableOfContents);
  reconcileReadingProgress(state.readingProgress);
  reconcileBackToTop(state.backToTop);
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
    "pageflow-page-padding",
    "pageflow-custom-background",
    "pageflow-custom-text",
    "pageflow-custom-accent",
    "pageflow-font-sans",
    "pageflow-font-serif",
    "pageflow-font-mono",
    "pageflow-text-left",
    "pageflow-text-center",
    "pageflow-text-justify",
    "pageflow-layout-reading",
    "pageflow-layout-cards",
    "pageflow-layout-workspace",
    "pageflow-highlight-headings"
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
  root.classList.toggle("pageflow-custom-background", Boolean(currentState.customBackground));
  root.classList.toggle("pageflow-custom-text", Boolean(currentState.customText));
  root.classList.toggle("pageflow-custom-accent", Boolean(currentState.customAccent));
  root.classList.toggle("pageflow-font-sans", currentState.fontStyle === "sans");
  root.classList.toggle("pageflow-font-serif", currentState.fontStyle === "serif");
  root.classList.toggle("pageflow-font-mono", currentState.fontStyle === "mono");
  root.classList.toggle("pageflow-text-left", currentState.textAlign === "left");
  root.classList.toggle("pageflow-text-center", currentState.textAlign === "center");
  root.classList.toggle("pageflow-text-justify", currentState.textAlign === "justify");
  root.classList.toggle("pageflow-layout-reading", currentState.layoutPreset === "reading");
  root.classList.toggle("pageflow-layout-cards", currentState.layoutPreset === "cards");
  root.classList.toggle("pageflow-layout-workspace", currentState.layoutPreset === "workspace");
  root.classList.toggle("pageflow-highlight-headings", currentState.highlightHeadings);

  root.style.setProperty("--pageflow-font-scale", `${currentState.fontScale}%`);
  root.style.setProperty("--pageflow-line-height", String(currentState.lineHeight));
  root.style.setProperty("--pageflow-filter", themeFilter(currentState));
  root.style.setProperty("--pageflow-reading-width", `${currentState.readingWidth}px`);
  root.style.setProperty("--pageflow-paragraph-spacing", `${currentState.paragraphSpacing}px`);
  root.style.setProperty("--pageflow-page-padding", `${currentState.pagePadding}px`);
  root.style.setProperty("--pageflow-background", currentState.customBackground || "#ffffff");
  root.style.setProperty("--pageflow-text", currentState.customText || "#1f2430");
  root.style.setProperty("--pageflow-accent", currentState.customAccent || "#7254ec");
  root.style.setProperty("--pageflow-layout-width", `${currentState.readingWidth || 760}px`);
  root.style.setProperty("--pageflow-section-gap", `${currentState.sectionGap || 20}px`);
  root.style.setProperty("--pageflow-corner-radius", `${currentState.cornerRadius || 14}px`);

  reconcileBuiltInFeatures(currentState);
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

function sectionSummaries() {
  const candidates = Array.from(document.querySelectorAll("article, main > section, article > section, [role='main'] > section"));
  const unique = candidates.filter((element, index) => candidates.indexOf(element) === index).slice(0, 18);

  return unique.map((element) => {
    const heading = element.matches("article")
      ? element.querySelector("h1, h2, h3")
      : element.querySelector(":scope > h1, :scope > h2, :scope > h3, header h1, header h2, header h3");
    return {
      tag: element.tagName.toLowerCase(),
      heading: cleanContextText(heading?.textContent, 140),
      excerpt: visibleTextExcerpt(element, 280),
      paragraphs: Math.min(100, element.querySelectorAll("p").length),
      images: Math.min(100, element.querySelectorAll("img, picture").length),
      controls: Math.min(100, element.querySelectorAll("button, input, select, textarea, [role='button']").length)
    };
  }).filter((section) => section.heading || section.excerpt);
}

function inferPageType() {
  const articleText = visibleTextExcerpt(document.querySelector("article"), 1200).length;
  const productSignals = document.querySelectorAll("[itemtype*='Product'], [data-product]").length;
  const controls = document.querySelectorAll("button, input, select, textarea, [role='button']").length;
  if (document.querySelector("article") && articleText > 500) return "article";
  if (productSignals > 4 && document.querySelectorAll("img").length > 8) return "catalog";
  if (document.querySelector("form") && controls > 8) return "application";
  if (controls > 25) return "application";
  return "general";
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
      inferredPageType: inferPageType(),
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
    sections: sectionSummaries(),
    visibleTextExcerpt: visibleTextExcerpt(primaryContent, 2600),
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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => reconcileBuiltInFeatures(currentState), { once: true });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "PAGEFLOW_GET_STATE") {
    initialization.then(() => sendResponse({ ok: true, state: currentState, site: location.hostname, canUndo: aiStateHistory.length > 0 }));
    return true;
  }

  if (message?.type === "PAGEFLOW_GET_CONTEXT") {
    initialization
      .then(() => sendResponse({ ok: true, context: getPageContext() }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "PAGEFLOW_VALIDATE_AI_PLAN") {
    const proposedState = sanitizeState({ ...currentState, ...message.patch });
    const patch = {};
    Object.keys(message.patch || {}).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(DEFAULT_STATE, key)) patch[key] = proposedState[key];
    });
    sendResponse({ ok: true, patch });
    return;
  }

  if (message?.type === "PAGEFLOW_SET_STATE") {
    aiStateHistory.length = 0;
    const nextState = sanitizeState({ ...currentState, ...message.patch });
    applyState(nextState);
    saveState(nextState)
      .then(() => sendResponse({ ok: true, state: nextState, canUndo: false }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "PAGEFLOW_APPLY_AI_PLAN") {
    const nextState = sanitizeState({ ...currentState, ...message.patch });
    aiStateHistory.push({ ...currentState });
    if (aiStateHistory.length > 5) aiStateHistory.shift();
    applyState(nextState);
    saveState(nextState)
      .then(() => sendResponse({ ok: true, state: nextState, canUndo: true }))
      .catch((error) => {
        aiStateHistory.pop();
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message?.type === "PAGEFLOW_UNDO_AI_PLAN") {
    const previousState = aiStateHistory.pop();
    if (!previousState) {
      sendResponse({ ok: false, error: "There is no AI change to undo." });
      return;
    }
    applyState(previousState);
    saveState(previousState)
      .then(() => sendResponse({ ok: true, state: previousState, canUndo: aiStateHistory.length > 0 }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "PAGEFLOW_RESET") {
    aiStateHistory.length = 0;
    applyState(DEFAULT_STATE);
    saveState(DEFAULT_STATE)
      .then(() => sendResponse({ ok: true, state: { ...DEFAULT_STATE } }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});
