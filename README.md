# PageFlow AI

PageFlow AI is a build-free Chrome and Edge Manifest V3 extension for adjusting webpage appearance and accessibility. It provides reliable one-click controls, per-website preferences, local natural-language shortcuts, and optional integration with OpenAI-compatible APIs and the native Anthropic Claude Messages API.

Version: `1.3.0`

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

AI output is sanitized by `content-script.js` before it is displayed for review and again when it is applied.

This version cannot use GenAI to:

- move individual arbitrary DOM nodes or rewrite page content
- generate or execute JavaScript
- inject arbitrary HTML or CSS
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
    -> webpage styles and trusted built-in features
```

The extension sends the user's request, current PageFlow settings, hostname/path without query parameters, inferred page type, semantic-region statistics, up to 18 redacted section summaries, headings, a limited visible-text excerpt, and basic computed appearance. Context is capped before it is sent. It never sends complete page HTML, form values, cookies, local storage, query strings, or URL fragments.

The model is instructed to return a JSON object. A typical response looks like:

```json
{
  "summary": "A focused reading layout with gentle colors and navigation aids.",
  "settings": {
    "layoutPreset": "reading",
    "customBackground": "#fffaf0",
    "customText": "#2f2a24",
    "customAccent": "#7556b8",
    "fontScale": 115,
    "tableOfContents": true,
    "readingProgress": true
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

## Development roadmap

See [PLANNING.md](./PLANNING.md) for the product scope, target backend architecture, delivery phases, testing plan, security requirements, risks, and definition of done.

## Before publishing

- Replace direct provider access with an authenticated backend proxy.
- Review website access permissions and Content Security Policy.
- Test content sites, single-page applications, documentation, shopping, and video websites.
- Complete keyboard, screen-reader, zoom, reduced-motion, and contrast testing.
- Prepare a privacy policy, support documentation, store assets, and release notes.
- Perform a security review and scan the package for credentials.
