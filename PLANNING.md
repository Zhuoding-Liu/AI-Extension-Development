# PageFlow AI — Product and Engineering Plan

## 1. Purpose

This document defines the product direction, technical approach, delivery phases, security requirements, and acceptance criteria for PageFlow AI.

PageFlow AI is a Chrome and Edge extension that helps users improve webpage appearance and accessibility through reliable quick controls and optional natural-language customization powered by Generative AI.

## 2. Product goals

- Keep common adjustments available as instant local controls.
- Translate natural-language requests into safe page settings.
- Save preferences separately for each website.
- Remain useful when no AI service is configured.
- Protect API credentials and minimize shared page data.
- Let users reset or undo changes.

## 3. Current baseline

The current `1.1.0` development version provides:

- Original, Warm, and Contrast themes
- image hiding and grayscale images
- readable fonts and highlighted links
- reading focus and reduced motion
- font-size, line-height, saturation, brightness, and reading-width controls
- per-origin settings stored with `chrome.storage.local`
- English local natural-language shortcuts
- optional direct access to OpenAI-compatible and Anthropic Claude APIs

Current AI request flow:

```text
Popup prompt
    -> popup.js
    -> service-worker.js
    -> configured OpenAI-compatible or Claude endpoint
    -> JSON settings
    -> content-script.js validation
    -> webpage styles
```

When no API endpoint is configured, the prompt field uses local keyword rules instead of GenAI.

## 4. Target users

- People who need larger or clearer text
- Users who prefer reduced motion or higher contrast
- Users who want a distraction-reduced reading view
- Students reading long articles
- Developers testing accessibility adjustments

## 5. Core user stories

- As a user, I can apply a common page adjustment with one click.
- As a user, I can describe the page appearance I want in natural language.
- As a user, I can review an AI suggestion before it changes the page.
- As a user, I can undo an AI change or reset the website.
- As a user, my settings remain active when I revisit the same website.
- As a user, I can use quick controls even when AI is unavailable.
- As a user, I am informed about what data is sent to an AI service.

## 6. Scope

### MVP

- Preserve all existing quick controls.
- Support AI responses containing allowlisted page settings.
- Validate every AI-provided value before applying it.
- Show clear configuration and request errors.
- Store settings by website origin.
- Provide a complete reset action.

### Next release

- Server-side AI proxy
- Multi-turn conversation
- Apply, Dismiss, and Undo controls
- Safe page-context summary
- Custom colors and typography settings
- Request limits and abuse protection

### Out of scope until reviewed

- Executing AI-generated JavaScript
- Injecting arbitrary AI-generated HTML or CSS
- Sending complete page HTML to the model
- Collecting passwords, form values, cookies, or tokens
- Automatically submitting forms, purchases, or messages
- Modifying browser-internal pages such as `chrome://`

## 7. Functional requirements

### Quick controls

- Work without an internet connection or API configuration.
- Remain visible when AI features are enabled.
- Update the current page immediately.
- Persist independently for each website.
- Stay synchronized with AI-applied settings.

### AI customization

- Receive a natural-language request and current extension state.
- Return a concise user-facing response.
- Return only supported setting fields.
- Reject or sanitize unsupported values.
- Never return executable page code.
- Allow confirmation before meaningful changes.

### Persistence

- Page settings are keyed by `location.origin`.
- AI configuration is stored separately from page settings.
- Reset restores the complete default state for the current origin.
- Conversation history should be session-scoped by default.

## 8. Allowed customization model

The extension uses a typed state object instead of arbitrary code.

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

Future settings must be added to the default state, server schema, content-script sanitizer, CSS application layer, reset behavior, and tests.

## 9. Target architecture

The current direct API connection is acceptable only for personal development with a restricted test credential. Production should use:

```text
Extension popup
    -> extension service worker
    -> authenticated PageFlow backend
    -> GenAI provider
    -> structured settings response
    -> extension validation
    -> user confirmation
    -> content script
    -> webpage
```

The backend owns credentials, authentication, model selection, output schemas, rate limits, quotas, safe logging, and spend monitoring.

The extension owns the UI, quick controls, minimal page-context collection, state validation, page-style application, persistence, review, undo, and reset actions.

## 10. Security and privacy requirements

- Never hardcode provider API keys in extension source files.
- Never distribute a shared API key inside the extension.
- Use HTTPS for every production backend request.
- Send only data required for customization.
- Treat webpage content as untrusted input.
- Never execute model-provided code.
- Validate model output in both backend and content script.
- Restrict host permissions to the minimum practical scope.
- Add authentication and per-user quotas before public release.
- Provide controls to clear AI configuration and site preferences.

