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
  highlightHeadings: false,
  viewMode: "adapt",
  rebuildLayout: "reading",
  pageSearch: false,
  readingTime: false,
  contentSummary: false,
  glossary: false,
  paragraphTranslation: false,
  simplifyTables: false,
  imageViewer: false,
  hideVideos: false,
  dyslexiaMode: false,
  lowVisionMode: false,
  keyboardNavigation: false,
  formAccessibilityAudit: false,
  regionVisibilityPanel: false,
  summaryText: "",
  glossaryItems: [],
  paragraphTranslations: [],
  generatedHtml: "",
  generatedCss: ""
});

const ALLOWED_THEMES = new Set(["original", "warm", "contrast"]);
const ALLOWED_SIDEBAR_MODES = new Set(["original", "hide", "dim"]);
const ALLOWED_NAVIGATION_MODES = new Set(["original", "hide", "dim", "compact"]);
const ALLOWED_HEADER_MODES = new Set(["original", "hide", "compact"]);
const ALLOWED_FOOTER_MODES = new Set(["original", "hide"]);
const ALLOWED_LAYOUT_PRESETS = new Set(["original", "reading", "cards", "workspace"]);
const ALLOWED_FONT_STYLES = new Set(["original", "sans", "serif", "mono"]);
const ALLOWED_TEXT_ALIGNMENTS = new Set(["original", "left", "center", "justify"]);
const ALLOWED_VIEW_MODES = new Set(["adapt", "rebuild"]);
const ALLOWED_REBUILD_LAYOUTS = new Set(["reading", "magazine", "cards", "custom"]);
const FEATURE_REGISTRY = Object.freeze({
  tableOfContents: { label: "Collapsible table of contents", modes: ["adapt", "rebuild"] },
  pageSearch: { label: "Page search", modes: ["adapt", "rebuild"] },
  readingTime: { label: "Reading time and progress", modes: ["adapt", "rebuild"] },
  backToTop: { label: "Back to top", modes: ["adapt", "rebuild"] },
  contentSummary: { label: "Key content summary", modes: ["adapt", "rebuild"] },
  glossary: { label: "Glossary explanations", modes: ["adapt", "rebuild"] },
  paragraphTranslation: { label: "Paragraph translations", modes: ["adapt", "rebuild"] },
  simplifyTables: { label: "Simplified table view", modes: ["adapt", "rebuild"] },
  imageViewer: { label: "Image viewer", modes: ["adapt", "rebuild"] },
  hideVideos: { label: "Hide videos", modes: ["adapt", "rebuild"] },
  dyslexiaMode: { label: "Dyslexia-friendly mode", modes: ["adapt", "rebuild"] },
  lowVisionMode: { label: "Low Vision mode", modes: ["adapt", "rebuild"] },
  keyboardNavigation: { label: "Keyboard heading navigation", modes: ["adapt", "rebuild"] },
  formAccessibilityAudit: { label: "Form accessibility audit", modes: ["adapt"] },
  regionVisibilityPanel: { label: "Region visibility panel", modes: ["adapt"] }
});
const aiStateHistory = [];
let currentState = { ...DEFAULT_STATE };
let progressScrollHandler = null;
let imageViewerHandler = null;
let keyboardNavigationHandler = null;
let pendingRebuildState = null;

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

function strictBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function sanitizeTextValue(value, maxLength) {
  return typeof value === "string" ? cleanContextText(value, maxLength) : "";
}

function sanitizeGlossaryItems(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 16).map((item) => ({
    term: sanitizeTextValue(item?.term, 80),
    definition: sanitizeTextValue(item?.definition, 320)
  })).filter((item) => item.term && item.definition);
}

function sanitizeParagraphTranslations(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 24).map((item) => ({
    paragraphId: /^p\d{1,3}$/.test(String(item?.paragraphId || "")) ? String(item.paragraphId) : "",
    text: sanitizeTextValue(item?.text, 700)
  })).filter((item) => item.paragraphId && item.text);
}

function sanitizeReadingWidth(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return 0;
  return Math.min(1200, Math.max(480, number));
}

const GENERATED_CSS_PROPERTIES = new Set([
  "display", "grid-template-columns", "grid-template-rows", "grid-column", "grid-row",
  "grid-auto-flow", "gap", "column-gap", "row-gap", "align-items", "align-content",
  "align-self", "justify-content", "justify-items", "justify-self", "place-items", "order",
  "flex", "flex-basis", "flex-direction", "flex-flow", "flex-grow", "flex-shrink", "flex-wrap",
  "width", "min-width", "max-width", "min-height", "margin", "margin-block", "margin-inline",
  "margin-top", "margin-right", "margin-bottom", "margin-left", "padding", "padding-block",
  "padding-inline", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border", "border-width", "border-style", "border-color", "border-radius", "border-block-start",
  "border-inline-start", "background", "background-color", "box-shadow", "color", "font-family",
  "font-size", "font-style", "font-weight", "font-variant", "letter-spacing", "line-height",
  "text-align", "text-decoration", "text-decoration-color", "text-transform", "text-wrap",
  "white-space", "word-break", "overflow-wrap", "list-style", "list-style-position",
  "object-fit", "object-position", "aspect-ratio", "columns", "column-width", "column-count",
  "break-inside", "vertical-align", "position", "inset", "top", "right", "bottom", "left"
]);

