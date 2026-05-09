import {
  ALL_COLUMNS,
  COLUMN_LABELS,
  createDistinctValuesStore,
  createEventsStore,
  fetchTokenViaOpts,
  parseClaims,
  type DistinctValues,
  type DistinctValuesStore,
  type EmbedClaims,
  type EventsStore,
  type EventsStoreState,
} from '@everscribe/components-core'

import { h } from './dom.js'
import {
  countActiveColumnFilters,
  renderFiltersPanel,
  resolveTimeBounds,
  type FilterValues,
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
// Debounce window for the free-text actor input and the custom-range
// datetime inputs. Long enough to absorb continuous typing, short
// enough to feel responsive.
const TEXT_DEBOUNCE_MS = 300

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
  }

  // UI state.
  private filters: FilterValues = { range: 'all' }
  private filtersOpen = false
  private visibleSet: Set<string> = new Set(DEFAULT_VISIBLE_COLUMNS)

  // Slot tracking for partial re-renders. bodySlot wraps the table /
  // state messages so events-store subscriptions can update only the
  // table region without touching the toolbar (which would clobber
  // open <details> picker state) or filter inputs (focus + drafts).
  private bodySlot: HTMLElement | null = null

  // Held across re-renders so the debounced commit can read the
  // current input values at fire time.
  private actorInput: HTMLInputElement | null = null
  private sinceInput: HTMLInputElement | null = null
  private beforeInput: HTMLInputElement | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null

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
      targetType: this.filters.targetType,
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
    this.distinctValues = { actions: [], actorTypes: [], targetTypes: [] }
  }

  private cleanup() {
    this.bootstrapAbort?.abort()
    this.bootstrapAbort = null
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.cleanupStores()
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

  private scheduleDebouncedCommit() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      this.commitDebouncedDrafts()
    }, TEXT_DEBOUNCE_MS)
  }

  // commitDebouncedDrafts reads the actor + custom-range inputs
  // straight from the DOM and re-runs the events store with the new
  // values. We deliberately skip the full render here — the inputs
  // already show the user's typed value, and re-rendering would
  // pull focus mid-type.
  private commitDebouncedDrafts() {
    const actorRaw = this.actorInput?.value ?? ''
    const sinceRaw = this.sinceInput?.value ?? ''
    const beforeRaw = this.beforeInput?.value ?? ''

    const next: FilterValues = { ...this.filters }
    let changed = false

    const newActor = actorRaw || undefined
    if (newActor !== this.filters.actor) {
      next.actor = newActor
      changed = true
    }
    if (this.filters.range === 'custom') {
      const newSince = sinceRaw || undefined
      const newBefore = beforeRaw || undefined
      if (newSince !== this.filters.since) {
        next.since = newSince
        changed = true
      }
      if (newBefore !== this.filters.before) {
        next.before = newBefore
        changed = true
      }
    }
    if (!changed) return
    this.filters = next
    this.restartEventsStore()
  }

  // ---- rendering ----

  private render() {
    // Full rebuild. Slot refs are cleared so renderBody is a no-op
    // until the next render assigns them.
    this.bodySlot = null
    this.actorInput = null
    this.sinceInput = null
    this.beforeInput = null
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
    if (this.filtersOpen) {
      out.push(
        renderFiltersPanel({
          value: this.filters,
          distinct: this.distinctValues,
          onChange: (next) => this.setFilters(next),
          onActorInput: () => this.scheduleDebouncedCommit(),
          onCustomRangeInput: () => this.scheduleDebouncedCommit(),
          setActorInput: (el) => {
            this.actorInput = el
          },
          setSinceInput: (el) => {
            this.sinceInput = el
          },
          setBeforeInput: (el) => {
            this.beforeInput = el
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
    // Phase D will mount the export modal. Phase C: stub button is
    // visible but inert.
    const exportBtn = h(
      'button',
      { type: 'button', class: 'audit-trail-button' },
      'Export',
    ) as HTMLButtonElement
    exportBtn.disabled = true
    exportBtn.title = 'Export — coming soon'
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
    const activeCount = countActiveColumnFilters(this.filters)
    const children: Node[] = [document.createTextNode('Set filters')]
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

    const out: Node[] = [renderTable(events, cols)]
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
