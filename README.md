# @everscribe/react

Embeddable React component for [Everscribe](https://everscribe.io) audit events.

Drop `<EverscribeEvents />` into your customer-facing app, hand it a short-lived embed token, and your end-users see a live, scoped view of their audit trail. The token's claims define what they can see — tenant, columns, actions — and the server enforces that scope on every read.

Zero runtime dependencies beyond `react` and `react-dom`.

## Install

```bash
npm install @everscribe/react
```

Peer dependencies: `react >=18`, `react-dom >=18`.

## Quick start

```tsx
import { EverscribeEvents } from '@everscribe/react'
import '@everscribe/react/styles.css'

export function AuditPage({ token }: { token: string }) {
  return <EverscribeEvents token={token} />
}
```

The `token` is a short-lived JWT minted on **your** backend. The component never sees your project API key, only the token.

## How it fits together

```
[your backend] ──mint──> token ──passes to──> [your frontend] ──Bearer──> [Everscribe API]
```

1. **Your backend** holds the project API key (`evs_<32hex>`). Use `sdk-go/pkg/auditor` to mint short-lived embed tokens.
2. **Your frontend** fetches a token from a route you expose, then passes it to `<EverscribeEvents />`.
3. **The Everscribe API** verifies the token on every read and scopes results to its claims.

The API key never touches the browser. Tokens do, and they're designed for it: short TTL, narrow scope, read-only.

## Minting tokens (backend)

```go
import (
    "github.com/everscribe/sdk-go"
    "github.com/everscribe/sdk-go/pkg/auditor"
)

es, _ := everscribe.New(projectID, apiKey)
aud := es.NewAuditor()

token, err := aud.MintToken(ctx, auditor.TokenOptions{
    TenantID:       "acme-corp",
    ExpiresIn:      time.Hour,
    AllowedColumns: []string{"occurred_at", "action", "actor"},
    AllowedActions: []string{"user.*", "billing.invoice.created"},
})
```

Expose a thin route on your backend that returns the same `{ token, expires_at, expires_in }` shape `MintToken` produces. Your frontend fetches it via your own auth (session cookie, etc.) and hands the token to the component. See the [sdk-go README](https://github.com/everscribe/sdk-go#embedded-views) for full API docs.

## Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `token` | `string` | — | **Required.** Embed JWT. |
| `apiBase` | `string` | `https://everscribe.io/api/v1/embed` | Base URL for read endpoints. Override for local dev or self-hosted. |
| `pageSize` | `number` | `25` | Events per page. |
| `pollInterval` | `number` | `5000` | Poll cadence in ms. `<= 0` disables polling. Below `1000` is clamped with a `console.warn`. |
| `theme` | `'light' \| 'dark'` | `'light'` | Switches the CSS-variable theme. |
| `className` | `string` | — | Merged onto the root element. |
| `style` | `CSSProperties` | — | Inline style on the root. Use to override CSS variables at runtime. |
| `tokenEndpoint` | `string` | — | URL the component will GET on 401 to fetch a fresh token. Sent with `credentials: 'include'`. Expects `{ token }` JSON. |
| `onTokenExpired` | `() => Promise<string>` | — | Custom refresh callback. Takes precedence over `tokenEndpoint`. |
| `onError` | `(err: Error) => void` | — | Observability hook for fetch errors. |

## Token refresh

The component can't mint its own tokens — your API key isn't in the browser. On a 401, it falls through this chain:

1. If `onTokenExpired` is set — call it, swap the returned token, retry.
2. Else if `tokenEndpoint` is set — `fetch(tokenEndpoint, { credentials: 'include' })`, expect `{ token }`, retry.
3. Otherwise — render a "Session expired" state.

If your token endpoint uses the same session-cookie auth as the rest of your app, refresh is silent.

## Theming

Brand-match by overriding CSS variables. The simplest path:

```css
.my-app .evs-root {
  --evs-accent: #ff6b35;
  --evs-radius: 10px;
  --evs-font-family: 'Inter', sans-serif;
}
```

Tokens exposed (all on `.evs-root`):

| Token | Default (light) |
|---|---|
| `--evs-bg` | `#ffffff` |
| `--evs-fg` | `#1f2328` |
| `--evs-fg-muted` | `#656d76` |
| `--evs-border` | `#d0d7de` |
| `--evs-border-strong` | `#afb8c1` |
| `--evs-surface` | `#f6f8fa` |
| `--evs-surface-hover` | `#eaeef2` |
| `--evs-accent` | `#0969da` |
| `--evs-accent-fg` | `#ffffff` |
| `--evs-danger` | `#cf222e` |
| `--evs-overlay` | `rgba(0, 0, 0, 0.5)` |
| `--evs-font-family` | system sans stack |
| `--evs-font-mono` | system mono stack |
| `--evs-font-size` | `14px` |
| `--evs-font-size-sm` | `12px` |
| `--evs-line-height` | `1.5` |
| `--evs-spacing-xs` | `4px` |
| `--evs-spacing-sm` | `8px` |
| `--evs-spacing` | `12px` |
| `--evs-spacing-lg` | `16px` |
| `--evs-spacing-xl` | `24px` |
| `--evs-radius-sm` | `4px` |
| `--evs-radius` | `6px` |
| `--evs-shadow` | `0 8px 24px rgba(0, 0, 0, 0.12)` |

`.evs-theme-dark` swaps the color tokens to a dark palette.

When variables aren't enough, override class names directly: `.evs-table`, `.evs-th`, `.evs-row`, `.evs-cell`, `.evs-cell-{column}`, `.evs-detail-panel`, `.evs-detail-row-{column}`, etc.

## Token storage

Tokens are short-lived precisely so in-memory storage is viable.

| Storage | OK? |
|---|---|
| Component state / React context | ✅ |
| `sessionStorage` (survives in-tab navigation, cleared on tab close) | ✅ |
| `localStorage` | ❌ XSS-exfiltratable |
| URL query params | ❌ logged in history, server logs, referers |

## Rate limits

The read API caps at **60 requests per minute per token (`jti`)**. The default `pollInterval={5000}` yields 12 req/min, well under the cap.

If you need parallel-tab budget, mint a fresh token per page load — each tab gets its own bucket. Caching one token across five tabs polling at 5s already saturates the limit.

## Claim-driven UI

| Claim | UX |
|---|---|
| `tenant_id` | Hard-pinned. No tenant switcher. |
| `columns` | Column picker lists only whitelisted columns. End-users can hide further; they can't reveal anything outside the whitelist. |
| `actions` | Action dropdown lists each claim entry verbatim — exact (`user.login`) and wildcard (`user.*`) both render as one option. |

When a claim is omitted, the component behaves like the unrestricted UI for that dimension.

> **Heads up — action filter pagination.** v1 filters actions client-side, so a narrow filter on a sparsely-matching action may need several "Load more" clicks to fill the next batch. The token's `actions` ceiling is always enforced server-side; this only affects within-claim narrowing.

## SSR / Next.js

The component is marked `'use client'` — drop it into a Server Component tree as-is. The detail drawer mounts after hydration via a portal to `document.body`, so SSR output is unaffected.

## Required event fields

If you set `columns` on the token, include at least `id`, `occurred_at`, and `action` — the component uses `id` for dedup and detail keying, `occurred_at` for the polling cursor, and `action` for the row label and detail title.

## License

[MIT](LICENSE)