## 11. Delivery roadmap

### Phase 1 — Stable local controls

Status: Complete

- [x] Build the Manifest V3 extension shell.
- [x] Add popup quick controls.
- [x] Add allowlisted state validation.
- [x] Save settings per website.
- [x] Remove the Dark preset.
- [x] Add local English prompt shortcuts.

### Phase 2 — AI development prototype

Status: Current

- [x] Add configurable OpenAI-compatible and Anthropic Claude providers.
- [x] Add provider, model, endpoint, and development-key settings.
- [x] Send prompts through the service worker.
- [x] Parse JSON settings returned by the model.
- [ ] Add clearer connection diagnostics.
- [ ] Test malformed and partial AI responses.

### Phase 3 — Secure AI integration

Status: Planned

- [ ] Move the provider credential to a backend.
- [ ] Replace free-form JSON parsing with a strict output schema.
- [ ] Add a safe page-context summary.
- [ ] Add multi-turn conversation history.
- [ ] Add Apply, Dismiss, and Undo actions.
- [ ] Add backend authentication and rate limiting.

### Phase 4 — Advanced customization

Status: Planned

- [ ] Add custom background, text, and accent colors.
- [ ] Add font-style and text-alignment controls.
- [ ] Add paragraph and letter spacing.
- [ ] Add control corner-radius settings.
- [ ] Add video visibility.
- [ ] Evaluate safe Reading, Study, and Low Vision presets.
- [ ] Add localized natural-language support.

### Phase 5 — Release readiness

Status: Planned

- [ ] Complete Chrome and Edge compatibility testing.
- [ ] Test content, documentation, shopping, and video sites.
- [ ] Complete keyboard and screen-reader testing.
- [ ] Review permissions and Content Security Policy.
- [ ] Add a privacy policy and support documentation.
- [ ] Perform a security review before store submission.

## 12. Testing plan

### State and AI tests

- Clamp every numeric setting to its allowed range.
- Fall back to `original` for invalid themes.
- Ignore unexpected AI properties.
- Restore every default value on reset.
- Verify local prompt rules produce the expected patch.
- Show a visible error for malformed API output.

### Extension integration tests

- Confirm popup controls update an active HTTP or HTTPS tab.
- Confirm settings survive page reloads.
- Confirm different origins keep separate settings.
- Confirm AI requests are sent only after configuration.
- Confirm denied host permission produces a clear message.
- Confirm unsupported browser pages show an explanation.
- Confirm AI settings pass through content-script validation.

### Accessibility tests

- Complete every popup action using only the keyboard.
- Verify visible focus indicators and screen-reader labels.
- Test at 200% browser zoom.
- Confirm reduced motion suppresses animations.
- Check text contrast after every theme change.
- Confirm Reset restores the original presentation.

### Security tests

- Scan the repository for API keys before every release.
- Verify secrets are absent from packaged extension files.
- Reject non-HTTP API URLs.
- Reject unsupported response fields and invalid values.
- Test request-size, rate-limit, authentication, and CORS failures.

## 13. Acceptance criteria

An AI customization feature is complete when:

- A request produces a valid state object or a clear error.
- Unsupported output cannot execute or alter arbitrary page code.
- Existing quick controls work before and after an AI change.
- Users can restore the previous state.
- Settings remain scoped to the current website.
- No provider credential is present in the published extension.
- Syntax, integration, accessibility, and security checks pass.

## 14. Key risks

| Risk | Mitigation |
| --- | --- |
| API key exposure | Keep keys on an authenticated backend |
| Invalid model output | Use structured output and validate twice |
| Prompt injection | Send minimal context and treat it as untrusted |
| Website CSS conflicts | Use scoped classes, CSS variables, and tested presets |
| Excessive permissions | Request optional origins only when needed |
| AI service outage | Keep quick controls and local rules functional |
| Unexpected API cost | Add quotas, rate limits, and spend alerts |

## 15. Open decisions

- Which backend hosting platform will be used?
- Will users bring their own credentials or use PageFlow accounts?
- Which provider should be the default for a public release?
- Which page-context fields are necessary?
- Should every AI proposal require confirmation?
- How long should conversation history be retained?
- Which additional languages should be supported first?

## 16. Definition of done

A roadmap item is done only when implementation, validation, error handling, and relevant tests are complete; security and privacy impacts are reviewed; existing quick controls remain operational; English documentation is updated; and the unpacked extension has been manually tested on a regular webpage.
