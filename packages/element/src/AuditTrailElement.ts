import {
  ALL_COLUMNS,
  COLUMN_LABELS,
  EmbedError,
  createDistinctValuesStore,
  createEventsStore,
  exportEvents,
  fetchTokenViaOpts,
  generateNLPFilters,
  parseClaims,
  type DistinctValues,
  type DistinctValuesStore,
  type EmbedClaims,
  type Event,
  type EventsStore,
  type EventsStoreState,
  type ExportFormat,
} from '@everscribe/components-core'

import { h } from './dom.js'
import { openEventDetail } from './eventDetail.js'
import { openExportModal } from './exportModal.js'
import {
  countActiveColumnFilters,
  parseQClauses,
  pickInitialTab,
  renderFilterChips,
  renderFiltersPanel,
  resolveTimeBounds,
  type FilterTab,
  type FilterValues,
  type NLPState,
  type NLPErrorReason,
  type TimeRangePreset,
} from './filters.js'
import { renderTable } from './table.js'

const DEFAULT_API_BASE = 'https://api.everscribe.io/v1/embed'
const DEFAULT_PAGE_SIZE = 25
const DEFAULT_POLL_INTERVAL_MS = 5000
const DEFAULT_VISIBLE_COLUMNS = [
  'occurred_at',
  'action',
  'actor',
  'target',
  'tenant_id',
  'result',
]

export type Theme = 'light' | 'dark'
export type DefaultTimeRange = '24h' | '7d' | '30d' | 'all'

type Bootstrap =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; token: string; claims: EmbedClaims | null }
  | { phase: 'error'; reason: 'config' | 'fetch' }

const OBSERVED = [
  'token',
  'token-endpoint',
  'api-base',
  'page-size',
  'poll-interval',
  'theme',
  'default-time-range',
] as const

export class AuditTrailElement extends HTMLElement {
  static get observedAttributes(): readonly string[] {
    return OBSERVED
  }

  // JS-only properties (no attribute equivalent). Setting these after the
  // element is connected has no automatic side effect; reset by reassigning
  // and calling .refresh() if you need a redo.
  onTokenExpired?: () => Promise<string>

  private bootstrap: Bootstrap = { phase: 'idle' }
  private bootstrapAbort: AbortController | null = null
  private eventsStore: EventsStore | null = null
  private distinctStore: DistinctValuesStore | null = null
  private eventsUnsub: (() => void) | null = null
  private distinctUnsub: (() => void) | null = null
  // Latest snapshots cached so render() doesn't have to peek into stores.
  private eventsState: EventsStoreState | null = null
  private distinctValues: DistinctValues = {
    actions: [],
    actorTypes: [],
    targetTypes: [],
    tenants: [],
    resultStatuses: [],
    metadataKeys: [],
    changeFields: [],
  }

  // UI state.
  private filters: FilterValues = { range: 'all' }
  private filtersOpen = false
  private activeTab: FilterTab = 'filters'
  private nlpState: NLPState = { phase: 'idle' }
  private nlpAbort: AbortController | null = null
  private visibleSet: Set<string> = new Set(DEFAULT_VISIBLE_COLUMNS)

  // Slot tracking for partial re-renders. bodySlot wraps the table /
  // state messages so events-store subscriptions can update only the
  // table region without touching the toolbar (which would clobber
  // open <details> picker state) or filter inputs (focus + drafts).
  private bodySlot: HTMLElement | null = null

  // Modal cleanup hooks. Set when a modal is open; null otherwise.
  private detailDispose: (() => void) | null = null
  private exportDispose: (() => void) | null = null

  connectedCallback() {
    this.classList.add('audit-trail-root')
    this.classList.add(`audit-trail-theme-${this.themeAttr()}`)
    this.filters = { range: this.defaultTimeRangeAttr() }
    this.start()
  }

  disconnectedCallback() {
    this.cleanup()
  }

