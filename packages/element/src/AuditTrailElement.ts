import {
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

const DEFAULT_API_BASE = 'https://api.everscribe.io/v1/embed'
const DEFAULT_PAGE_SIZE = 25
const DEFAULT_POLL_INTERVAL_MS = 5000

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
  private distinctValues: DistinctValues | null = null

  connectedCallback() {
    this.classList.add('audit-trail-root')
    this.classList.add(`audit-trail-theme-${this.themeAttr()}`)
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

    // page-size / poll-interval / api-base / default-time-range:
    // rebuild stores against the new config without re-bootstrapping the
    // token. Only needed once we're past the token bootstrap.
    if (this.bootstrap.phase === 'ready') this.startStores(this.bootstrap.token)
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
    this.startStores(token)
    this.render()
  }

  private startStores(token: string) {
    this.cleanupStores()

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
    })
    this.eventsStore = events
    this.eventsState = events.getSnapshot()
    this.eventsUnsub = events.subscribe(() => {
      this.eventsState = events.getSnapshot()
      this.render()
    })

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
      this.render()
    })
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
    this.distinctValues = null
  }

  private cleanup() {
    this.bootstrapAbort?.abort()
    this.bootstrapAbort = null
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

  // ---- rendering ----

  private render() {
    const view = this.renderView()
    this.replaceChildren(view)
  }

  private renderView(): HTMLElement {
    if (this.bootstrap.phase === 'error' && this.bootstrap.reason === 'config') {
      return this.stateElement(
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
      )
    }
    if (this.bootstrap.phase === 'error' && this.bootstrap.reason === 'fetch') {
      const retry = h('button', { type: 'button', class: 'audit-trail-button' }, 'Retry')
      retry.addEventListener('click', () => this.start())
      return this.stateElement(
        'error',
        h('span', null, "Couldn’t fetch token."),
        retry,
      )
    }
    if (this.bootstrap.phase !== 'ready') {
      return this.stateElement('loading', 'Loading…')
    }
    if (this.bootstrap.claims === null) {
      return this.stateElement('error', 'Invalid token.')
    }

    // Phase A placeholder: confirms the stores are wired up. Phase B
    // replaces this with the real table.
    const count = this.eventsState?.events.length ?? 0
    const status = this.eventsState?.status ?? 'loading'
    if (status === 'loading' && count === 0) {
      return this.stateElement('loading', 'Loading…')
    }
    if (status === 'expired') {
      return this.stateElement('error', 'Session expired.')
    }
    if (status === 'error') {
      const retry = h('button', { type: 'button', class: 'audit-trail-button' }, 'Retry')
      retry.addEventListener('click', () => this.eventsStore?.refresh())
      return this.stateElement('error', 'Could not load events.', retry)
    }
    return this.stateElement('empty', `Ready — ${count} event${count === 1 ? '' : 's'} loaded.`)
  }

  private stateElement(
    kind: 'loading' | 'error' | 'empty',
    ...children: (Node | string)[]
  ): HTMLElement {
    return h('div', { class: `audit-trail-state audit-trail-state-${kind}` }, ...children)
  }
}
