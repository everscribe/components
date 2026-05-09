# @everscribe/components-react

Embeddable React component for [Everscribe](https://everscribe.io) audit events.

Drop `<AuditTrail />` into your customer-facing app, hand it a short-lived embed token, and your end-users see a live, scoped view of their audit trail. The token's claims define what they can see — tenant, columns, actions — and the server enforces that scope on every read.

Zero runtime dependencies beyond `react` and `react-dom`.

## Install

```bash
npm install @everscribe/components-react
```

Peer dependencies: `react >=18`, `react-dom >=18`.

## Quick start

```tsx
import { AuditTrail } from '@everscribe/components-react'
import '@everscribe/components-styles/default.css'

export function AuditPage() {
  return <AuditTrail tokenEndpoint="https://yourbackend.com/api/embed-token" />
}
```

Where `https://yourbackend.com/api/embed-token` is a route on **your** server (not Everscribe's) that returns a freshly minted embed token. The component fetches it on mount, holds it in memory, and re-fetches from the same endpoint on 401. Your project API key never touches the browser.

If your React app and backend share an origin, a relative path (`/api/embed-token`) works too.

If you'd rather control the initial fetch yourself — explicit loading states, integration with an auth context, or a token already in hand — pass it as the `token` prop:

```tsx
import { useEffect, useState } from 'react'
import { AuditTrail } from '@everscribe/components-react'
import '@everscribe/components-styles/default.css'

export function AuditPage() {
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    fetch('https://yourbackend.com/api/embed-token', { credentials: 'include' })
      .then((r) => r.json())
      .then(({ token }) => setToken(token))
  }, [])

  if (!token) return <div>Loading…</div>
  return <AuditTrail token={token} tokenEndpoint="https://yourbackend.com/api/embed-token" />
}
```

Pass `tokenEndpoint` (or `onTokenExpired`) alongside `token` so refresh on 401 still works.

If you pass none of `token`, `tokenEndpoint`, or `onTokenExpired`, the component renders a configuration error.

## Minting tokens (your backend)

The `tokenEndpoint` from the examples above is a route on your backend that mints a token via [sdk-go](https://github.com/everscribe/sdk-go) and returns it to the frontend:

```go
import (
    "encoding/json"
    "log"
    "net/http"
    "time"

    "github.com/everscribe/sdk-go"
    "github.com/everscribe/sdk-go/pkg/minter"
)

func main() {
    es, err := everscribe.New(projectID, apiKey)
    if err != nil {
        log.Fatal(err)
    }
    m := es.NewMinter()

    http.HandleFunc("GET /api/embed-token", handleEmbedToken(m))
    log.Fatal(http.ListenAndServe(":8080", nil))
}

// handleEmbedToken returns a handler that mints a fresh embed token for the
// authenticated user. The React component calls this on mount and on 401.
func handleEmbedToken(m *minter.Client) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        user, err := authenticate(r) // your normal session-cookie auth
        if err != nil {
            http.Error(w, "unauthorized", http.StatusUnauthorized)
            return
        }

        token, err := m.MintToken(r.Context(), minter.TokenOptions{
            TenantID:       user.TenantID,
            ExpiresIn:      time.Hour,
            AllowedColumns: []string{"occurred_at", "action", "actor"},
            AllowedActions: []string{"user.*", "billing.invoice.created"},
        })
        if err != nil {
            http.Error(w, "mint failed", http.StatusInternalServerError)
            return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{"token": token})
    }
}
```

The component reads `token` from the response. You can include additional fields (`expires_at`, etc.) if your own UI needs them — the component ignores them.

See the [sdk-go README](https://github.com/everscribe/sdk-go#embedded-views) for full SDK docs.

## How it fits together

```
[your backend] ──mint──> token ──passes to──> [your frontend] ──Bearer──> [Everscribe API]
```

1. **Your backend** holds the project API key (`evs_<32hex>`). Use `sdk-go/pkg/minter` to mint short-lived embed tokens.
2. **Your frontend** fetches a token from a route you expose, then passes it to `<AuditTrail />`.
3. **The Everscribe API** verifies the token on every read and scopes results to its claims.

The API key never touches the browser. Tokens do, and they're designed for it: short TTL, narrow scope, read-only.

## Props

At least one of `token`, `tokenEndpoint`, or `onTokenExpired` is required.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `token` | `string` | — | Embed JWT. If omitted, the component fetches one via `tokenEndpoint`/`onTokenExpired` on mount. |
| `tokenEndpoint` | `string` | — | URL on your backend that returns `{ token }` JSON. Used for the initial fetch (when `token` is omitted) and for refresh on 401. Sent with `credentials: 'include'`. |
| `onTokenExpired` | `() => Promise<string>` | — | Custom token-fetch callback. Takes precedence over `tokenEndpoint`. |
| `apiBase` | `string` | `https://api.everscribe.io/v1/embed` | Base URL for read endpoints. Override for local dev or self-hosted. |
| `pageSize` | `number` | `25` | Events per page. |
| `pollInterval` | `number` | `5000` | Poll cadence in ms. `<= 0` disables polling. Below `1000` is clamped with a `console.warn`. |
| `theme` | `'light' \| 'dark'` | `'light'` | Switches the CSS-variable theme. |
| `className` | `string` | — | Merged onto the root element. |
| `style` | `CSSProperties` | — | Inline style on the root. Use to override CSS variables at runtime. |
| `onError` | `(err: Error) => void` | — | Observability hook for fetch errors. |

## Token refresh

On a 401, the component falls through this chain:

1. If `onTokenExpired` is set — call it, swap the returned token, retry.
2. Else if `tokenEndpoint` is set — `fetch(tokenEndpoint, { credentials: 'include' })`, expect `{ token }`, retry.
3. Otherwise — render a "Session expired" state.

If your token endpoint uses the same session-cookie auth as the rest of your app, refresh is silent. The same chain handles initial token loading when `token` isn't provided as a prop.

## Theming

Brand-match by overriding CSS variables. The simplest path:

```css
.my-app .audit-trail-root {
  --audit-trail-accent: #ff6b35;
  --audit-trail-radius: 10px;
  --audit-trail-font-family: 'Inter', sans-serif;
}
```

Tokens exposed (all on `.audit-trail-root`):

| Token | Default (light) |
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

`.audit-trail-theme-dark` swaps the color tokens to a dark palette.

When variables aren't enough, override class names directly: `.audit-trail-table`, `.audit-trail-th`, `.audit-trail-row`, `.audit-trail-cell`, `.audit-trail-cell-{column}`, `.audit-trail-detail-panel`, `.audit-trail-detail-row-{column}`, etc.

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