  attributeChangedCallback(name: string, oldVal: string | null, newVal: string | null) {
    if (oldVal === newVal) return
    if (!this.isConnected) return

    if (name === 'theme') {
      const oldClass = `audit-trail-theme-${oldVal === 'dark' ? 'dark' : 'light'}`
      const newClass = `audit-trail-theme-${newVal === 'dark' ? 'dark' : 'light'}`
      this.classList.remove(oldClass)
      this.classList.add(newClass)
      return
    }

    if (name === 'token' || name === 'token-endpoint') {
      this.start()
      return
    }

    if (name === 'default-time-range') {
      // Only meaningful as an *initial* preference. After mount, the
      // user-facing time-range tabs own this value.
      return
    }

    // page-size / poll-interval / api-base: rebuild events store with
    // the new config without re-bootstrapping the token.
    if (this.bootstrap.phase === 'ready') this.restartEventsStore()
  }

  // Public method, mirrors the React component's refresh hatch. Triggers
  // a full re-bootstrap (fresh token fetch + fresh stores).
  refresh() {
    this.start()
  }

  // ---- attributes ----

  private themeAttr(): Theme {
    return this.getAttribute('theme') === 'dark' ? 'dark' : 'light'
  }
  private apiBaseAttr(): string {
    return this.getAttribute('api-base') || DEFAULT_API_BASE
  }
  private pageSizeAttr(): number {
    const n = Number.parseInt(this.getAttribute('page-size') ?? '', 10)
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_PAGE_SIZE
  }
  private pollIntervalAttr(): number {
    const v = this.getAttribute('poll-interval')
    if (v === null) return DEFAULT_POLL_INTERVAL_MS
    const n = Number.parseInt(v, 10)
    return Number.isFinite(n) ? n : DEFAULT_POLL_INTERVAL_MS
  }
  private defaultTimeRangeAttr(): TimeRangePreset {
    const v = this.getAttribute('default-time-range')
    if (v === '24h' || v === '7d' || v === '30d' || v === 'all') return v
    return 'all'
  }

  // ---- bootstrap ----

  private start() {
    this.disposeModals()
    this.cleanupStores()
    this.bootstrapAbort?.abort()
    this.bootstrapAbort = null

    const token = this.getAttribute('token')
    if (token) {
      this.setReady(token)
      return
    }
    if (!this.getAttribute('token-endpoint') && !this.onTokenExpired) {
      this.bootstrap = { phase: 'error', reason: 'config' }
      this.render()
      return
    }
    this.bootstrap = { phase: 'loading' }
    this.render()

    const ctrl = new AbortController()
    this.bootstrapAbort = ctrl
    void (async () => {
      const t = await fetchTokenViaOpts({
        tokenEndpoint: this.getAttribute('token-endpoint') ?? undefined,
        onTokenExpired: this.onTokenExpired,
      })
      if (ctrl.signal.aborted) return
      if (!t) {
        this.bootstrap = { phase: 'error', reason: 'fetch' }
        this.render()
        return
      }
      this.setReady(t)
    })()
  }

  private setReady(token: string) {
    const claims = parseClaims(token)
    this.bootstrap = { phase: 'ready', token, claims }
    // Initial visibleSet honors the token's column scope when set;
    // otherwise the React-aligned default visible set.
    if (claims?.columns && claims.columns.length > 0) {
      this.visibleSet = new Set(claims.columns)
    } else {
      this.visibleSet = new Set(DEFAULT_VISIBLE_COLUMNS)
    }
    // Active tab is claim-driven: Prompt when allow_nlp is true,
    // otherwise Filters. Picked once on bootstrap; users can switch
    // freely after that.
    this.activeTab = pickInitialTab(this.filters, claims)
    this.startEventsStore(token)
    this.startDistinctStore(token)
    this.render()
  }

