<p align="center">
  <img src="https://raw.githubusercontent.com/everscribe/components/main/assets/everscribe.svg" alt="Everscribe" height="64" align="middle">
  &nbsp;&nbsp;<b>+</b>&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/everscribe/components/main/assets/react.svg" alt="React" height="56" align="middle">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@everscribe/components-react"><img src="https://img.shields.io/npm/v/@everscribe/components-react.svg" alt="npm"></a>
  <a href="https://github.com/everscribe/components/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
</p>

# @everscribe/components-react

Embeddable React component for [Everscribe](https://everscribe.io) audit events. Drop `<AuditTrail />` into your app, hand it a short-lived embed token, and your users see a live, scoped view of their audit trail.

Part of [@everscribe/components](https://github.com/everscribe/components#readme). Token minting, the refresh chain, theming, security, rate limits, and claim-driven UI are covered in the [web components guide](https://everscribe.io/docs/web-components/overview).

## Install

```bash
npm install @everscribe/components-react @everscribe/components-styles
```

Peer dependencies: `react >=18`, `react-dom >=18`. The `components-styles` package ships the default CSS theme; install it alongside.

## Quick start

```tsx
import { AuditTrail } from '@everscribe/components-react'
import '@everscribe/components-styles/default.css'

export function AuditPage() {
  return <AuditTrail tokenEndpoint="https://yourbackend.com/api/embed-token" />
}
```

`tokenEndpoint` is a route on **your** server (not Everscribe's) that returns a freshly minted embed token. The component fetches it on mount, holds it in memory, and re-fetches from the same endpoint on 401. Your project API key never touches the browser. See [Minting tokens](https://everscribe.io/docs/web-components/prerequisites) for the backend side.

If your React app and backend share an origin, a relative path (`/api/embed-token`) works too.

If you'd rather control the initial fetch yourself - explicit loading states, integration with an auth context, or a token already in hand - pass it as the `token` prop:

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

## Props

At least one of `token`, `tokenEndpoint`, or `onTokenExpired` is required.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `token` | `string` | - | Embed JWT. If omitted, the component fetches one via `tokenEndpoint`/`onTokenExpired` on mount. |
| `tokenEndpoint` | `string` | - | URL on your backend that returns `{ token }` JSON. Used for the initial fetch (when `token` is omitted) and for refresh on 401. Sent with `credentials: 'include'`. |
| `onTokenExpired` | `() => Promise<string>` | - | Custom token-fetch callback. Takes precedence over `tokenEndpoint`. |
| `apiBase` | `string` | `https://api.everscribe.io/v1/embed` | Base URL for read endpoints. Override for local dev or self-hosted. |
| `pageSize` | `number` | `25` | Events per page. |
| `pollInterval` | `number` | `5000` | Poll cadence in ms. `<= 0` disables polling. Below `1000` is clamped with a `console.warn`. |
| `theme` | `'light' \| 'dark'` | `'light'` | Switches the CSS-variable theme. |
| `defaultTimeRange` | `'24h' \| '7d' \| '30d' \| 'all'` | `'all'` | Initial time-range preset for the filters panel. |
| `className` | `string` | - | Merged onto the root element. |
| `style` | `CSSProperties` | - | Inline style on the root. Use to override CSS variables at runtime. |
| `onError` | `(err: Error) => void` | - | Observability hook for fetch errors. |

## Persistence

Column visibility and filter state are persisted to `localStorage` automatically and restored on mount. Two keys are written, both namespaced by the token's project ID (`sub` claim) and tenant ID (`tenant_id` claim, or `_` when unset):

- `audit-trail:cols:{sub}:{tenant_id}` - the list of *hidden* columns. Stored as hidden (not visible) so future-added columns appear by default for returning users.
- `audit-trail:filters:{sub}:{tenant_id}` - the active filter state (`FilterValues`): time range, column filters, free-text inputs, the active DSL query, and the last NLP echo fields.

Behavior:
- Restored once the token bootstrap resolves and the JWT is parsed, so the first request to `/events` reflects the user's last session.
- Swapping the `token` prop to a different project re-restores from that project's storage; persistence picks up under the new key.
- localStorage failures (private browsing, quota exceeded, malformed JSON) are silently swallowed - falls through to `defaultTimeRange` and empty filters.
- Token claims that restrict columns (`columns` claim set) take precedence over restored hidden columns.
- Storage keys are identical between this package and `@everscribe/components-element`, so a customer using both adapters under the same origin shares state cleanly.

## SSR / Next.js

The component is marked `'use client'` - drop it into a Server Component tree as-is. The detail drawer mounts after hydration via a portal to `document.body`, so SSR output is unaffected. The persistence `useEffect`s only fire on the client after hydration, so they have no SSR side effects.

## License

MIT
