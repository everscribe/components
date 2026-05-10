import {
  EmbedError,
  fetchTokenViaOpts,
  listEvents,
  type ListEventsParams,
  type ListEventsResponse,
} from './api.js'
import type { Event } from './types.js'

const MIN_POLL_INTERVAL_MS = 1000

export type EventsStatus = 'loading' | 'ok' | 'error' | 'expired'

export interface EventsStoreConfig {
  apiBase: string
  token: string | null
  pageSize: number
  pollInterval: number
  tokenEndpoint?: string
  onTokenExpired?: () => Promise<string>
  onError?: (err: Error) => void
  since?: string
  before?: string
  action?: string
  actor?: string
  actorType?: string
  tenantId?: string
  targetType?: string
  targetId?: string
  resultStatus?: string
  originIP?: string
  q?: string
}

export interface EventsStoreState {
  events: Event[]
  nextCursor: string | null
  status: EventsStatus
  error: EmbedError | null
}

export interface EventsStore {
  getSnapshot(): EventsStoreState
  subscribe(listener: () => void): () => void
  loadMore(): void
  refresh(): void
  dispose(): void
}

type FetchKind = 'initial' | 'poll' | 'more'

const INITIAL_STATE: EventsStoreState = {
  events: [],
  nextCursor: null,
  status: 'loading',
  error: null,
}

export function createEventsStore(config: EventsStoreConfig): EventsStore {
  let state: EventsStoreState = INITIAL_STATE
  const listeners = new Set<() => void>()
  let token: string | null = config.token
  let disposed = false
  let activeAbort: AbortController | null = null
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let visibilityHandler: (() => void) | null = null

  const setState = (next: EventsStoreState) => {
    state = next
    for (const l of listeners) l()
  }

  const fetchPage = async (kind: FetchKind, signal: AbortSignal) => {
    if (!token) return
    const params: ListEventsParams = { limit: config.pageSize }
    if (config.since) params.since = config.since
    if (config.before) params.before = config.before
    if (config.action) params.action = config.action
    if (config.actor) params.actor = config.actor
    if (config.actorType) params.actorType = config.actorType
    if (config.tenantId) params.tenantId = config.tenantId
    if (config.targetType) params.targetType = config.targetType
    if (config.targetId) params.targetId = config.targetId
    if (config.resultStatus) params.resultStatus = config.resultStatus
    if (config.originIP) params.originIP = config.originIP
    if (config.q) params.q = config.q

    if (kind === 'poll') {
      const newest = state.events[0]?.occurred_at
      if (newest) params.since = newest
    } else if (kind === 'more') {
      if (!state.nextCursor) return
      params.cursor = state.nextCursor
    }

    const doFetch = async (
      t: string,
      allowRefresh: boolean,
    ): Promise<ListEventsResponse> => {
      try {
        return await listEvents({ apiBase: config.apiBase, token: t, signal, params })
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err
        if (allowRefresh && err instanceof EmbedError && err.kind === 'unauthorized') {
          const newTok = await fetchTokenViaOpts({
            tokenEndpoint: config.tokenEndpoint,
            onTokenExpired: config.onTokenExpired,
          })
          if (!newTok) throw err
          token = newTok
          return doFetch(newTok, false)
        }
        throw err
      }
    }

    let response: ListEventsResponse
    try {
      response = await doFetch(token, true)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const e =
        err instanceof EmbedError
          ? err
          : new EmbedError({ kind: 'network', cause: err, message: 'network error' })
      setState({
        ...state,
        status: e.kind === 'unauthorized' ? 'expired' : 'error',
        error: e,
      })
      config.onError?.(e)
      return
    }

    if (kind === 'initial') {
      setState({
        events: response.events,
        nextCursor: response.next_cursor ?? null,
        status: 'ok',
        error: null,
      })
    } else if (kind === 'poll') {
      const events =
        response.events.length > 0 ? mergeNewer(response.events, state.events) : state.events
      setState({ ...state, events, status: 'ok', error: null })
    } else {
      setState({
        events: mergeOlder(state.events, response.events),
        nextCursor: response.next_cursor ?? null,
        status: 'ok',
        error: null,
      })
    }
  }

  const startPolling = () => {
    if (config.pollInterval <= 0) return
    if (config.before) return

    let interval = config.pollInterval
    if (interval < MIN_POLL_INTERVAL_MS) {
      console.warn(
        `[everscribe] pollInterval=${interval}ms is below minimum ${MIN_POLL_INTERVAL_MS}ms; clamping to ${MIN_POLL_INTERVAL_MS}ms`,
      )
      interval = MIN_POLL_INTERVAL_MS
    }

    const schedule = () => {
      if (disposed) return
      pollTimer = setTimeout(tick, interval)
    }

    const tick = async () => {
      if (disposed) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        schedule()
        return
      }
      const ctrl = new AbortController()
      activeAbort = ctrl
      try {
        await fetchPage('poll', ctrl.signal)
      } finally {
        if (activeAbort === ctrl) activeAbort = null
        schedule()
      }
    }

    schedule()

    if (typeof document !== 'undefined') {
      visibilityHandler = () => {
        if (disposed) return
        if (document.visibilityState === 'visible') {
          if (pollTimer) {
            clearTimeout(pollTimer)
            pollTimer = null
          }
          void tick()
        }
      }
      document.addEventListener('visibilitychange', visibilityHandler)
    }
  }

  const stopPolling = () => {
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
    if (visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', visibilityHandler)
      visibilityHandler = null
    }
  }

  const runInitialFetch = () => {
    if (!token) return
    const ctrl = new AbortController()
    activeAbort = ctrl
    void fetchPage('initial', ctrl.signal).finally(() => {
      if (activeAbort === ctrl) activeAbort = null
    })
  }

  runInitialFetch()
  startPolling()

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    loadMore() {
      if (disposed) return
      if (!state.nextCursor) return
      const ctrl = new AbortController()
      void fetchPage('more', ctrl.signal)
    },
    refresh() {
      if (disposed) return
      stopPolling()
      if (activeAbort) activeAbort.abort()
      setState(INITIAL_STATE)
      runInitialFetch()
      startPolling()
    },
    dispose() {
      if (disposed) return
      disposed = true
      stopPolling()
      if (activeAbort) activeAbort.abort()
      listeners.clear()
    },
  }
}

function mergeNewer(incoming: Event[], existing: Event[]): Event[] {
  const seen = new Set(existing.map((e) => e.id))
  const fresh = incoming.filter((e) => !seen.has(e.id))
  if (fresh.length === 0) return existing
  return [...fresh, ...existing]
}

function mergeOlder(existing: Event[], incoming: Event[]): Event[] {
  const seen = new Set(existing.map((e) => e.id))
  const fresh = incoming.filter((e) => !seen.has(e.id))
  return [...existing, ...fresh]
}