  private startEventsStore(token: string) {
    this.eventsUnsub?.()
    this.eventsStore?.dispose()

    const { since, before } = resolveTimeBounds(this.filters)
    const apiBase = this.apiBaseAttr()
    const tokenEndpoint = this.getAttribute('token-endpoint') ?? undefined

    const events = createEventsStore({
      apiBase,
      token,
      pageSize: this.pageSizeAttr(),
      pollInterval: this.pollIntervalAttr(),
      tokenEndpoint,
      onTokenExpired: this.onTokenExpired,
      onError: (err) => this.dispatchError(err),
      since,
      before,
      action: this.filters.action,
      actor: this.filters.actor,
      actorType: this.filters.actorType,
      tenantId: this.filters.tenantId,
      targetType: this.filters.targetType,
      targetId: this.filters.targetId,
      resultStatus: this.filters.resultStatus,
      originIP: this.filters.originIP,
      q: this.filters.q,
    })
    this.eventsStore = events
    this.eventsState = events.getSnapshot()
    this.eventsUnsub = events.subscribe(() => {
      this.eventsState = events.getSnapshot()
      this.renderBody()
    })
  }

  private startDistinctStore(token: string) {
    this.distinctUnsub?.()
    this.distinctStore?.dispose()

    const apiBase = this.apiBaseAttr()
    const tokenEndpoint = this.getAttribute('token-endpoint') ?? undefined

    const distinct = createDistinctValuesStore({
      apiBase,
      token,
      tokenEndpoint,
      onTokenExpired: this.onTokenExpired,
    })
    this.distinctStore = distinct
    this.distinctValues = distinct.getSnapshot()
    this.distinctUnsub = distinct.subscribe(() => {
      this.distinctValues = distinct.getSnapshot()
      // Filter panel dropdowns depend on distinct values; re-render
      // the whole element to refresh them. Distinct fetches once per
      // token, so this happens at most once after bootstrap.
      this.render()
    })
  }

  private restartEventsStore() {
    if (this.bootstrap.phase !== 'ready') return
    this.startEventsStore(this.bootstrap.token)
  }

  private cleanupStores() {
    this.eventsUnsub?.()
    this.distinctUnsub?.()
    this.eventsStore?.dispose()
    this.distinctStore?.dispose()
    this.eventsUnsub = null
    this.distinctUnsub = null
    this.eventsStore = null
    this.distinctStore = null
    this.eventsState = null
    this.distinctValues = {
      actions: [],
      actorTypes: [],
      targetTypes: [],
      tenants: [],
      resultStatuses: [],
      metadataKeys: [],
      changeFields: [],
    }
  }

  private cleanup() {
    this.bootstrapAbort?.abort()
    this.bootstrapAbort = null
    this.nlpAbort?.abort()
    this.nlpAbort = null
    this.disposeModals()
    this.cleanupStores()
  }

  private disposeModals() {
    this.detailDispose?.()
    this.detailDispose = null
    this.exportDispose?.()
    this.exportDispose = null
  }

  private openDetail(event: Event) {
    this.detailDispose?.()
    this.detailDispose = openEventDetail({
      event,
      theme: this.themeAttr(),
      onClose: () => {
        this.detailDispose = null
      },
    })
  }

  private openExport() {
    this.exportDispose?.()
    this.exportDispose = openExportModal({
      theme: this.themeAttr(),
      onDownload: (format) => this.runExport(format),
      onClose: () => {
        this.exportDispose = null
      },
    })
  }

  private async runExport(format: ExportFormat) {
    if (this.bootstrap.phase !== 'ready') throw new Error('Not authenticated.')
    const apiBase = this.apiBaseAttr()
    const tokenEndpoint = this.getAttribute('token-endpoint') ?? undefined
    const { since, before } = resolveTimeBounds(this.filters)
    const params = {
      format,
      since,
      before,
      action: this.filters.action,
      actor: this.filters.actor,
      actorType: this.filters.actorType,
      tenantId: this.filters.tenantId,
      targetType: this.filters.targetType,
      targetId: this.filters.targetId,
      resultStatus: this.filters.resultStatus,
      originIP: this.filters.originIP,
      q: this.filters.q,
    }
    const run = (token: string) => exportEvents({ apiBase, token, params })

    let result
    try {
      result = await run(this.bootstrap.token)
    } catch (err) {
      if (err instanceof EmbedError && err.kind === 'unauthorized') {
        const refreshed = await fetchTokenViaOpts({
          tokenEndpoint,
          onTokenExpired: this.onTokenExpired,
        })
        if (!refreshed) throw new Error('Authentication failed.')
        result = await run(refreshed)
      } else if (err instanceof EmbedError) {
        throw new Error(exportErrorMessage(err))
      } else {
        throw err
      }
    }
    triggerBrowserDownload(result.blob, result.filename)
  }

