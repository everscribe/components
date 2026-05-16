# @everscribe/components-element

Framework-agnostic `<audit-trail>` custom element for [Everscribe](https://everscribe.io) audit events. Drop the tag into any HTML, in any framework — plain JS, Vue, Svelte, Solid, Angular — and you get the same live, scoped audit trail UI you'd get from the React component.

Part of [@everscribe/components](https://github.com/everscribe/components#readme) — see the root README for token minting, refresh chain, theming, security, rate limits, claim-driven UI, and other shared concepts.

## Install

```bash
npm install @everscribe/components-element @everscribe/components-styles
```

The element registers itself as `<audit-trail>` on import (idempotent — safe to import in multiple bundles). The styles package ships the CSS theme; install it alongside.

## Quick start (plain HTML)

```html
<link rel="stylesheet" href="https://unpkg.com/@everscribe/components-styles/default.css">
<script type="module">
  import '@everscribe/components-element'
</script>

<audit-trail token-endpoint="/api/embed-token"></audit-trail>
```

`token-endpoint` is a route on **your** server (not Everscribe's) that returns a freshly minted embed token. The element fetches it on mount, holds it in memory, and re-fetches from the same endpoint on 401. Your project API key never touches the browser. See [Minting tokens](https://github.com/everscribe/components#minting-tokens-your-backend) for the backend side.

If you have a token already, pass it directly:

```html
<audit-trail token="eyJhbGciOi..." token-endpoint="/api/embed-token"></audit-trail>
```

Pass `token-endpoint` alongside `token` so refresh on 401 still works.

## Vue / Svelte / Solid

Custom elements are first-class in these frameworks. The tag works as written, attributes flow normally, and `audit-trail-error` integrates with each framework's event syntax.

```vue
<!-- Vue -->
<audit-trail token-endpoint="/api/embed-token" @audit-trail-error="handleError" />
```

```svelte
<!-- Svelte -->
<audit-trail token-endpoint="/api/embed-token" on:audit-trail-error={handleError} />
```

```jsx
{/* Solid */}
<audit-trail token-endpoint="/api/embed-token" on:audit-trail-error={handleError} />
```

For React 18, prefer [`@everscribe/components-react`](../react#readme) — React 18's custom-element interop has known rough edges around prop conventions and synthetic events.

## Attributes

At least one of `token`, `token-endpoint`, or the JS-only `onTokenExpired` property is required.

| Attribute | Type | Default | Notes |
|---|---|---|---|
| `token` | string | — | Embed JWT. If omitted, the element fetches one via `token-endpoint`/`onTokenExpired` on mount. |
| `token-endpoint` | string | — | URL on your backend that returns `{ token }` JSON. Used for the initial fetch (when `token` is omitted) and for refresh on 401. Sent with `credentials: 'include'`. |
| `api-base` | string | `https://api.everscribe.io/v1/embed` | Base URL for read endpoints. Override for local dev or self-hosted. |
| `page-size` | number | `25` | Events per page. |
| `poll-interval` | number | `5000` | Poll cadence in ms. `<= 0` disables polling. Below `1000` is clamped with a `console.warn`. |
| `theme` | `light` \| `dark` | `light` | Switches the CSS-variable theme. |
| `default-time-range` | `24h` \| `7d` \| `30d` \| `all` | `all` | Initial time-range preset (read at mount only). |

Style and class come from the standard `class` and `style` attributes. The element renders into its own light DOM, so the CSS in `@everscribe/components-styles/default.css` applies the same way it does for the React component.

## Persistence

Column visibility and filter state are persisted to `localStorage` automatically and restored on reload. Two keys are written, both namespaced by the token's project ID (`sub` claim) and tenant ID (`tenant_id` claim, or `_` when unset):

- `audit-trail:cols:{sub}:{tenant_id}` — the list of *hidden* columns. Stored as hidden (not visible) so future-added columns appear by default for returning users.
- `audit-trail:filters:{sub}:{tenant_id}` — the active filter state (`FilterValues`): time range, column filters, free-text actor/target/origin inputs, the active DSL query, and the last NLP echo fields.

Behavior:
- Restored after the bootstrap token fetch resolves, so the very first request to `/events` already reflects the user's last session.
- localStorage failures (private browsing, quota exceeded, malformed JSON) are silently swallowed — the element falls through to the default-time-range attribute and empty filters.
- Token claims that restrict columns (`columns` claim set) take precedence over restored hidden columns; the restored list can only narrow the claim-allowed set, never escape it.
- Two `<audit-trail>` instances on the same page sharing the same `sub` + `tenant_id` will share persisted state. This is a degenerate case (the same view embedded twice) and generally desirable when it does happen.

## Properties (JS only)

These can't be expressed as attributes; set them on the element directly via JS.

| Property | Type | Notes |
|---|---|---|
| `onTokenExpired` | `() => Promise<string>` | Custom token-fetch callback. Takes precedence over `token-endpoint`. |
| `refresh()` | `() => void` | Public method. Triggers a full re-bootstrap (fresh token fetch + fresh stores). |

```js
const el = document.querySelector('audit-trail')
el.onTokenExpired = async () => {
  const res = await fetch('/api/embed-token', { credentials: 'include' })
  const { token } = await res.json()
  return token
}
```

## Events

| Event | `detail` | Notes |
|---|---|---|
| `audit-trail-error` | `{ error: Error }` | Bubbles. Fired on fetch errors that surface from the events store (network, server, expired token after refresh chain exhausted). |

```js
document.querySelector('audit-trail').addEventListener('audit-trail-error', (e) => {
  console.error(e.detail.error)
})
```

## License

MIT
