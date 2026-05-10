# Everscribe components

Embeddable audit-trail UI for [Everscribe](https://everscribe.io). Drop a component into your customer-facing app, hand it a short-lived embed token, and your end-users see a live, scoped view of their audit trail. The token's claims define what they can see — tenant, columns, actions — and the server enforces that scope on every read.

This is a monorepo. Pick the package that matches how you build UI; data plumbing, theming, and security are identical across all of them.

## Packages

| Package | What it is | When to use |
|---|---|---|
| [`@everscribe/components-react`](packages/react#readme) | React component (`<AuditTrail />`) | React apps |
| [`@everscribe/components-element`](packages/element#readme) | Web component (`<audit-trail>`) | Plain HTML, Vue, Svelte, Solid, Angular |
| [`@everscribe/components-core`](packages/core#readme) | Framework-agnostic core | You're building your own UI on top of the data layer |
| [`@everscribe/components-styles`](packages/styles#readme) | Default theme | Required by `react` and `element` |

Not sure which? **React → use `react`. Anything else → use `element`.** The web component works in every framework; the React-native package is justified because React 18's custom-element interop is rough enough that an idiomatic JSX API is worth it.

The rest of this README covers concepts that apply to all packages — how the embed flow works, how to mint tokens, how to theme, security and rate-limit guidance. For package-specific install instructions and API reference, click through to the package READMEs above.

## How it fits together

```
[your backend] ──mint──> token ──passes to──> [your frontend] ──Bearer──> [Everscribe API]
```

1. **Your backend** holds the project API key (`evs_<32hex>`). Use [`sdk-go/pkg/minter`](https://github.com/everscribe/sdk-go) to mint short-lived embed tokens.
2. **Your frontend** fetches a token from a route you expose, then passes it to whichever component you're using.
3. **The Everscribe API** verifies the token on every read and scopes results to its claims.

The API key never touches the browser. Tokens do, and they're designed for it: short TTL, narrow scope, read-only.

## Minting tokens (your backend)

The `tokenEndpoint` from the package quick-starts is a route on your backend that mints a token via [sdk-go](https://github.com/everscribe/sdk-go) and returns it to the frontend:

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
// authenticated user. The frontend component calls this on mount and on 401.
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
            // Optional: opt the embed into the AI / Query tabs. See
            // "AI and Query tabs" below.
            AllowDSLInput: true,
            AllowNLP:      true,
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

## Token refresh

On a 401, the component falls through this chain:

1. If `onTokenExpired` is set — call it, swap the returned token, retry.
2. Else if `tokenEndpoint` is set — `fetch(tokenEndpoint, { credentials: 'include' })`, expect `{ token }`, retry.
3. Otherwise — render a "Session expired" state.

If your token endpoint uses the same session-cookie auth as the rest of your app, refresh is silent. The same chain handles initial token loading when `token` isn't provided.

## Token storage

Tokens are short-lived precisely so in-memory storage is viable.

| Storage | OK? |
|---|---|
| Component state / React context | ✅ |
| `sessionStorage` (survives in-tab navigation, cleared on tab close) | ✅ |
| `localStorage` | ❌ XSS-exfiltratable |
| URL query params | ❌ logged in history, server logs, referers |

## Rate limits

The read API caps at **60 requests per minute per token (`jti`)**. The default `pollInterval` of 5000 ms yields 12 req/min, well under the cap.

If you need parallel-tab budget, mint a fresh token per page load — each tab gets its own bucket. Caching one token across five tabs polling at 5s already saturates the limit.

## Claim-driven UI

| Claim | UX |
|---|---|
| `tenant_id` | Hard-pinned. No tenant switcher. |
| `columns` | Column picker lists only whitelisted columns. End-users can hide further; they can't reveal anything outside the whitelist. |
| `actions` | Action dropdown lists each claim entry verbatim — exact (`user.login`) and wildcard (`user.*`) both render as one option. |
| `allowed_fields` | Restricts which catalog fields can appear in DSL / NLP-generated queries (e.g. `metadata.*`, `actor.id`). Server rejects out-of-scope fields independently of the UI. |
| `allow_dsl_input` | Reveals the **Query** tab — a free-text DSL input for power users. When `false`, the tab is hidden and `?q=` is refused at the API. |
| `allow_nlp` | Reveals the **AI** tab — natural-language → DSL translation via `POST /v1/embed/events/nlp`. When `false`, the tab is hidden and the endpoint returns 403. |

When a claim is omitted, the component behaves like the unrestricted UI for that dimension.

> **Heads up — action filter pagination.** v1 filters actions client-side, so a narrow filter on a sparsely-matching action may need several "Load more" clicks to fill the next batch. The token's `actions` ceiling is always enforced server-side; this only affects within-claim narrowing.

## AI and Query tabs

The "Set filters" panel is a three-tab strip — **AI**, **Filters**, **Query** — gated by token claims:

- **Filters** — always shown. Dropdowns and text inputs for action, actor, tenant, target, result status, origin IP, plus an inline builder for `metadata.<key>` and `change.<field>` clauses. End-users compose filters and click **Add filters** to apply.
- **Query** — shown when `allow_dsl_input: true`. A free-text input that accepts a Lucene-flavored DSL. Clauses look like `field:value` (equality), `field:!value` (not), `field:~value` (contains), `field:[a TO b]` (range), `field:(v1 OR v2)` (within-field OR), joined at the top level by `AND`. Submission replaces any active column filters.
- **AI** — shown when `allow_nlp: true`. The user types a natural-language question ("failed logins in past 24 hours"); the component POSTs to `/v1/embed/events/nlp`, the server calls Anthropic, and the translated DSL is applied. The Translated banner shows the generated DSL so power users can copy it into the Query tab or audit what the model produced.

The AI and Query tabs interact with the same `?q=` parameter as the inline metadata builder, so clicking **Add filters** or **Add filter** elsewhere clears the AI / DSL state — only one source of truth at a time.

**Cost note.** Every AI submission counts against the project's Anthropic budget (configured server-side via `ANTHROPIC_API_KEY` and `EVERSCRIBE_NLP_RATE_LIMIT`). Per-`jti` rate limiting caps a runaway end-user; you control the rest by minting tokens with or without `allow_nlp`.

**Server enforcement.** `allow_dsl_input` and `allow_nlp` are claim-checked on every request — hiding the tab is a UX layer, not a security boundary. A user who reverse-engineers the API still can't bypass the gate.

## Theming

Brand-match by overriding CSS variables on `.audit-trail-root`. The simplest path:

```css
.my-app .audit-trail-root {
  --audit-trail-accent: #ff6b35;
  --audit-trail-radius: 10px;
  --audit-trail-font-family: 'Inter', sans-serif;
}
```

Full variable index lives in the [`@everscribe/components-styles` README](packages/styles#readme). `.audit-trail-theme-dark` swaps the color tokens to a dark palette. When variables aren't enough, override class names directly: `.audit-trail-table`, `.audit-trail-th`, `.audit-trail-row`, `.audit-trail-cell`, `.audit-trail-cell-{column}`, etc.

## Required event fields

If you set `columns` on the token, include at least `id`, `occurred_at`, and `action` — the component uses `id` for dedup and detail keying, `occurred_at` for the polling cursor, and `action` for the row label and detail title.

## Development

This repo is a [pnpm](https://pnpm.io/) workspace orchestrated with [Turborepo](https://turbo.build/repo).

```bash
corepack enable               # one-time, provisions pnpm@11 pinned in package.json
pnpm install
pnpm run build                # tsup, all packages
pnpm run typecheck            # tsc --noEmit, all packages
pnpm run dev                  # tsup --watch, all packages
```

Layout:

```
packages/
  core/        @everscribe/components-core      framework-agnostic data layer
  react/       @everscribe/components-react     React adapter
  element/     @everscribe/components-element   <audit-trail> custom element
  styles/      @everscribe/components-styles    default theme CSS
```

`react` and `element` both depend on `core` via `workspace:*`. CSS is shipped from `styles` (no build step — static file).

## License

[MIT](LICENSE)