  private dispatchError(err: Error) {
    this.dispatchEvent(
      new CustomEvent('audit-trail-error', {
        detail: { error: err },
        bubbles: true,
      }),
    )
  }

  // ---- columns ----

  private get availableColumns(): string[] {
    if (this.bootstrap.phase !== 'ready') return ALL_COLUMNS
    const cols = this.bootstrap.claims?.columns
    if (cols && cols.length > 0) return cols
    return ALL_COLUMNS
  }

  private get visibleColumns(): string[] {
    return this.availableColumns.filter((c) => this.visibleSet.has(c))
  }

  private toggleColumn(col: string) {
    if (this.visibleSet.has(col)) this.visibleSet.delete(col)
    else this.visibleSet.add(col)
    this.render()
  }

  // ---- filters ----

  private setFilters(next: FilterValues) {
    this.filters = next
    this.render()
    this.restartEventsStore()
  }

  private setActiveTab(next: FilterTab) {
    if (this.activeTab === next) return
    this.activeTab = next
    // Switching tabs doesn't fire a fetch; only the explicit Add /
    // Search buttons mutate filters.
    this.render()
  }

  // submitNLP fires the LLM round-trip via the embed NLP endpoint.
  // Updates nlpState immediately for the spinner, then folds the
  // result into filters on success or surfaces an error on failure.
  private submitNLP(query: string) {
    if (this.bootstrap.phase !== 'ready') return
    const trimmed = query.trim()
    if (!trimmed) return
    const apiBase = this.apiBaseAttr()
    const token = this.bootstrap.token

    this.nlpAbort?.abort()
    const ctrl = new AbortController()
    this.nlpAbort = ctrl
    this.nlpState = { phase: 'loading' }
    this.render()

    void (async () => {
      try {
        const result = await generateNLPFilters({
          apiBase,
          token,
          query: trimmed,
          signal: ctrl.signal,
        })
        if (ctrl.signal.aborted) return
        this.nlpState = { phase: 'idle' }
        this.filters = {
          ...this.filters,
          q: result.dsl || undefined,
          nlpQ: trimmed,
          nlpExplanation: result.explanation,
          nlpUnsupported: result.unsupported,
        }
        this.render()
        this.restartEventsStore()
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        // Try a token refresh on 401 once, then surface the error.
        if (err instanceof EmbedError && err.kind === 'unauthorized') {
          const refreshed = await fetchTokenViaOpts({
            tokenEndpoint: this.getAttribute('token-endpoint') ?? undefined,
            onTokenExpired: this.onTokenExpired,
          })
          if (refreshed && !ctrl.signal.aborted) {
            try {
              const retry = await generateNLPFilters({
                apiBase,
                token: refreshed,
                query: trimmed,
                signal: ctrl.signal,
              })
              this.nlpState = { phase: 'idle' }
              this.filters = {
                ...this.filters,
                q: retry.dsl || undefined,
                nlpQ: trimmed,
                nlpExplanation: retry.explanation,
                nlpUnsupported: retry.unsupported,
              }
              this.render()
              this.restartEventsStore()
              return
            } catch (retryErr) {
              this.nlpState = {
                phase: 'error',
                reason: classifyNLPError(retryErr),
              }
              this.render()
              return
            }
          }
        }
        this.nlpState = { phase: 'error', reason: classifyNLPError(err) }
        this.render()
      }
    })()
  }

  // ---- rendering ----

  private render() {
    // Full rebuild. Slot refs are cleared so renderBody is a no-op
    // until the next render assigns them.
    this.bodySlot = null
    this.replaceChildren(...this.renderChildren())
  }

