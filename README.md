# PageFlow AI

PageFlow AI is a build-free Chrome and Edge Manifest V3 extension for adjusting webpage appearance and accessibility. It provides reliable one-click controls, per-website preferences, local natural-language shortcuts, and optional integration with OpenAI-compatible APIs and the native Anthropic Claude Messages API.

Version: `1.5.2`

## Features

- Original, Warm, and Contrast page themes
- One-click image hiding and grayscale images
- Readable fonts and highlighted links
- Reading Focus and Reduced Motion modes
- Text size, line spacing, saturation, brightness, and reading-width controls
- Settings saved separately for each website origin
- One-click website reset
- English natural-language shortcuts that work without an API
- Page-aware GenAI customization through OpenAI-compatible or Anthropic Claude APIs
- Filtered page models containing semantic regions, section summaries, headings, limited visible text, and basic appearance
- AI-selectable Reading, Cards, and Workspace layout presets
- AI-selectable custom background, text, and accent colors, font style, alignment, spacing, and corner radius
- Trusted built-in Table of Contents, Reading Progress, Back to Top, and heading-highlight features
- Review, Apply, Dismiss, and Undo controls for AI proposals
- Adapt mode for controlled changes to the existing page
- Rebuild Preview mode that renders a sanitized reading view inside an isolated Shadow DOM without replacing the source page
- AI Custom HTML mode for prompt-specific semantic HTML and scoped CSS, with tag, attribute, property, URL, font-size, and contrast safeguards
- A trusted Feature Registry for search, reading time, summaries, glossary explanations, paragraph translations, simplified tables, image viewing, video hiding, accessibility modes, keyboard navigation, form audits, and region visibility

The Dark theme is not included in this version.

## Install the extension

1. Open `chrome://extensions/` in Chrome or `edge://extensions/` in Edge.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `AI-Extension-Development` directory.
5. Open or refresh a regular HTTP or HTTPS webpage.
6. Click the PageFlow AI icon in the browser toolbar.

After editing the extension code, click **Reload** on the extension management page and refresh the webpage being tested.

Browser-internal pages such as `chrome://extensions/` and browser extension stores cannot be modified by the extension.

## Use quick controls

All buttons, switches, and sliders work without an API configuration.

The prompt field also supports local English commands such as:

```text
Make the text larger and hide images.
```

```text
Use warm colors and reduce motion.
```

```text
Use a narrow reading width.
```

When no API endpoint is configured, the popup displays **Local rules**. These commands are matched against built-in keywords and do not contact a GenAI service.

## Choose a page mode

- **Adapt** applies validated style and trusted-feature settings to the existing page after review.
- **Rebuild preview** extracts safe text, headings, lists, tables, and selected images into an isolated reading view. The source DOM remains in place. Use **Keep this view** inside the preview to save it, or **Discard** to return without saving.
- **AI Custom HTML** asks the connected model for a unique semantic document and layout CSS based on the prompt and filtered page content model. It is sanitized, scoped to the isolated preview, and accessibility-guarded before display.

Rebuild supports Reading, Magazine, and Cards layouts. It never copies scripts, event handlers, forms, or arbitrary page HTML.

Custom HTML supports substantially more structural freedom than the presets: grid, flexbox, multi-column editorial layouts, custom section hierarchy, cards, side notes, visual grouping, local typography, tables, quotes, and mapped page images. It does not support generated JavaScript, forms, external resources, event handlers, or style attributes.

The rebuilt page now includes **Use original page** and an **Original page controls** panel. AI Custom HTML can also place mapped buttons and in-page navigation links. Selecting a mapped button reveals and focuses the matching live control, where you complete the action. A floating **Return to PageFlow view** button restores the design. This preserves access to original forms, menus, media players, and site scripts without copying their code into the generated document. The original page remains available while you navigate within the same browser tab. Controls inside cross-origin iframes or closed Shadow DOM are reached with **Use original page**.

Custom HTML is bound to the page path where it was generated. Following a link to a different path keeps the original site usable; generate a new custom design for that page if needed. Preset Rebuild views can still rebuild new pages from their current content.

Custom requests use a compact semantic content model to avoid sending duplicate page excerpts. They may take longer than preset changes, so the extension allows up to 180 seconds and shows progress messages while Claude produces the complete JSON, HTML, and CSS response.

Example custom request:

```text
Create a distinctive Swiss editorial layout for this page with an asymmetric grid,
a strong typographic hierarchy, a compact contents rail, pull quotes, and clearly
grouped supporting sections. Preserve the meaning and keep normal text accessible.
```

Example request:

```text
Rebuild this article as a magazine layout. Add search, a collapsible contents panel,
reading time, a short summary, glossary explanations, and paragraph translations.
```

## Trusted Feature Registry

AI can enable only registered features implemented by the extension:

