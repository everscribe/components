<p align="center">
  <img src="https://raw.githubusercontent.com/everscribe/components/main/assets/everscribe.svg" alt="Everscribe" height="64" align="middle">
  &nbsp;&nbsp;<b>+</b>&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/everscribe/components/main/assets/typescript.svg" alt="TypeScript" height="56" align="middle">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@everscribe/components-core"><img src="https://img.shields.io/npm/v/@everscribe/components-core.svg" alt="npm"></a>
  <a href="https://github.com/everscribe/components/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
</p>

# @everscribe/components-core

Framework-agnostic core for [Everscribe](https://everscribe.io) embeddable audit-trail UI. The data layer behind [`@everscribe/components-react`](https://github.com/everscribe/components/tree/main/packages/react#readme) and [`@everscribe/components-element`](https://github.com/everscribe/components/tree/main/packages/element#readme): the API client, types, JWT parsing, diff renderer, and observable stores that drive the UI.

You usually don't install this directly — install the React or web-component package and you get this transitively. Reach for `core` when you want to **build your own UI** on top of Everscribe's data layer.

Part of [@everscribe/components](https://github.com/everscribe/components#readme). Token minting, the refresh chain, security, and rate limits are covered in the [web components guide](https://everscribe.io/docs/web-components/overview).

## Install

```bash
npm install @everscribe/components-core
```

No peer dependencies; pure TypeScript, runs in browsers and Node 18+.

## Stores

Two observable stores back the UI. Each manages its own lifecycle (initial fetch, polling, abort, dispose) and exposes a `getSnapshot` / `subscribe` interface compatible with React's `useSyncExternalStore` and any other framework's reactivity primitive.

### `createEventsStore(config)`

Returns `EventsStore` — events list, pagination, polling, token refresh on 401.

```ts
import { createEventsStore } from '@everscribe/components-core'

const store = createEventsStore({
  apiBase: 'https://api.everscribe.io/v1/embed',
  token,
  pageSize: 25,
  pollInterval: 5000,
  // Same since/before/action/actor/actorType/targetType filters as the API:
  action: 'user.invite',
})

const unsubscribe = store.subscribe(() => {
  const { events, status, nextCursor, error } = store.getSnapshot()
  render(events)
})

store.loadMore()  // fetches the next page if cursor is set
store.refresh()   // resets state and re-fetches from the top

// Always dispose to abort in-flight requests and stop the poll timer.
store.dispose()
unsubscribe()
```

`pollInterval > 0` enables polling. Below `1000` ms is clamped with a `console.warn`. The poll loop pauses when `document.visibilityState === 'hidden'` and resumes on `visibilitychange`. Polling is also disabled whenever `before` is set — a closed-upper-bound time window can't admit newer events.

On a 401, the store calls `onTokenExpired` (if set) or fetches `tokenEndpoint`, swaps the token in-place, and retries the request. If both are absent the store transitions to `status: 'expired'`.

### `createDistinctValuesStore(config)`

Returns `DistinctValuesStore` — fetches the three filter-dropdown source lists (`actions`, `actorTypes`, `targetTypes`) once per token. Failures are swallowed silently; an empty dropdown is strictly better UX than blocking the table render on a 500.

```ts
import { createDistinctValuesStore } from '@everscribe/components-core'

const store = createDistinctValuesStore({ apiBase, token })
const unsubscribe = store.subscribe(() => {
  const { actions, actorTypes, targetTypes } = store.getSnapshot()
  render(actions, actorTypes, targetTypes)
})
store.dispose()
unsubscribe()
```

### `parseClaims(token)`

Decodes an embed JWT's payload into an `EmbedClaims` object. Returns `null` for null/undefined input or malformed tokens. No signature verification — the server enforces every read.

```ts
import { parseClaims } from '@everscribe/components-core'

const claims = parseClaims(token)
if (claims?.columns) {
  // Token scopes the column set — the picker should only show these.
}
```

## API client

Low-level fetch helpers if you want to skip the stores entirely. Each takes `{ apiBase, token, signal? }` plus its own params.

```ts
import {
  listEvents,
  getEvent,
  listDistinctActions,
  listDistinctActorTypes,
  listDistinctTargetTypes,
  exportEvents,
  fetchTokenViaOpts,
  EmbedError,
} from '@everscribe/components-core'
```

`EmbedError` is the typed error class thrown on non-2xx responses, with `kind` of `'unauthorized' | 'not_found' | 'rate_limited' | 'bad_request' | 'server' | 'network'` and an optional `retryAfterMs` parsed from the `Retry-After` header.

## Diff

`renderDiff(change)` produces a side-by-side line diff of an event's `change` payload (`{ before, after }`). LCS-based, line-level, dependency-free. Mirrors the upstream Go implementation so client and server produce the same alignment.

```ts
import { renderDiff, hasParseableDiff } from '@everscribe/components-core'

if (hasParseableDiff(event.change)) {
  const { lines } = renderDiff(event.change)
  // each line: { before, after, beforeKind, afterKind }
}
```

## Columns

```ts
import { ALL_COLUMNS, COLUMN_LABELS } from '@everscribe/components-core'
```

`ALL_COLUMNS` is the picker-visible default (`occurred_at`, `action`, `actor`, `target`, `tenant_id`, `result`). `COLUMN_LABELS` maps every known event field to a human label, including the columns not in the default set (`origin`, `metadata`, `change`, `idempotency_key`).

A token's `columns` claim, when set, overrides `ALL_COLUMNS` as the available column set.

## Types

```ts
import type {
  Event,
  EmbedClaims,
  EventsStore,
  EventsStoreConfig,
  EventsStoreState,
  EventsStatus,
  DistinctValues,
  DistinctValuesStore,
  DistinctValuesStoreConfig,
  ApiErrorKind,
  ListEventsParams,
  ExportFormat,
} from '@everscribe/components-core'
```

## License

MIT