  private renderBody() {
    if (!this.bodySlot) return
    this.bodySlot.replaceChildren(...this.renderBodyChildren())
  }

  private renderChildren(): Node[] {
    if (this.bootstrap.phase === 'error' && this.bootstrap.reason === 'config') {
      return [
        this.stateElement(
          'error',
          h(
            'span',
            null,
            'Configure ',
            h('code', null, 'token'),
            ', ',
            h('code', null, 'token-endpoint'),
            ', or set the ',
            h('code', null, 'onTokenExpired'),
            ' property.',
          ),
        ),
      ]
    }
    if (this.bootstrap.phase === 'error' && this.bootstrap.reason === 'fetch') {
      const retry = h('button', { type: 'button', class: 'audit-trail-button' }, 'Retry')
      retry.addEventListener('click', () => this.start())
      return [this.stateElement('error', h('span', null, "Couldn’t fetch token."), retry)]
    }
    if (this.bootstrap.phase !== 'ready') {
      return [this.stateElement('loading', 'Loading…')]
    }
    if (this.bootstrap.claims === null) {
      return [this.stateElement('error', 'Invalid token.')]
    }

    const out: Node[] = [this.renderToolbar()]

    // Active-filter chips sit between the toolbar and the panel —
    // visible whenever there's at least one active filter, even
    // when the panel is collapsed.
    const chips = renderFilterChips({
      value: this.filters,
      onChange: (next) => this.setFilters(next),
    })
    if (chips) out.push(chips)

    if (this.filtersOpen) {
      out.push(
        renderFiltersPanel({
          value: this.filters,
          distinct: this.distinctValues,
          claims: this.bootstrap.claims,
          activeTab: this.activeTab,
          nlpState: this.nlpState,
          onTabChange: (next) => this.setActiveTab(next),
          onChange: (next) => this.setFilters(next),
          onNLPSubmit: (q) => this.submitNLP(q),
          onApplied: () => {
            this.filtersOpen = false
            this.render()
          },
        }),
      )
    }
    const body = h('div', { class: 'audit-trail-body' })
    body.replaceChildren(...this.renderBodyChildren())
    this.bodySlot = body
    out.push(body)
    return out
  }

  private renderToolbar(): HTMLElement {
    const livePollActive =
      this.pollIntervalAttr() > 0 && !resolveTimeBounds(this.filters).before

    const live = livePollActive ? this.renderLiveIndicator() : null
    const spacer = h('span', { class: 'audit-trail-toolbar-spacer' })
    const filtersToggle = this.renderFiltersToggle()
    const exportBtn = h(
      'button',
      { type: 'button', class: 'audit-trail-button' },
      'Export',
    )
    exportBtn.addEventListener('click', () => this.openExport())
    const picker = this.renderColumnPicker()

    const children: Node[] = []
    if (live) children.push(live)
    children.push(spacer, filtersToggle, exportBtn, picker)
    return h('div', { class: 'audit-trail-toolbar' }, ...children)
  }

  private renderLiveIndicator(): HTMLElement {
    return h(
      'span',
      {
        class: 'audit-trail-live',
        'aria-label': 'Live updates',
        title: 'Live updates',
      },
      h('span', { class: 'audit-trail-live-dot', 'aria-hidden': 'true' }),
      h('span', null, 'Live'),
    )
  }

  private renderFiltersToggle(): HTMLElement {
    const activeCount =
      countActiveColumnFilters(this.filters) +
      (this.filters.q ? parseQClauses(this.filters.q).length : 0)
    const children: Node[] = [document.createTextNode('Search')]
    if (activeCount > 0) {
      children.push(
        h('span', { class: 'audit-trail-filter-toggle-badge' }, String(activeCount)),
      )
    }
    children.push(
      h(
        'span',
        { class: 'audit-trail-filter-toggle-caret', 'aria-hidden': 'true' },
        this.filtersOpen ? '▴' : '▾',
      ),
    )
    const btn = h(
      'button',
      {
        type: 'button',
        class: 'audit-trail-filter-toggle',
        'aria-expanded': this.filtersOpen ? 'true' : 'false',
      },
      ...children,
    )
    btn.addEventListener('click', () => {
      this.filtersOpen = !this.filtersOpen
      this.render()
    })
    return btn
  }