- collapsible table of contents, page search, reading time/progress, and back to top
- grounded summary text, glossary items, and paragraph translations
- simplified tables, Alt-click image viewer, and video hiding
- Dyslexia-friendly and Low Vision presentation modes
- Alt+Up/Down heading navigation
- missing-form-label audit
- semantic-region visibility controls

Generated summary, glossary, and translation data is accepted only as length-limited plain text.

## Connect a GenAI service

Click **AI settings** at the bottom of the popup and choose **OpenAI-compatible** or **Anthropic Claude**. The official endpoint is filled automatically when the provider changes, and a trusted custom proxy endpoint may still be entered.

### OpenAI-compatible connection for personal testing

Enter the following values:

```text
API endpoint:
https://api.openai.com/v1/chat/completions
```

```text
Model name:
A Chat Completions-compatible model available to your OpenAI account
```

```text
API key:
Your personal development API key
```

Click **Save and authorize**, then approve the browser permission request for the API origin.

### Anthropic Claude connection for personal testing

Choose **Anthropic Claude**. The extension automatically fills:

```text
https://api.anthropic.com/v1/messages
```

Enter a Claude model ID available in your Anthropic Console and your Anthropic API key, then click **Save and authorize**.

See the official [Anthropic Messages API reference](https://docs.anthropic.com/en/api/messages) for the native request format.

Open a regular webpage, refresh it, and open PageFlow AI. Enter a page-customization request in the **Describe your ideal page** field and press Enter or click the send button.

For example:

```text
Increase the text size, improve line spacing, and hide images.
```

If the request succeeds, the popup displays **Claude connected** for Anthropic or **AI connected** for an OpenAI-compatible provider and shows a sanitized proposal. Review the summary and settings, then choose **Apply changes** or **Dismiss**. After applying a proposal, **Undo last AI change** restores the previous state.

The current version is a page-customization command interface rather than a general-purpose chatbot. It does not maintain multi-turn conversation history.

See the official [OpenAI Chat Completions API reference](https://developers.openai.com/api/reference/chat/completions/create) for the request format and the [OpenAI API authentication reference](https://developers.openai.com/api/reference/overview) for credential guidance.

## Supported AI settings

The GenAI service can return only the following page settings:

| Setting | Type | Allowed values |
| --- | --- | --- |
| `theme` | string | `original`, `warm`, `contrast` |
| `hideImages` | boolean | `true` or `false` |
| `grayscaleImages` | boolean | `true` or `false` |
| `readableFont` | boolean | `true` or `false` |
| `underlineLinks` | boolean | `true` or `false` |
| `reduceMotion` | boolean | `true` or `false` |
| `focusMode` | boolean | `true` or `false` |
| `fontScale` | number | 80–160 |
| `lineHeight` | number | 1.2–2.2 |
| `saturation` | number | 0–200 |
| `brightness` | number | 60–140 |
| `readingWidth` | number | 0 or 480–1200 |
| `sidebarMode` | string | `original`, `hide`, `dim` |
| `navigationMode` | string | `original`, `hide`, `dim`, `compact` |
| `headerMode` | string | `original`, `hide`, `compact` |
| `footerMode` | string | `original`, `hide` |
| `paragraphSpacing` | number | 0–40 |
| `pagePadding` | number | 0–48 |
| `layoutPreset` | string | `original`, `reading`, `cards`, `workspace` |
| `customBackground` | string | empty or six-digit hex color |
| `customText` | string | empty or six-digit hex color |
| `customAccent` | string | empty or six-digit hex color |
| `fontStyle` | string | `original`, `sans`, `serif`, `mono` |
| `textAlign` | string | `original`, `left`, `center`, `justify` |
| `sectionGap` | number | 0–48 |
| `cornerRadius` | number | 0–32 |
| `tableOfContents` | boolean | trusted built-in feature |
| `readingProgress` | boolean | trusted built-in feature |
| `backToTop` | boolean | trusted built-in feature |
| `highlightHeadings` | boolean | `true` or `false` |
| `viewMode` | string | `adapt`, `rebuild` |
| `rebuildLayout` | string | `reading`, `magazine`, `cards`, `custom` |
| Trusted feature flags | boolean | search, reading tools, content aids, media, accessibility, keyboard, audit, and region tools |
| `summaryText` | string | plain text, maximum 1200 characters |
| `glossaryItems` | array | maximum 16 validated term/definition objects |
| `paragraphTranslations` | array | maximum 24 validated paragraph-ID/text objects |
| `generatedHtml` | string | Custom mode only; semantic fragment, maximum 40,000 characters, sanitized before rendering |
| `generatedCss` | string | Custom mode only; allowlisted scoped rules, maximum 20,000 characters |

AI output is sanitized by `content-script.js` before it is displayed for review and again when it is applied.

This version cannot use GenAI to:

- move individual arbitrary DOM nodes or rewrite page content
- generate or execute JavaScript
- inject unsanitized HTML/CSS into the source page
- invent a new executable feature that is not implemented as a trusted built-in
- submit forms or perform account actions
- access browser-internal pages

## How the AI request works

```text
Prompt field
    -> popup.js requests a filtered page summary
    -> content-script.js analyzes the rendered page
    -> service-worker.js
    -> configured OpenAI-compatible or Claude endpoint
    -> JSON design proposal
    -> content-script.js validation
    -> popup review (Apply or Dismiss)
    -> content-script.js validation
    -> Adapt renderer, preset Rebuild, OR sanitized Custom HTML preview
    -> Keep/Discard confirmation for Rebuild
```

The extension sends the user's request, selected mode, current PageFlow settings, hostname/path without query parameters, inferred page type, semantic-region statistics, up to 18 redacted section summaries, headings, up to 32 numbered paragraph excerpts, a limited visible-text excerpt, registered feature metadata, basic computed appearance, and a capped semantic content model. The content model contains extracted text, hierarchy, tables, lists, image placeholders, alt text, and labels for up to 40 visible page controls—not the source page HTML, image URLs, link destinations, or input values. It never sends form values, cookies, local storage, query strings, or URL fragments.

In Custom mode, the returned HTML is parsed as an inert document. Scripts, forms, embeds, SVG, inline styles, event attributes, unknown image URLs, and unsupported elements are removed. Generated buttons are retained only when their control ID matches a real original-page control; clicking them shows that control on the live page without triggering its action. CSS is reduced to reviewed layout and presentation properties, prefixed to the generated document, and rendered inside the extension's Shadow DOM. Accessibility rules enforce safe palette contrast, readable body text, heading minimums, and usable line height.

The model is instructed to return a JSON object. A typical response looks like:

```json
{
  "summary": "A focused reading layout with gentle colors and navigation aids.",
  "settings": {
    "viewMode": "rebuild",
    "rebuildLayout": "reading",
    "customBackground": "#fffaf0",
    "customText": "#2f2a24",
    "customAccent": "#7556b8",
    "fontScale": 115,
    "tableOfContents": true,
    "pageSearch": true,
    "readingTime": true,
    "contentSummary": true,
    "summaryText": "A concise summary grounded in the supplied page context."
  }
}
```

## API key security

Directly saving an API key in this extension is intended only for personal development.

The current version stores the configuration in `chrome.storage.local`. The key is not automatically included when another person installs a separate copy of the extension, but it can be read by someone who has sufficient access to the same device, browser profile, or extension debugging tools.

Before distributing the extension:

- move the provider API key to your own backend proxy
- authenticate extension users with your backend
- add per-user quotas and rate limiting
- use HTTPS
- restrict backend CORS and extension origins
- add usage monitoring, spend alerts, and a privacy policy
- never hardcode a provider API key in extension source files

## Troubleshooting

### The popup displays Local rules

No API endpoint is currently saved. Open **AI settings** and save the endpoint, model name, and development API key.

### API request failed (401)

The API key is missing, invalid, expired, or not authorized for the selected service.

### API request failed (404)

Check the API endpoint and model name. The configured model must be available from that endpoint.

### API request failed (429)

Check API billing, available credits, project limits, and rate limits.

### The AI did not return valid settings

The model response was not valid JSON in the format expected by `service-worker.js`. Try a simpler page-customization request or use a compatible model or proxy.

### The page does not change

- Confirm the active tab is a regular HTTP or HTTPS webpage.
- Reload the extension.
- Refresh the webpage.
- Try one of the quick controls to verify the content script is connected.

## Project structure

- `manifest.json`: extension metadata and permissions
- `popup.html`, `popup.css`, `popup.js`: toolbar interface and interactions
- `content-script.js`: page styling, validation, and per-site persistence
- `service-worker.js`: local-rule, OpenAI-compatible, and Anthropic Claude adapters
- `options.html`, `options.css`, `options.js`: AI configuration page
- `PLANNING.md`: product roadmap, architecture, testing, and release plan
- `icons/`: extension icons
- `scripts/`: development utilities
- `tests/`: dependency-free state-schema and provider-adapter tests
- `package.json`: repeatable `npm test` and `npm run check` commands

## Development checks

```text
npm test
npm run check
```

The checks validate strict state handling, trusted feature content, generated-CSS security rules, popup/content schema parity, Claude custom-mode request shape, JavaScript syntax, and timeout wiring.

## Development roadmap

See [PLANNING.md](./PLANNING.md) for the product scope, target backend architecture, delivery phases, testing plan, security requirements, risks, and definition of done.

## Before publishing

- Replace direct provider access with an authenticated backend proxy.
- Review website access permissions and Content Security Policy.
- Test content sites, single-page applications, documentation, shopping, and video websites.
- Complete keyboard, screen-reader, zoom, reduced-motion, and contrast testing.
- Prepare a privacy policy, support documentation, store assets, and release notes.
- Perform a security review and scan the package for credentials.