function safeGeneratedCssValue(property, value) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > 320 || /[{};\\]/.test(normalized)) return "";
  if (/url\s*\(|image-set\s*\(|expression\s*\(|javascript:|data:|@import|-moz-binding|behavior\s*:/i.test(normalized)) return "";
  if (!/^[a-z0-9#.,()%/\s_'"+*\-]+$/i.test(normalized)) return "";
  if (property === "position" && /\b(?:fixed|sticky)\b/i.test(normalized)) return "";
  if (property === "display" && /\bnone\b/i.test(normalized)) return "";
  if (property === "font-size") {
    const match = normalized.match(/^(-?\d*\.?\d+)\s*(px|rem|em|%)$/i);
    if (!match) return "";
    const amount = Number(match[1]);
    const minimum = { px: 14, rem: 0.875, em: 0.875, "%": 87.5 }[match[2].toLowerCase()];
    if (!Number.isFinite(amount) || amount < minimum) return "";
  }
  if (property === "line-height") {
    const match = normalized.match(/^(\d*\.?\d+)(px|rem|em|%)?$/i);
    if (!match) return "";
    const amount = Number(match[1]);
    const unit = (match[2] || "").toLowerCase();
    const minimum = { "": 1.4, px: 20, rem: 1.4, em: 1.4, "%": 140 }[unit];
    if (!Number.isFinite(amount) || amount < minimum) return "";
  }
  if (/color|background|border|shadow|decoration/.test(property)) {
    const structuralBorder = /^(?:0|none|inherit|initial|unset|\d+(?:\.\d+)?(?:px|rem|em)?(?:\s+(?:solid|dashed|dotted))?)$/i.test(normalized);
    if (!structuralBorder && !/var\(--pf-(?:background|text|accent|surface|muted)\)|currentcolor|transparent|color-mix\(/i.test(normalized)) return "";
    if (/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(normalized)) return "";
    if (/^background(?:-color)?$/.test(property) && /var\(--pf-(?:accent|text|muted)\)/i.test(normalized)) return "";
  }
  return normalized;
}

function sanitizeGeneratedCss(value) {
  const source = typeof value === "string" ? value.slice(0, 20000).replace(/\/\*[\s\S]*?\*\//g, "") : "";
  const rules = [];
  const blockPattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = blockPattern.exec(source)) && rules.length < 120) {
    const selectorText = match[1].trim();
    if (!selectorText || /@|:host|:root|\b(?:html|body)\b/i.test(selectorText)) continue;
    const selectors = selectorText.split(",").map((selector) => selector.trim()).filter((selector) => {
      return selector && selector.length <= 180 && /^[a-z0-9_*#.:[\]="'()\s>+~\-]+$/i.test(selector);
    }).slice(0, 8);
    if (!selectors.length) continue;
    const declarations = [];
    match[2].split(";").forEach((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator < 1) return;
      const property = declaration.slice(0, separator).trim().toLowerCase();
      if (!GENERATED_CSS_PROPERTIES.has(property)) return;
      const safeValue = safeGeneratedCssValue(property, declaration.slice(separator + 1));
      if (safeValue) declarations.push(`${property}:${safeValue}`);
    });
    if (declarations.length) {
      rules.push(`${selectors.map((selector) => selector.startsWith(".custom-document") ? selector : `.custom-document ${selector}`).join(",")} {${declarations.join(";")}}`);
    }
  }
  return rules.join("\n");
}

function sanitizeGeneratedSource(value, maxLength) {
  return typeof value === "string" ? value.replace(/\0/g, "").slice(0, maxLength) : "";
}

function sanitizeState(candidate = {}) {
  const palette = sanitizePalette(candidate);
  return {
    theme: ALLOWED_THEMES.has(candidate.theme) ? candidate.theme : DEFAULT_STATE.theme,
    hideImages: strictBoolean(candidate.hideImages, DEFAULT_STATE.hideImages),
    grayscaleImages: strictBoolean(candidate.grayscaleImages, DEFAULT_STATE.grayscaleImages),
    readableFont: strictBoolean(candidate.readableFont, DEFAULT_STATE.readableFont),
    underlineLinks: strictBoolean(candidate.underlineLinks, DEFAULT_STATE.underlineLinks),
    reduceMotion: strictBoolean(candidate.reduceMotion, DEFAULT_STATE.reduceMotion),
    focusMode: strictBoolean(candidate.focusMode, DEFAULT_STATE.focusMode),
    fontScale: clamp(candidate.fontScale, 80, 160, DEFAULT_STATE.fontScale),
    lineHeight: clamp(candidate.lineHeight, 1.2, 2.2, DEFAULT_STATE.lineHeight),
    saturation: clamp(candidate.saturation, 0, 200, DEFAULT_STATE.saturation),
    brightness: clamp(candidate.brightness, 60, 140, DEFAULT_STATE.brightness),
    readingWidth: sanitizeReadingWidth(candidate.readingWidth),
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
    tableOfContents: strictBoolean(candidate.tableOfContents, DEFAULT_STATE.tableOfContents),
    readingProgress: strictBoolean(candidate.readingProgress, DEFAULT_STATE.readingProgress),
    backToTop: strictBoolean(candidate.backToTop, DEFAULT_STATE.backToTop),
    highlightHeadings: strictBoolean(candidate.highlightHeadings, DEFAULT_STATE.highlightHeadings),
    viewMode: ALLOWED_VIEW_MODES.has(candidate.viewMode) ? candidate.viewMode : DEFAULT_STATE.viewMode,
    rebuildLayout: ALLOWED_REBUILD_LAYOUTS.has(candidate.rebuildLayout) ? candidate.rebuildLayout : DEFAULT_STATE.rebuildLayout,
    pageSearch: strictBoolean(candidate.pageSearch, DEFAULT_STATE.pageSearch),
    readingTime: strictBoolean(candidate.readingTime, DEFAULT_STATE.readingTime),
    contentSummary: strictBoolean(candidate.contentSummary, DEFAULT_STATE.contentSummary),
    glossary: strictBoolean(candidate.glossary, DEFAULT_STATE.glossary),
    paragraphTranslation: strictBoolean(candidate.paragraphTranslation, DEFAULT_STATE.paragraphTranslation),
    simplifyTables: strictBoolean(candidate.simplifyTables, DEFAULT_STATE.simplifyTables),
    imageViewer: strictBoolean(candidate.imageViewer, DEFAULT_STATE.imageViewer),
    hideVideos: strictBoolean(candidate.hideVideos, DEFAULT_STATE.hideVideos),
    dyslexiaMode: strictBoolean(candidate.dyslexiaMode, DEFAULT_STATE.dyslexiaMode),
    lowVisionMode: strictBoolean(candidate.lowVisionMode, DEFAULT_STATE.lowVisionMode),
    keyboardNavigation: strictBoolean(candidate.keyboardNavigation, DEFAULT_STATE.keyboardNavigation),
    formAccessibilityAudit: strictBoolean(candidate.formAccessibilityAudit, DEFAULT_STATE.formAccessibilityAudit),
    regionVisibilityPanel: strictBoolean(candidate.regionVisibilityPanel, DEFAULT_STATE.regionVisibilityPanel),
    summaryText: sanitizeTextValue(candidate.summaryText, 1200),
    glossaryItems: sanitizeGlossaryItems(candidate.glossaryItems),
    paragraphTranslations: sanitizeParagraphTranslations(candidate.paragraphTranslations),
    generatedHtml: sanitizeGeneratedSource(candidate.generatedHtml, 40000),
    generatedCss: sanitizeGeneratedCss(candidate.generatedCss)
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

    html.pageflow-hide-videos :where(video, iframe[src*="youtube"], iframe[src*="vimeo"]) {
      display: none !important;
    }

    html.pageflow-simple-tables table {
      display: block !important;
      max-width: 100% !important;
      overflow-x: auto !important;
      border-collapse: collapse !important;
    }

    html.pageflow-simple-tables :where(th, td) {
      padding: .65em .8em !important;
      border: 1px solid color-mix(in srgb, currentColor 22%, transparent) !important;
      text-align: start !important;
    }

    html.pageflow-simple-tables tbody tr:nth-child(even) {
      background: color-mix(in srgb, var(--pageflow-accent, #7254ec) 7%, transparent) !important;
    }

    html.pageflow-dyslexia body,
    html.pageflow-dyslexia :where(button, input, textarea, select) {
      font-family: "Atkinson Hyperlegible", "Verdana", "Arial", sans-serif !important;
      letter-spacing: .055em !important;
      word-spacing: .12em !important;
    }

    html.pageflow-dyslexia :where(p, li) {
      line-height: 1.85 !important;
      max-width: 72ch !important;
    }

    html.pageflow-low-vision {
      font-size: max(125%, var(--pageflow-font-scale, 125%)) !important;
    }

    html.pageflow-low-vision :where(button, input, textarea, select, a) {
      min-height: 32px !important;
      outline-offset: 3px !important;
    }

    html.pageflow-low-vision :focus-visible {
      outline: 4px solid var(--pageflow-accent, #7254ec) !important;
    }

    html [data-pageflow-form-issue="true"] {
      outline: 3px dashed #c62828 !important;
      outline-offset: 2px !important;
    }

    html [data-pageflow-user-hidden="true"] {
      display: none !important;
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
  const panel = document.createElement("details");
  panel.open = true;
  panel.setAttribute("aria-label", "PageFlow table of contents");
  const title = document.createElement("summary");
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
    details { box-sizing: border-box; max-height: min(62vh, 520px); overflow: auto; padding: 14px; border: 1px solid #d9d5e8; border-radius: 14px; background: rgba(255,255,255,.96); box-shadow: 0 12px 34px rgba(30,24,55,.18); color: #26232f; font: 13px/1.35 Arial, sans-serif; backdrop-filter: blur(10px); }
    summary { margin-bottom: 8px; color: #57418e; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; cursor: pointer; }
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
  const bar = document.createElement("span");
  bar.id = "bar";
  track.appendChild(bar);
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

function readableParagraphs(root = document.body) {
  if (!root) return [];
  return Array.from(root.querySelectorAll("p"))
    .filter((paragraph) => !paragraph.closest("[id^='pageflow-'], script, style, template, [aria-hidden='true']"))
    .filter((paragraph) => cleanContextText(paragraph.textContent, 800).length >= 24)
    .slice(0, 120);
}

function clearFeatureArtifacts() {
  document.getElementById("pageflow-tools-host")?.remove();
  document.getElementById("pageflow-image-viewer-host")?.remove();
  document.querySelectorAll("[data-pageflow-translation-host]").forEach((node) => node.remove());
  document.querySelectorAll("[data-pageflow-form-issue]").forEach((node) => node.removeAttribute("data-pageflow-form-issue"));
  document.querySelectorAll("[data-pageflow-user-hidden]").forEach((node) => node.removeAttribute("data-pageflow-user-hidden"));
  if (imageViewerHandler) {
    document.removeEventListener("click", imageViewerHandler, true);
    imageViewerHandler = null;
  }
  if (keyboardNavigationHandler) {
    document.removeEventListener("keydown", keyboardNavigationHandler, true);
    keyboardNavigationHandler = null;
  }
}

function addToolSection(container, titleText, bodyNode, open = false) {
  const details = document.createElement("details");
  details.open = open;
  const summary = document.createElement("summary");
  summary.textContent = titleText;
  details.append(summary, bodyNode);
  container.appendChild(details);
}

function formHasAccessibleName(control) {
  if (control.labels?.length) return true;
  return Boolean(control.getAttribute("aria-label") || control.getAttribute("aria-labelledby") || control.getAttribute("title"));
}

function collectRegionEntries() {
  const definitions = [
    ["Header", "header, [role='banner']"],
    ["Navigation", "nav, [role='navigation']"],
    ["Main content", "main, [role='main']"],
    ["Sidebar", "aside, [role='complementary']"],
    ["Footer", "footer"]
  ];
  return definitions.map(([label, selector]) => ({ label, element: document.querySelector(selector) })).filter((entry) => entry.element);
}

function reconcileTranslations(state) {
  document.querySelectorAll("[data-pageflow-translation-host]").forEach((node) => node.remove());
  if (!state.paragraphTranslation || !state.paragraphTranslations.length) return;
  const primaryContent = document.querySelector("article, main, [role='main']") || document.body;
  const paragraphs = readableParagraphs(primaryContent);
  const byId = new Map(state.paragraphTranslations.map((item) => [item.paragraphId, item.text]));
  paragraphs.forEach((paragraph, index) => {
    const text = byId.get(`p${index + 1}`);
    if (!text) return;
    const host = document.createElement("div");
    host.dataset.pageflowTranslationHost = "true";
    const shadow = host.attachShadow({ mode: "open" });
    const box = document.createElement("div");
    box.textContent = text;
    const style = document.createElement("style");
    style.textContent = `:host{all:initial;display:block;margin:.45em 0 1em}div{padding:.7em .85em;border-inline-start:3px solid #7254ec;background:#f4f1ff;color:#30284a;border-radius:0 8px 8px 0;font:14px/1.55 Arial,sans-serif}`;
    shadow.append(style, box);
    paragraph.insertAdjacentElement("afterend", host);
  });
}

function reconcileImageViewer(enabled) {
  document.getElementById("pageflow-image-viewer-host")?.remove();
  if (imageViewerHandler) {
    document.removeEventListener("click", imageViewerHandler, true);
    imageViewerHandler = null;
  }
  if (!enabled) return;
  imageViewerHandler = (event) => {
    const image = event.target.closest?.("img");
    if (!image || !event.altKey || image.closest("[id^='pageflow-']")) return;
    event.preventDefault();
    event.stopPropagation();
    const host = document.createElement("div");
    host.id = "pageflow-image-viewer-host";
    const shadow = host.attachShadow({ mode: "open" });
    const backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.setAttribute("aria-label", "Close image viewer");
    const preview = document.createElement("img");
    preview.src = image.currentSrc || image.src;
    preview.alt = image.alt || "Expanded page image";
    const style = document.createElement("style");
    style.textContent = `:host{all:initial;position:fixed;inset:0;z-index:2147483647;background:rgba(8,9,13,.92);display:grid;place-items:center;padding:28px}button{position:absolute;inset:0;border:0;background:transparent;cursor:zoom-out}img{position:relative;max-width:94vw;max-height:90vh;object-fit:contain;border-radius:10px;box-shadow:0 20px 70px #000;pointer-events:none}`;
    backdrop.addEventListener("click", () => host.remove());
    shadow.append(style, backdrop, preview);
    document.documentElement.appendChild(host);
  };
  document.addEventListener("click", imageViewerHandler, true);
}

function reconcileKeyboardNavigation(enabled) {
  if (keyboardNavigationHandler) {
    document.removeEventListener("keydown", keyboardNavigationHandler, true);
    keyboardNavigationHandler = null;
  }
  if (!enabled) return;
  keyboardNavigationHandler = (event) => {
    if (!event.altKey || !["ArrowDown", "ArrowUp"].includes(event.key)) return;
    const headings = Array.from(document.querySelectorAll("main h1, main h2, main h3, article h1, article h2, article h3, [role='main'] h1, [role='main'] h2, [role='main'] h3"));
    if (!headings.length) return;
    event.preventDefault();
    const currentIndex = headings.findIndex((heading) => heading.getBoundingClientRect().top > 12);
    const index = event.key === "ArrowDown"
      ? Math.min(headings.length - 1, currentIndex < 0 ? headings.length - 1 : currentIndex)
      : Math.max(0, (currentIndex < 0 ? headings.length : currentIndex) - 1);
    headings[index].scrollIntoView({ behavior: currentState.reduceMotion ? "auto" : "smooth", block: "start" });
    headings[index].setAttribute("tabindex", "-1");
    headings[index].focus({ preventScroll: true });
  };
  document.addEventListener("keydown", keyboardNavigationHandler, true);
}

function reconcileToolsPanel(state) {
  document.getElementById("pageflow-tools-host")?.remove();
  const wantsPanel = state.pageSearch || state.readingTime || state.contentSummary || state.glossary || state.formAccessibilityAudit || state.regionVisibilityPanel || state.keyboardNavigation || state.imageViewer;
  if (!wantsPanel || !document.body) return;

  const host = document.createElement("div");
  host.id = "pageflow-tools-host";
  const shadow = host.attachShadow({ mode: "open" });
  const panel = document.createElement("aside");
  panel.setAttribute("aria-label", "PageFlow trusted tools");
  const heading = document.createElement("strong");
  heading.textContent = "PageFlow tools";
  panel.appendChild(heading);

  if (state.readingTime) {
    const text = visibleTextExcerpt(document.querySelector("article, main, [role='main']") || document.body, 20000);
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const info = document.createElement("p");
    info.textContent = `Estimated reading time: ${Math.max(1, Math.ceil(words / 220))} min`;
    panel.appendChild(info);
  }

  if (state.pageSearch) {
    const body = document.createElement("div");
    const input = document.createElement("input");
    input.type = "search";
    input.placeholder = "Search this page";
    input.setAttribute("aria-label", "Search this page");
    const results = document.createElement("div");
    input.addEventListener("input", () => {
      results.replaceChildren();
      const query = input.value.trim().toLowerCase();
      if (query.length < 2) return;
      const matches = [...document.querySelectorAll("h1, h2, h3, p, li")]
        .filter((node) => !node.closest("[id^='pageflow-']"))
        .filter((node) => cleanContextText(node.textContent, 600).toLowerCase().includes(query))
        .slice(0, 12);
      matches.forEach((node) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = cleanContextText(node.textContent, 100);
        button.addEventListener("click", () => node.scrollIntoView({ behavior: state.reduceMotion ? "auto" : "smooth", block: "center" }));
        results.appendChild(button);
      });
    });
    body.append(input, results);
    addToolSection(panel, "Page search", body, true);
  }

  if (state.contentSummary && state.summaryText) {
    const summary = document.createElement("p");
    summary.textContent = state.summaryText;
    addToolSection(panel, "Key summary", summary);
  }

  if (state.glossary && state.glossaryItems.length) {
    const list = document.createElement("dl");
    state.glossaryItems.forEach((item) => {
      const term = document.createElement("dt");
      const definition = document.createElement("dd");
      term.textContent = item.term;
      definition.textContent = item.definition;
      list.append(term, definition);
    });
    addToolSection(panel, "Glossary", list);
  }

  if (state.formAccessibilityAudit) {
    const controls = Array.from(document.querySelectorAll("input:not([type='hidden']):not([type='button']):not([type='submit']), select, textarea"));
    const issues = controls.filter((control) => !formHasAccessibleName(control));
    issues.forEach((control) => control.dataset.pageflowFormIssue = "true");
    const report = document.createElement("p");
    report.textContent = issues.length ? `${issues.length} form control(s) may be missing an accessible label.` : "No unlabeled form controls were found.";
    addToolSection(panel, "Form accessibility", report);
  }

  if (state.regionVisibilityPanel) {
    const regions = document.createElement("div");
    collectRegionEntries().forEach(({ label, element }) => {
      const row = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = element.dataset.pageflowUserHidden !== "true";
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) element.removeAttribute("data-pageflow-user-hidden");
        else element.dataset.pageflowUserHidden = "true";
      });
      row.append(checkbox, document.createTextNode(label));
      regions.appendChild(row);
    });
    addToolSection(panel, "Visible regions", regions);
  }

  if (state.imageViewer || state.keyboardNavigation) {
    const tips = document.createElement("p");
    const values = [];
    if (state.imageViewer) values.push("Alt-click an image to enlarge it.");
    if (state.keyboardNavigation) values.push("Use Alt+Up/Down to move between headings.");
    tips.textContent = values.join(" ");
    panel.appendChild(tips);
  }

  const style = document.createElement("style");
  style.textContent = `
    :host{all:initial;position:fixed;z-index:2147483645;left:16px;bottom:16px;width:min(300px,calc(100vw - 32px));font:13px/1.45 Arial,sans-serif;color:#292631}
    aside{box-sizing:border-box;max-height:min(68vh,560px);overflow:auto;padding:13px;border:1px solid #d9d5e8;border-radius:14px;background:rgba(255,255,255,.97);box-shadow:0 14px 38px rgba(25,18,55,.2)}
    strong{display:block;color:#573f9d;margin-bottom:7px}details{border-top:1px solid #ebe8f1;padding:7px 0}summary{cursor:pointer;font-weight:700;color:#413856}
    p{margin:7px 0;color:#5e5968}input[type=search]{box-sizing:border-box;width:100%;padding:7px 8px;border:1px solid #ccc5db;border-radius:7px;margin:6px 0}
    button{display:block;width:100%;border:0;background:#f5f2ff;color:#40346c;text-align:left;padding:6px 7px;margin:3px 0;border-radius:6px;cursor:pointer}
    dl{margin:7px 0}dt{font-weight:700;color:#4d397e}dd{margin:2px 0 8px;color:#625d6b}label{display:flex;gap:7px;align-items:center;padding:4px 0}
  `;
  shadow.append(style, panel);
  document.documentElement.appendChild(host);
}

function reconcileTrustedFeatures(state) {
  document.querySelectorAll("[data-pageflow-form-issue]").forEach((node) => node.removeAttribute("data-pageflow-form-issue"));
  if (!state.regionVisibilityPanel) {
    document.querySelectorAll("[data-pageflow-user-hidden]").forEach((node) => node.removeAttribute("data-pageflow-user-hidden"));
  }
  reconcileTranslations(state);
  reconcileImageViewer(state.imageViewer);
  reconcileKeyboardNavigation(state.keyboardNavigation);
  reconcileToolsPanel(state);
}

function safeImageUrl(value) {
  try {
    const url = new URL(value, location.href);
    if (["http:", "https:", "blob:"].includes(url.protocol)) return url.href;
    if (url.protocol === "data:" && /^data:image\/(?:png|jpeg|webp|gif);/i.test(String(value))) return String(value);
    return "";
  } catch {
    return "";
  }
}

function extractRebuildDocument(state) {
  const root = document.querySelector("article, main, [role='main']") || document.body;
  const allParagraphs = readableParagraphs(root);
  const paragraphIds = new Map(allParagraphs.map((paragraph, index) => [paragraph, `p${index + 1}`]));
  const groups = [{ heading: "", blocks: [] }];
  const nodes = Array.from(root?.querySelectorAll("h2, h3, p, ul, ol, blockquote, table, img") || []).slice(0, 220);
  let current = groups[0];
  let imageIndex = 0;

  nodes.forEach((node) => {
    if (node.matches("h2, h3")) {
      const heading = cleanContextText(node.textContent, 180);
      if (!heading) return;
      current = { heading, blocks: [] };
      groups.push(current);
      return;
    }
    if (node.matches("p")) {
      if (node.closest("li, blockquote, td, th")) return;
      const text = cleanContextText(node.textContent, 1200);
      if (text.length >= 24) current.blocks.push({ type: "paragraph", text, paragraphId: paragraphIds.get(node) || "" });
      return;
    }
    if (node.matches("ul, ol")) {
      if (node.parentElement?.closest("ul, ol")) return;
      const items = Array.from(node.querySelectorAll(":scope > li")).slice(0, 16).map((item) => cleanContextText(item.textContent, 300)).filter(Boolean);
      if (items.length) current.blocks.push({ type: "list", ordered: node.tagName === "OL", items });
      return;
    }
    if (node.matches("blockquote")) {
      const text = cleanContextText(node.textContent, 700);
      if (text) current.blocks.push({ type: "quote", text });
      return;
    }
    if (node.matches("table")) {
      const rows = Array.from(node.rows || []).slice(0, 14).map((row) => Array.from(row.cells || []).slice(0, 8).map((cell) => cleanContextText(cell.textContent, 180)));
      if (rows.length) current.blocks.push({ type: "table", rows });
      return;
    }
    if (node.matches("img") && !state.hideImages) {
      const src = safeImageUrl(node.currentSrc || node.src);
      if (src && Number(node.naturalWidth || 0) >= 180) {
        imageIndex += 1;
        current.blocks.push({ type: "image", imageId: `img${imageIndex}`, src, alt: cleanContextText(node.alt, 180) });
      }
    }
  });

  return {
    title: cleanContextText(document.querySelector("h1")?.textContent || document.title, 240),
    site: cleanContextText(location.hostname, 120),
    groups: groups.filter((group) => group.heading || group.blocks.length).slice(0, 28)
  };
}

const GENERATED_HTML_TAGS = new Set([
  "main", "article", "section", "aside", "nav", "header", "footer", "div", "span",
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol", "li", "blockquote",
  "pre", "code", "strong", "em", "b", "i", "small", "mark", "figure", "figcaption",
  "img", "table", "caption", "thead", "tbody", "tfoot", "tr", "th", "td", "details",
  "summary", "hr", "br", "a", "dl", "dt", "dd"
]);
const GENERATED_HTML_DANGEROUS_TAGS = new Set([
  "script", "style", "iframe", "object", "embed", "form", "input", "button", "textarea",
  "select", "option", "meta", "link", "base", "svg", "math", "canvas", "video", "audio",
  "source", "template"
]);
const GENERATED_ROLES = new Set(["main", "article", "region", "navigation", "complementary", "note", "list", "listitem", "heading", "img"]);

function cleanGeneratedToken(value) {
  return /^[a-z][a-z0-9_-]{0,48}$/i.test(String(value || "")) ? String(value) : "";
}

function neutralizeGeneratedMarkup(value) {
  return sanitizeGeneratedSource(value, 40000)
    .replace(/<\s*(script|style|iframe|object|embed|svg|math|video|audio|form|select|textarea|canvas|template)\b[\s\S]*?<\/\s*\1\s*>/gi, "")
    .replace(/<\s*\/?(?:script|style|iframe|object|embed|svg|math|video|audio|form|select|textarea|canvas|template)\b[^>]*>/gi, "")
    .replace(/<\s*\/?(?:link|meta|base|source|input|button|option)\b[^>]*>/gi, "")
    .replace(/\s(?:src|srcset|href|xlink:href|poster|data|action|formaction|style|on[a-z]+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

function sanitizeGeneratedMarkup(source, data) {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(neutralizeGeneratedMarkup(source), "text/html");
  const imageMap = new Map(data.groups.flatMap((group) => group.blocks)
    .filter((block) => block.type === "image" && block.imageId && block.src)
    .map((block) => [block.imageId, block]));

  Array.from(parsed.body.querySelectorAll("*")).forEach((element) => {
    const tag = element.tagName.toLowerCase();
    if (GENERATED_HTML_DANGEROUS_TAGS.has(tag)) {
      element.remove();
      return;
    }
    if (!GENERATED_HTML_TAGS.has(tag)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }

    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value;
      if (name === "class") {
        const classes = value.split(/\s+/).map(cleanGeneratedToken).filter(Boolean).slice(0, 12);
        if (classes.length) element.setAttribute("class", classes.join(" "));
        else element.removeAttribute(attribute.name);
      } else if (name === "id") {
        const id = cleanGeneratedToken(value);
        if (id) element.id = id;
        else element.removeAttribute(attribute.name);
      } else if (["aria-label", "aria-labelledby", "aria-describedby", "title", "alt"].includes(name)) {
        element.setAttribute(name, cleanContextText(value, 180));
      } else if (name === "role" && GENERATED_ROLES.has(value)) {
        element.setAttribute("role", value);
      } else if (["colspan", "rowspan"].includes(name) && ["td", "th"].includes(tag)) {
        element.setAttribute(name, String(clamp(value, 1, 12, 1)));
      } else if (name === "open" && tag === "details") {
        element.setAttribute("open", "");
      } else if (name === "href" && tag === "a" && /^#[a-z][a-z0-9_-]{0,48}$/i.test(value)) {
        element.setAttribute("href", value);
      } else if (name === "data-pageflow-image" && tag === "img" && /^img\d{1,3}$/.test(value)) {
        element.setAttribute(name, value);
      } else {
        element.removeAttribute(attribute.name);
      }
    });

    if (tag === "img") {
      const block = imageMap.get(element.getAttribute("data-pageflow-image"));
      if (!block) {
        element.remove();
        return;
      }
      element.alt = cleanContextText(element.alt || block.alt || "Page image", 180);
      element.loading = "lazy";
      element.referrerPolicy = "no-referrer";
      element.src = block.src;
    }
  });

  const fragment = document.createDocumentFragment();
  Array.from(parsed.body.childNodes).forEach((node) => fragment.appendChild(document.importNode(node, true)));
  return {
    fragment,
    textLength: cleanContextText(parsed.body.textContent, 50000).length,
    elementCount: parsed.body.querySelectorAll("*").length,
    headingCount: parsed.body.querySelectorAll("h1, h2, h3, h4, h5, h6").length,
    landmarkCount: parsed.body.querySelectorAll("main, article, section").length
  };
}

function validateCustomDocumentState(state, data = extractRebuildDocument(state)) {
  if (state.rebuildLayout !== "custom") return null;
  if (!state.generatedHtml.trim()) throw new Error("Claude did not return custom HTML for this design.");
  const result = sanitizeGeneratedMarkup(state.generatedHtml, data);
  const sourceTextLength = data.groups.flatMap((group) => [group.heading, ...group.blocks.flatMap((block) => {
    if (block.text) return [block.text];
    if (block.items) return block.items;
    if (block.rows) return block.rows.flat();
    return [];
  })]).join(" ").length;
  const minimumTextLength = Math.min(2000, Math.max(120, Math.floor(sourceTextLength * 0.25)));
  if (result.textLength < minimumTextLength || result.elementCount < 3 || !result.headingCount || !result.landmarkCount) {
    throw new Error("The generated document did not contain enough safe page content.");
  }
  return result;
}

function parseRenderedColor(value) {
  const rgb = String(value || "").match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i);
  if (rgb) return { channels: rgb.slice(1, 4).map(Number), alpha: rgb[4] === undefined ? 1 : Number(rgb[4]) };
  const srgb = String(value || "").match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/i);
  if (srgb) return { channels: srgb.slice(1, 4).map((channel) => Number(channel) * 255), alpha: srgb[4] === undefined ? 1 : Number(srgb[4]) };
  if (/^#[0-9a-f]{6}$/i.test(String(value || ""))) {
    return { channels: String(value).slice(1).match(/.{2}/g).map((channel) => parseInt(channel, 16)), alpha: 1 };
  }
  return null;
}

function renderedContrast(first, second) {
  const luminance = (color) => {
    const linear = color.channels.map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

function enforceGeneratedAccessibility(root, foreground, background) {
  const fallbackText = parseRenderedColor(foreground);
  const fallbackBackground = parseRenderedColor(background);
  Array.from(root.querySelectorAll("*")).forEach((element) => {
    const hasDirectText = Array.from(element.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim());
    if (!hasDirectText) return;
    const style = getComputedStyle(element);
    const tag = element.tagName.toLowerCase();
    const minimumSize = tag === "h1" ? 32 : tag === "h2" ? 24 : tag === "h3" ? 20 : ["small", "figcaption"].includes(tag) ? 14 : 16;
    const fontSize = parseFloat(style.fontSize);
    if (!Number.isFinite(fontSize) || fontSize < minimumSize) {
      element.style.setProperty("font-size", `${minimumSize}px`, "important");
    }
    const effectiveFontSize = Math.max(minimumSize, Number.isFinite(fontSize) ? fontSize : minimumSize);
    const lineHeight = parseFloat(style.lineHeight);
    if (!Number.isFinite(lineHeight) || lineHeight / effectiveFontSize < 1.4) {
      element.style.setProperty("line-height", "1.5", "important");
    }

    let backgroundColor = null;
    let parent = element;
    while (parent && parent !== root.parentElement) {
      const candidate = parseRenderedColor(getComputedStyle(parent).backgroundColor);
      if (candidate && candidate.alpha >= 0.95) {
        backgroundColor = candidate;
        break;
      }
      parent = parent.parentElement;
    }
    backgroundColor ||= fallbackBackground;
    const textColor = parseRenderedColor(style.color);
    if (!textColor || !backgroundColor || renderedContrast(textColor, backgroundColor) < 4.5) {
      const black = parseRenderedColor("#111111");
      const white = parseRenderedColor("#ffffff");
      const accessibleFallback = fallbackText && renderedContrast(fallbackText, backgroundColor) >= 4.5
        ? foreground
        : renderedContrast(black, backgroundColor) >= renderedContrast(white, backgroundColor) ? "#111111" : "#ffffff";
      element.style.setProperty("color", accessibleFallback, "important");
    }
  });
}

function buildAiContentModel() {
  const data = extractRebuildDocument(DEFAULT_STATE);
  const groups = [];
  let remaining = 26000;
  let full = true;

  for (const group of data.groups) {
    const nextGroup = { heading: group.heading, blocks: [] };
    for (const block of group.blocks) {
      const safeBlock = block.type === "image"
        ? { type: "image", imageId: block.imageId, alt: block.alt }
        : block;
      const size = JSON.stringify(safeBlock).length;
      if (size > remaining) {
        full = false;
        break;
      }
      nextGroup.blocks.push(safeBlock);
      remaining -= size;
    }
    if (nextGroup.heading || nextGroup.blocks.length) groups.push(nextGroup);
    if (!full) break;
  }

  return { title: data.title, groups, truncated: !full };
}

function appendRebuildBlock(container, block, state, translationMap) {
  if (block.type === "paragraph") {
    const paragraph = document.createElement("p");
    paragraph.textContent = block.text;
    container.appendChild(paragraph);
    const translated = translationMap.get(block.paragraphId);
    if (state.paragraphTranslation && translated) {
      const translation = document.createElement("p");
      translation.className = "translation";
      translation.textContent = translated;
      container.appendChild(translation);
    }
  } else if (block.type === "list") {
    const list = document.createElement(block.ordered ? "ol" : "ul");
    block.items.forEach((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      list.appendChild(item);
    });
    container.appendChild(list);
  } else if (block.type === "quote") {
    const quote = document.createElement("blockquote");
    quote.textContent = block.text;
    container.appendChild(quote);
  } else if (block.type === "image") {
    const figure = document.createElement("figure");
    const image = document.createElement("img");
    image.src = block.src;
    image.alt = block.alt;
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    figure.appendChild(image);
    container.appendChild(figure);
  } else if (block.type === "table") {
    const wrapper = document.createElement("div");
    wrapper.className = "table-wrap";
    const table = document.createElement("table");
    block.rows.forEach((cells, rowIndex) => {
      const row = document.createElement("tr");
      cells.forEach((text) => {
        const cell = document.createElement(rowIndex === 0 ? "th" : "td");
        cell.textContent = text;
        row.appendChild(cell);
      });
      table.appendChild(row);
    });
    wrapper.appendChild(table);
    container.appendChild(wrapper);
  }
}

function renderRebuildView(state, preview = false) {
  document.getElementById("pageflow-rebuild-host")?.remove();
  if (!document.body) return;
  const data = extractRebuildDocument(state);
  const customResult = state.rebuildLayout === "custom" ? validateCustomDocumentState(state, data) : null;
  const isCustom = Boolean(customResult);
  const translationMap = new Map(state.paragraphTranslations.map((item) => [item.paragraphId, item.text]));
  const host = document.createElement("div");
  host.id = "pageflow-rebuild-host";
  const shadow = host.attachShadow({ mode: "open" });
  const shell = document.createElement("div");
  shell.className = `shell ${state.rebuildLayout} ${state.dyslexiaMode ? "dyslexia" : ""} ${state.lowVisionMode ? "low-vision" : ""}`;
  const toolbar = document.createElement("header");
  toolbar.className = "toolbar";
  const status = document.createElement("span");
  status.textContent = preview
    ? `${isCustom ? "AI Custom HTML" : "Rebuild"} preview — original page is unchanged`
    : isCustom ? "AI Custom HTML view" : "Rebuild view";
  const actions = document.createElement("div");
  const exit = document.createElement("button");
  exit.type = "button";
  exit.textContent = preview ? "Discard" : "Exit rebuild";
  exit.addEventListener("click", async () => {
    if (preview) {
      pendingRebuildState = null;
      host.remove();
      return;
    }
    const previous = { ...currentState };
    const next = sanitizeState({ ...currentState, viewMode: "adapt" });
    applyState(next);
    try {
      await saveState(next);
    } catch {
      applyState(previous);
    }
  });
  actions.appendChild(exit);
  if (preview) {
    const keep = document.createElement("button");
    keep.type = "button";
    keep.className = "primary";
    keep.textContent = "Keep this view";
    keep.addEventListener("click", async () => {
      const previous = { ...currentState };
      const next = sanitizeState(pendingRebuildState || state);
      try {
        await saveState(next);
        aiStateHistory.push(previous);
        if (aiStateHistory.length > 5) aiStateHistory.shift();
        pendingRebuildState = null;
        applyState(next);
      } catch {
        status.textContent = "Could not save this view.";
      }
    });
    actions.appendChild(keep);
  }
  toolbar.append(status, actions);

  const scroll = document.createElement("div");
  scroll.className = "scroll";
  const article = document.createElement("article");
  const title = document.createElement("h1");
  title.textContent = data.title;
  const meta = document.createElement("p");
  meta.className = "meta";
  const wordCount = data.groups.flatMap((group) => group.blocks).filter((block) => block.text).reduce((total, block) => total + block.text.split(/\s+/).length, 0);
  meta.textContent = `${data.site} · ${Math.max(1, Math.ceil(wordCount / 220))} min read`;
  if (!isCustom) article.append(title, meta);

  if (state.pageSearch) {
    const search = document.createElement("input");
    search.className = "search";
    search.type = "search";
    search.placeholder = "Search rebuilt page";
    search.addEventListener("input", () => {
      const query = search.value.trim().toLowerCase();
      const targets = isCustom ? content.querySelectorAll("section, article") : content.querySelectorAll(".group");
      targets.forEach((target) => {
        target.hidden = Boolean(query) && !target.textContent.toLowerCase().includes(query);
      });
    });
    article.appendChild(search);
  }

  if (state.contentSummary && state.summaryText) {
    const summary = document.createElement("section");
    summary.className = "summary";
    const heading = document.createElement("h2");
    heading.textContent = "Key summary";
    const paragraph = document.createElement("p");
    paragraph.textContent = state.summaryText;
    summary.append(heading, paragraph);
    article.appendChild(summary);
  }

  if (state.glossary && state.glossaryItems.length) {
    const glossary = document.createElement("details");
    glossary.className = "glossary";
    const heading = document.createElement("summary");
    heading.textContent = "Glossary";
    const list = document.createElement("dl");
    state.glossaryItems.forEach((item) => {
      const term = document.createElement("dt");
      const definition = document.createElement("dd");
      term.textContent = item.term;
      definition.textContent = item.definition;
      list.append(term, definition);
    });
    glossary.append(heading, list);
    article.appendChild(glossary);
  }

  const content = document.createElement(isCustom ? "div" : "main");
  content.className = isCustom ? "custom-document" : "content";
  if (isCustom) {
    content.appendChild(customResult.fragment);
  } else {
    data.groups.forEach((groupData) => {
      const group = document.createElement("section");
      group.className = "group";
      if (groupData.heading) {
        const heading = document.createElement("h2");
        heading.textContent = groupData.heading;
        group.appendChild(heading);
      }
      groupData.blocks.forEach((block) => appendRebuildBlock(group, block, state, translationMap));
      content.appendChild(group);
    });
  }
  article.appendChild(content);
  scroll.appendChild(article);
  shell.append(toolbar, scroll);

  if (state.imageViewer) {
    content.querySelectorAll("img").forEach((image) => {
      image.tabIndex = 0;
      image.title = "Click to enlarge";
      const openImage = () => {
        const lightbox = document.createElement("button");
        lightbox.type = "button";
        lightbox.className = "lightbox";
        lightbox.setAttribute("aria-label", "Close image viewer");
        const previewImage = image.cloneNode();
        lightbox.appendChild(previewImage);
        lightbox.addEventListener("click", () => lightbox.remove());
        shell.appendChild(lightbox);
      };
      image.addEventListener("click", openImage);
      image.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") openImage();
      });
    });
  }

  if (state.keyboardNavigation) {
    scroll.tabIndex = 0;
    scroll.addEventListener("keydown", (event) => {
      if (!event.altKey || !["ArrowDown", "ArrowUp"].includes(event.key)) return;
      const headings = Array.from(content.querySelectorAll("h1, h2, h3"));
      if (!headings.length) return;
      event.preventDefault();
      const currentIndex = headings.findIndex((heading) => heading.getBoundingClientRect().top > 64);
      const index = event.key === "ArrowDown"
        ? Math.min(headings.length - 1, currentIndex < 0 ? headings.length - 1 : currentIndex)
        : Math.max(0, (currentIndex < 0 ? headings.length : currentIndex) - 1);
      headings[index].scrollIntoView({ behavior: state.reduceMotion ? "auto" : "smooth", block: "start" });
    });
  }

  if (state.tableOfContents) {
    const toc = document.createElement("details");
    toc.open = true;
    toc.className = "toc";
    const label = document.createElement("summary");
    label.textContent = "On this page";
    toc.appendChild(label);
    const tocHeadings = isCustom
      ? content.querySelectorAll("h1, h2, h3")
      : content.querySelectorAll(".group > h2");
    Array.from(tocHeadings).slice(0, 24).forEach((heading) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = heading.textContent;
      button.addEventListener("click", () => heading.scrollIntoView({ behavior: state.reduceMotion ? "auto" : "smooth" }));
      toc.appendChild(button);
    });
    shell.appendChild(toc);
  }

  if (state.readingProgress || state.readingTime) {
    const progress = document.createElement("span");
    progress.className = "progress";
    shell.appendChild(progress);
    scroll.addEventListener("scroll", () => {
      const total = Math.max(1, scroll.scrollHeight - scroll.clientHeight);
      progress.style.width = `${Math.min(100, scroll.scrollTop / total * 100)}%`;
    }, { passive: true });
  }

  if (state.backToTop) {
    const top = document.createElement("button");
    top.type = "button";
    top.className = "top";
    top.textContent = "↑";
    top.setAttribute("aria-label", "Back to top");
    top.addEventListener("click", () => scroll.scrollTo({ top: 0, behavior: state.reduceMotion ? "auto" : "smooth" }));
    shell.appendChild(top);
  }

  const background = state.customBackground || "#fbfaf7";
  const foreground = state.customText || "#25232a";
  const requestedAccent = state.customAccent || "#6950b8";
  const accent = contrastRatio(background, requestedAccent) >= 4.5 ? requestedAccent : foreground;
  const accentInk = contrastRatio(accent, "#ffffff") >= 4.5 ? "#ffffff" : "#111111";
  const width = state.readingWidth || 820;
  const style = document.createElement("style");
  style.textContent = `
    :host{all:initial;position:fixed;inset:0;z-index:2147483647;color:${foreground};background:${background};font:16px/1.72 Georgia,serif}
    *{box-sizing:border-box}.shell{position:absolute;inset:0;background:${background};color:${foreground}}.scroll{position:absolute;inset:50px 0 0;overflow:auto}
    .toolbar{height:50px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 16px;background:#17151d;color:#fff;font:13px Arial,sans-serif;box-shadow:0 2px 12px #0003}
    .toolbar div{display:flex;gap:8px}.toolbar button{border:1px solid #5b5666;border-radius:8px;padding:7px 11px;background:#292630;color:#fff;cursor:pointer}.toolbar .primary{background:${accent};border-color:${accent};color:${accentInk}}
    article{width:min(${width}px,calc(100% - 40px));margin:0 auto;padding:48px 0 90px}h1{font-size:clamp(34px,6vw,66px);line-height:1.05;letter-spacing:-.035em;margin:0 0 12px}.meta{color:color-mix(in srgb,${foreground} 62%,transparent);font:13px Arial,sans-serif;margin:0 0 30px}
    h2{font-size:1.45em;line-height:1.2;color:${accent};margin:0 0 14px}p,li{font-size:1em}blockquote{border-inline-start:4px solid ${accent};margin:24px 0;padding:8px 18px;background:color-mix(in srgb,${accent} 8%,transparent)}
    .content{display:grid;gap:${state.sectionGap || 28}px}.group{min-width:0}.cards .content,.magazine .content{grid-template-columns:repeat(2,minmax(0,1fr))}.cards .group{padding:24px;border:1px solid color-mix(in srgb,${accent} 25%,transparent);border-radius:${state.cornerRadius || 16}px;background:color-mix(in srgb,${background} 94%,${accent})}.magazine .group:first-child{grid-column:1/-1}
    figure{margin:24px 0}img{max-width:100%;height:auto;border-radius:${state.cornerRadius || 12}px}.lightbox{position:fixed;inset:0;z-index:8;display:grid;place-items:center;width:100%;height:100%;border:0;background:#08090dee;padding:24px;cursor:zoom-out}.lightbox img{max-width:94vw;max-height:90vh;object-fit:contain;box-shadow:0 20px 70px #000}.table-wrap{max-width:100%;overflow:auto}table{border-collapse:collapse;width:100%;font:14px Arial,sans-serif}th,td{border:1px solid color-mix(in srgb,${foreground} 22%,transparent);padding:9px;text-align:start}
    .summary,.glossary{padding:18px 20px;margin:24px 0;border-radius:12px;background:color-mix(in srgb,${accent} 10%,${background})}.summary h2{font-size:1.05em}.glossary summary{cursor:pointer;font-weight:700}.glossary dt{font-weight:700;color:${accent}}.glossary dd{margin:3px 0 12px}.translation{font-family:Arial,sans-serif;font-size:.9em;padding:.7em;border-inline-start:3px solid ${accent};background:color-mix(in srgb,${accent} 8%,transparent)}
    .search{width:100%;padding:11px 13px;margin:4px 0 20px;border:1px solid color-mix(in srgb,${foreground} 25%,transparent);border-radius:9px;background:${background};color:${foreground}}
    .toc{position:fixed;right:18px;top:72px;width:220px;max-height:55vh;overflow:auto;padding:12px;border:1px solid color-mix(in srgb,${accent} 25%,transparent);border-radius:12px;background:color-mix(in srgb,${background} 96%,${accent});box-shadow:0 12px 36px #0002;font:12px Arial,sans-serif}.toc summary{font-weight:700;margin-bottom:6px;cursor:pointer}.toc button{display:block;width:100%;border:0;background:transparent;color:${foreground};padding:5px;text-align:start;cursor:pointer}
    .progress{position:fixed;top:50px;left:0;height:4px;width:0;background:${accent};z-index:3}.top{position:fixed;right:22px;bottom:22px;width:44px;height:44px;border:0;border-radius:50%;background:${accent};color:${accentInk};font-size:22px;cursor:pointer}
    .dyslexia{font-family:"Atkinson Hyperlegible",Verdana,Arial,sans-serif;letter-spacing:.045em;word-spacing:.1em}.low-vision{font-size:20px}.low-vision :focus-visible{outline:4px solid ${accent};outline-offset:3px}
    .custom-document{--pf-background:${background};--pf-text:${foreground};--pf-accent:${accent};--pf-surface:color-mix(in srgb,${background} 92%,${accent});--pf-muted:${foreground};display:block;min-height:100%;padding:0;color:var(--pf-text);background:var(--pf-background);font:16px/1.6 Arial,sans-serif}
    .custom-document *{box-sizing:border-box}.custom-document img{max-width:100%;height:auto}.custom-document table{max-width:100%}.custom-document a{color:var(--pf-accent);text-decoration:underline}.custom-document :focus-visible{outline:3px solid var(--pf-accent);outline-offset:3px}
    ${isCustom ? state.generatedCss : ""}
    .custom-document h1,.custom-document h2,.custom-document h3,.custom-document h4,.custom-document h5,.custom-document h6,.custom-document a{color:var(--pf-accent)}.custom-document mark,.custom-document code,.custom-document pre{color:var(--pf-text);background:var(--pf-surface)}
    @media(max-width:1000px){.toc{display:none}}@media(max-width:760px){.cards .content,.magazine .content{grid-template-columns:1fr}article{width:min(100% - 28px,${width}px);padding-top:30px}.toolbar span{max-width:55%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
  `;
  shadow.append(style, shell);
  document.documentElement.appendChild(host);
  if (isCustom) {
    requestAnimationFrame(() => {
      if (host.isConnected) enforceGeneratedAccessibility(content, foreground, background);
    });
  }
}

function reconcileBuiltInFeatures(state) {
  if (state.viewMode === "rebuild") {
    reconcileTableOfContents(false);
    reconcileReadingProgress(false);
    reconcileBackToTop(false);
    clearFeatureArtifacts();
    renderRebuildView(state, false);
    return;
  }

  if (!pendingRebuildState) document.getElementById("pageflow-rebuild-host")?.remove();
  reconcileTableOfContents(state.tableOfContents);
  reconcileReadingProgress(state.readingProgress || state.readingTime);
  reconcileBackToTop(state.backToTop);
  reconcileTrustedFeatures(state);
}

function applyState(nextState) {
  currentState = sanitizeState(nextState);
  ensureStyles();

  const pageState = currentState.viewMode === "adapt" ? currentState : DEFAULT_STATE;
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
    "pageflow-highlight-headings",
    "pageflow-hide-videos",
    "pageflow-simple-tables",
    "pageflow-dyslexia",
    "pageflow-low-vision"
  ];
  root.classList.remove(...classes);

  root.classList.toggle("pageflow-font-size", pageState.fontScale !== DEFAULT_STATE.fontScale);
  root.classList.toggle("pageflow-line-height", pageState.lineHeight !== DEFAULT_STATE.lineHeight);
  root.classList.toggle("pageflow-filter", themeFilter(pageState) !== "none");
  root.classList.toggle("pageflow-warm", pageState.theme === "warm");
  root.classList.toggle("pageflow-readable-font", pageState.readableFont);
  root.classList.toggle("pageflow-underlined-links", pageState.underlineLinks);
  root.classList.toggle("pageflow-hide-images", pageState.hideImages);
  root.classList.toggle("pageflow-grayscale-images", pageState.grayscaleImages);
  root.classList.toggle("pageflow-reduce-motion", pageState.reduceMotion);
  root.classList.toggle("pageflow-focus", pageState.focusMode);
  root.classList.toggle("pageflow-reading-width", pageState.readingWidth > 0);
  root.classList.toggle("pageflow-sidebar-hide", pageState.sidebarMode === "hide");
  root.classList.toggle("pageflow-sidebar-dim", pageState.sidebarMode === "dim");
  root.classList.toggle("pageflow-navigation-hide", pageState.navigationMode === "hide");
  root.classList.toggle("pageflow-navigation-dim", pageState.navigationMode === "dim");
  root.classList.toggle("pageflow-navigation-compact", pageState.navigationMode === "compact");
  root.classList.toggle("pageflow-header-hide", pageState.headerMode === "hide");
  root.classList.toggle("pageflow-header-compact", pageState.headerMode === "compact");
  root.classList.toggle("pageflow-footer-hide", pageState.footerMode === "hide");
  root.classList.toggle("pageflow-paragraph-spacing", pageState.paragraphSpacing > 0);
  root.classList.toggle("pageflow-page-padding", pageState.pagePadding > 0);
  root.classList.toggle("pageflow-custom-background", Boolean(pageState.customBackground));
  root.classList.toggle("pageflow-custom-text", Boolean(pageState.customText));
  root.classList.toggle("pageflow-custom-accent", Boolean(pageState.customAccent));
  root.classList.toggle("pageflow-font-sans", pageState.fontStyle === "sans");
  root.classList.toggle("pageflow-font-serif", pageState.fontStyle === "serif");
  root.classList.toggle("pageflow-font-mono", pageState.fontStyle === "mono");
  root.classList.toggle("pageflow-text-left", pageState.textAlign === "left");
  root.classList.toggle("pageflow-text-center", pageState.textAlign === "center");
  root.classList.toggle("pageflow-text-justify", pageState.textAlign === "justify");
  root.classList.toggle("pageflow-layout-reading", pageState.layoutPreset === "reading");
  root.classList.toggle("pageflow-layout-cards", pageState.layoutPreset === "cards");
  root.classList.toggle("pageflow-layout-workspace", pageState.layoutPreset === "workspace");
  root.classList.toggle("pageflow-highlight-headings", pageState.highlightHeadings);
  root.classList.toggle("pageflow-hide-videos", pageState.hideVideos);
  root.classList.toggle("pageflow-simple-tables", pageState.simplifyTables);
  root.classList.toggle("pageflow-dyslexia", pageState.dyslexiaMode);
  root.classList.toggle("pageflow-low-vision", pageState.lowVisionMode);

  root.style.setProperty("--pageflow-font-scale", `${pageState.fontScale}%`);
  root.style.setProperty("--pageflow-line-height", String(pageState.lineHeight));
  root.style.setProperty("--pageflow-filter", themeFilter(pageState));
  root.style.setProperty("--pageflow-reading-width", `${pageState.readingWidth}px`);
  root.style.setProperty("--pageflow-paragraph-spacing", `${pageState.paragraphSpacing}px`);
  root.style.setProperty("--pageflow-page-padding", `${pageState.pagePadding}px`);
  root.style.setProperty("--pageflow-background", pageState.customBackground || "#ffffff");
  root.style.setProperty("--pageflow-text", pageState.customText || "#1f2430");
  root.style.setProperty("--pageflow-accent", pageState.customAccent || "#7254ec");
  root.style.setProperty("--pageflow-layout-width", `${pageState.readingWidth || 760}px`);
  root.style.setProperty("--pageflow-section-gap", `${pageState.sectionGap || 20}px`);
  root.style.setProperty("--pageflow-corner-radius", `${pageState.cornerRadius || 14}px`);

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
  const paragraphs = readableParagraphs(primaryContent)
    .slice(0, 32)
    .map((paragraph, index) => ({
      id: `p${index + 1}`,
      text: cleanContextText(paragraph.textContent, 520)
    }));

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
    paragraphs,
    sections: sectionSummaries(),
    contentModel: buildAiContentModel(),
    availableFeatures: Object.entries(FEATURE_REGISTRY).map(([id, definition]) => ({
      id,
      label: definition.label,
      modes: definition.modes
    })),
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
    try {
      const proposedState = sanitizeState({ ...currentState, ...message.patch });
      validateCustomDocumentState(proposedState);
      const patch = {};
      Object.keys(message.patch || {}).forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(DEFAULT_STATE, key)) patch[key] = proposedState[key];
      });
      sendResponse({ ok: true, patch });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
    return;
  }

  if (message?.type === "PAGEFLOW_GET_FEATURES") {
    sendResponse({
      ok: true,
      features: Object.entries(FEATURE_REGISTRY).map(([id, definition]) => ({ id, ...definition }))
    });
    return;
  }

  if (message?.type === "PAGEFLOW_PREVIEW_REBUILD") {
    try {
      pendingRebuildState = sanitizeState({ ...currentState, ...message.patch, viewMode: "rebuild" });
      validateCustomDocumentState(pendingRebuildState);
      renderRebuildView(pendingRebuildState, true);
      sendResponse({ ok: true, state: pendingRebuildState });
    } catch (error) {
      pendingRebuildState = null;
      sendResponse({ ok: false, error: error.message });
    }
    return;
  }

  if (message?.type === "PAGEFLOW_CANCEL_REBUILD_PREVIEW") {
    if (pendingRebuildState) document.getElementById("pageflow-rebuild-host")?.remove();
    pendingRebuildState = null;
    sendResponse({ ok: true });
    return;
  }

  if (message?.type === "PAGEFLOW_SET_STATE") {
    const previousState = { ...currentState };
    const nextState = sanitizeState({ ...currentState, ...message.patch });
    saveState(nextState)
      .then(() => {
        aiStateHistory.length = 0;
        pendingRebuildState = null;
        applyState(nextState);
        sendResponse({ ok: true, state: nextState, canUndo: false });
      })
      .catch((error) => {
        applyState(previousState);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message?.type === "PAGEFLOW_APPLY_AI_PLAN") {
    const previousState = { ...currentState };
    const nextState = sanitizeState({ ...currentState, ...message.patch });
    try {
      validateCustomDocumentState(nextState);
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
      return;
    }
    saveState(nextState)
      .then(() => {
        aiStateHistory.push(previousState);
        if (aiStateHistory.length > 5) aiStateHistory.shift();
        pendingRebuildState = null;
        applyState(nextState);
        sendResponse({ ok: true, state: nextState, canUndo: true });
      })
      .catch((error) => {
        applyState(previousState);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message?.type === "PAGEFLOW_UNDO_AI_PLAN") {
    const previousState = aiStateHistory[aiStateHistory.length - 1];
    if (!previousState) {
      sendResponse({ ok: false, error: "There is no AI change to undo." });
      return;
    }
    saveState(previousState)
      .then(() => {
        aiStateHistory.pop();
        pendingRebuildState = null;
        applyState(previousState);
        sendResponse({ ok: true, state: previousState, canUndo: aiStateHistory.length > 0 });
      })
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "PAGEFLOW_RESET") {
    saveState(DEFAULT_STATE)
      .then(() => {
        aiStateHistory.length = 0;
        pendingRebuildState = null;
        applyState(DEFAULT_STATE);
        sendResponse({ ok: true, state: { ...DEFAULT_STATE } });
      })
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});