  private renderColumnPicker(): HTMLElement {
    const available = this.availableColumns
    const visibleCount = available.reduce(
      (n, c) => (this.visibleSet.has(c) ? n + 1 : n),
      0,
    )

    const items = available.map((col) => {
      const checkbox = h('input', { type: 'checkbox' }) as HTMLInputElement
      checkbox.checked = this.visibleSet.has(col)
      checkbox.addEventListener('change', () => this.toggleColumn(col))
      return h(
        'label',
        { class: 'audit-trail-picker-item' },
        checkbox,
        h('span', null, COLUMN_LABELS[col] ?? col),
      )
    })

    return h(
      'details',
      { class: 'audit-trail-picker' },
      h(
        'summary',
        { class: 'audit-trail-picker-summary' },
        `Columns (${visibleCount}/${available.length})`,
      ),
      h('div', { class: 'audit-trail-picker-content' }, ...items),
    )
  }

  private renderBodyChildren(): Node[] {
    const events = this.eventsState?.events ?? []
    const status = this.eventsState?.status ?? 'loading'
    const hasMore = (this.eventsState?.nextCursor ?? null) !== null
    const cols = this.visibleColumns

    if (status === 'loading' && events.length === 0) {
      return [this.stateElement('loading', 'Loading…')]
    }
    if (status === 'expired') {
      return [this.stateElement('error', 'Session expired.')]
    }
    if (status === 'error') {
      const retry = h('button', { type: 'button', class: 'audit-trail-button' }, 'Retry')
      retry.addEventListener('click', () => this.eventsStore?.refresh())
      return [this.stateElement('error', 'Could not load events.', retry)]
    }
    if (events.length === 0) {
      return [this.stateElement('empty', 'No events match.')]
    }
    if (cols.length === 0) {
      return [this.stateElement('empty', 'No columns selected.')]
    }

    const out: Node[] = [renderTable(events, cols, (event) => this.openDetail(event))]
    if (hasMore) {
      const more = h(
        'button',
        { type: 'button', class: 'audit-trail-button audit-trail-load-more' },
        'Load more',
      )
      more.addEventListener('click', () => this.eventsStore?.loadMore())
      out.push(more)
    }
    return out
  }

  private stateElement(
    kind: 'loading' | 'error' | 'empty',
    ...children: (Node | string)[]
  ): HTMLElement {
    return h('div', { class: `audit-trail-state audit-trail-state-${kind}` }, ...children)
  }
}

// triggerBrowserDownload synthesizes an anchor click against a blob
// URL so the browser saves the export with the server-suggested name.
// The object URL is revoked on the next tick so the click has time to
// land in slow / older browsers.
function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

// classifyNLPError folds an EmbedError into the small set of reasons
// the Prompt tab actually distinguishes. 403 + "nlp_not_allowed"
// message is the AllowNLP claim refusal; everything else falls
// through to generic buckets.
function classifyNLPError(err: unknown): NLPErrorReason {
  if (!(err instanceof EmbedError)) return 'unknown'
  if (err.status === 503) {
    if (err.message?.includes('busy')) return 'provider_busy'
    return 'not_configured'
  }
  if (err.status === 429) return 'rate_limited'
  if (err.status === 403) return 'not_allowed'
  if (err.kind === 'bad_request') return 'bad_request'
  return 'unknown'
}

function exportErrorMessage(err: EmbedError): string {
  switch (err.kind) {
    case 'rate_limited':
      return 'Too many requests. Try again in a moment.'
    case 'bad_request':
      return err.message || 'Bad request.'
    case 'server':
      return 'Server error. Please try again.'
    case 'network':
      return 'Network error. Check your connection.'
    case 'not_found':
      return 'Not found.'
    case 'unauthorized':
      return 'Authentication failed.'
  }
}
