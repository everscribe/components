<p align="center">
  <img src="https://raw.githubusercontent.com/everscribe/components/main/assets/everscribe.svg" alt="Everscribe" height="64">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@everscribe/components-styles"><img src="https://img.shields.io/npm/v/@everscribe/components-styles.svg" alt="npm"></a>
  <a href="https://github.com/everscribe/components/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
</p>

# @everscribe/components-styles

Default theme stylesheet for [@everscribe/components-react](https://github.com/everscribe/components/tree/main/packages/react#readme) and [@everscribe/components-element](https://github.com/everscribe/components/tree/main/packages/element#readme). Required by both - install it alongside whichever component package you're using.

Part of [@everscribe/components](https://github.com/everscribe/components#readme).

## Install

```bash
npm install @everscribe/components-styles
```

No build step, no JS - it's a static `.css` file.

## Usage

```ts
import '@everscribe/components-styles/default.css'
```

Or via a `<link>` tag for plain HTML:

```html
<link rel="stylesheet" href="https://unpkg.com/@everscribe/components-styles/default.css">
```

## Theming via CSS variables

Brand-match by overriding CSS variables on `.audit-trail-root`:

```css
.my-app .audit-trail-root {
  --audit-trail-accent: #ff6b35;
  --audit-trail-radius: 10px;
  --audit-trail-font-family: 'Inter', sans-serif;
}
```

All variables (light theme defaults):

| Token | Default |
|---|---|
| `--audit-trail-bg` | `#ffffff` |
| `--audit-trail-fg` | `#1f2328` |
| `--audit-trail-fg-muted` | `#656d76` |
| `--audit-trail-border` | `#d0d7de` |
| `--audit-trail-border-strong` | `#afb8c1` |
| `--audit-trail-surface` | `#f6f8fa` |
| `--audit-trail-surface-hover` | `#eaeef2` |
| `--audit-trail-accent` | `#0969da` |
| `--audit-trail-accent-fg` | `#ffffff` |
| `--audit-trail-danger` | `#cf222e` |
| `--audit-trail-overlay` | `rgba(0, 0, 0, 0.5)` |
| `--audit-trail-font-family` | system sans stack |
| `--audit-trail-font-mono` | system mono stack |
| `--audit-trail-font-size` | `14px` |
| `--audit-trail-font-size-sm` | `12px` |
| `--audit-trail-line-height` | `1.5` |
| `--audit-trail-spacing-xs` | `4px` |
| `--audit-trail-spacing-sm` | `8px` |
| `--audit-trail-spacing` | `12px` |
| `--audit-trail-spacing-lg` | `16px` |
| `--audit-trail-spacing-xl` | `24px` |
| `--audit-trail-radius-sm` | `4px` |
| `--audit-trail-radius` | `6px` |
| `--audit-trail-shadow` | `0 8px 24px rgba(0, 0, 0, 0.12)` |

## Dark theme

Swap to dark by setting the `theme="dark"` attribute on `<audit-trail>`, the `theme="dark"` prop on `<AuditTrail>`, or by manually applying the `.audit-trail-theme-dark` class to the root element. The class swaps the color tokens to a dark palette; spacing/sizing/radius tokens are unchanged.

## Class hooks

When CSS variables aren't enough, override class names directly. The full surface of stable, public classes:

- Root / portal: `.audit-trail-root`, `.audit-trail-portal`, `.audit-trail-theme-light`, `.audit-trail-theme-dark`
- Toolbar: `.audit-trail-toolbar`, `.audit-trail-toolbar-spacer`, `.audit-trail-live`, `.audit-trail-live-dot`
- Filter toggle: `.audit-trail-filter-toggle`, `.audit-trail-filter-toggle-badge`, `.audit-trail-filter-toggle-caret`
- Filters panel: `.audit-trail-filter-panel`, `.audit-trail-filter-tabs`, `.audit-trail-filter-tab`, `.audit-trail-filter-tab-selected`, `.audit-trail-filter-row`, `.audit-trail-filter-field`, `.audit-trail-filter-field-label`, `.audit-trail-filter-input`, `.audit-trail-filter-actor-input`, `.audit-trail-filter-select`, `.audit-trail-filter-actions`
- Picker: `.audit-trail-picker`, `.audit-trail-picker-summary`, `.audit-trail-picker-content`, `.audit-trail-picker-item`
- Table: `.audit-trail-table`, `.audit-trail-th`, `.audit-trail-th-{column}`, `.audit-trail-row`, `.audit-trail-cell`, `.audit-trail-cell-{column}`, `.audit-trail-cell-presence`, `.audit-trail-status`, `.audit-trail-status-{kind}`
- States: `.audit-trail-state`, `.audit-trail-state-loading`, `.audit-trail-state-error`, `.audit-trail-state-empty`
- Buttons: `.audit-trail-button`, `.audit-trail-button-secondary`, `.audit-trail-load-more`
- Inspect modal: `.audit-trail-inspect-backdrop`, `.audit-trail-inspect-modal`, `.audit-trail-inspect-close`, `.audit-trail-inspect-title`, `.audit-trail-inspect-subtitle`, `.audit-trail-inspect-tabs`, `.audit-trail-inspect-tab`, `.audit-trail-inspect-tab-active`, `.audit-trail-inspect-panel`
- Code block / copy: `.audit-trail-code-block`, `.audit-trail-code-block-wrap`, `.audit-trail-copy-button`
- Diff: `.audit-trail-diff-wrap`, `.audit-trail-diff-table`, `.audit-trail-diff-cell`, `.audit-trail-diff-before-{same|removed|blank}`, `.audit-trail-diff-after-{same|added|blank}`
- Export modal: `.audit-trail-export-backdrop`, `.audit-trail-export-modal`, `.audit-trail-export-title`, `.audit-trail-export-blurb`, `.audit-trail-export-options`, `.audit-trail-export-card`, `.audit-trail-export-card-selected`, `.audit-trail-export-card-title`, `.audit-trail-export-card-body`, `.audit-trail-export-actions`, `.audit-trail-export-error`

These are part of the public API; they're not renamed casually.

## License

MIT
