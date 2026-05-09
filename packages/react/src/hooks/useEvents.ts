'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { EmbedError, fetchTokenViaOpts, listEvents } from '../lib/api.js'
import type { ListEventsResponse } from '../lib/api.js'
import type { Event } from '../lib/types.js'

const MIN_POLL_INTERVAL_MS = 1000

export type EventsStatus = 'loading' | 'ok' | 'error' | 'expired'

export interface UseEventsOptions {
  apiBase: string
  token: string | null
  pageSize: number
  pollInterval: number
  tokenEndpoint?: string
  onTokenExpired?: () => Promise<string>
  onError?: (err: Error) => void
  // Server-side filters. Changes to any of these reset pagination and
  // refetch from scratch. When `before` is set the polling loop is
  // disabled — a closed time window can't get newer events.
  since?: string
  before?: string
  action?: string
  actor?: string
  actorType?: string
  targetType?: string
}

export interface UseEventsResult {
  events: Event[]
  hasMore: boolean
  status: EventsStatus
  error: EmbedError | null
  loadMore: () => void
  refresh: () => void
}

type FetchKind = 'initial' | 'poll' | 'more'

export function useEvents(opts: UseEventsOptions): UseEventsResult {
  const [events, setEvents] = useState<Event[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [status, setStatus] = useState<EventsStatus>('loading')
  const [error, setError] = useState<EmbedError | null>(null)

  const optsRef = useRef(opts)
  optsRef.current = opts

  const eventsRef = useRef(events)
  eventsRef.current = events

  const cursorRef = useRef(nextCursor)
  cursorRef.current = nextCursor

  const tokenRef = useRef<string | null>(opts.token)
  useEffect(() => {
    if (opts.token) tokenRef.current = opts.token
  }, [opts.token])

  const fetchPage = useCallback(async (kind: FetchKind, signal: AbortSignal) => {
    if (!tokenRef.current) return
    const o = optsRef.current
    const params: ListEventsParams = { limit: o.pageSize }

    // Always-applicable filters. Polling overrides `since` below so it
    // only fetches events newer than the page top, regardless of the
    // user's chosen time range.
    if (o.since) params.since = o.since
    if (o.before) params.before = o.before
    if (o.action) params.action = o.action
    if (o.actor) params.actor = o.actor
    if (o.actorType) params.actorType = o.actorType
    if (o.targetType) params.targetType = o.targetType

    if (kind === 'poll') {
      const newest = eventsRef.current[0]?.occurred_at
      if (newest) params.since = newest
    } else if (kind === 'more') {
      const c = cursorRef.current
      if (!c) return
      params.cursor = c
    }

    const doFetch = (token: string): Promise<ListEventsResponse> =>
      listEvents({ apiBase: o.apiBase, token, signal, params })

    const fetchWithRefresh = async (
      token: string,
      allowRefresh: boolean,
    ): Promise<ListEventsResponse> => {
      try {
        return await doFetch(token)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err
        if (allowRefresh && err instanceof EmbedError && err.kind === 'unauthorized') {
          const newToken = await fetchTokenViaOpts(o)
          if (!newToken) throw err
          tokenRef.current = newToken
          return fetchWithRefresh(newToken, false)
        }
        throw err
      }
    }

    let response: ListEventsResponse
    try {
      response = await fetchWithRefresh(tokenRef.current, true)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const e = err instanceof EmbedError ? err : networkErr(err)
      setStatus(e.kind === 'unauthorized' ? 'expired' : 'error')
      setError(e)
      o.onError?.(e)
      return
    }

    if (kind === 'initial') {
      setEvents(response.events)
      setNextCursor(response.next_cursor ?? null)
    } else if (kind === 'poll') {
      if (response.events.length > 0) {
        setEvents((prev) => mergeNewer(response.events, prev))
      }
    } else {
      setEvents((prev) => mergeOlder(prev, response.events))
      setNextCursor(response.next_cursor ?? null)
    }
    setStatus('ok')
    setError(null)
  }, [])

  // Initial fetch + reset on token / apiBase / filter change.
  useEffect(() => {
    setStatus('loading')
    setEvents([])
    setNextCursor(null)
    setError(null)
    if (!opts.token) return
    const ctrl = new AbortController()
    fetchPage('initial', ctrl.signal)
    return () => ctrl.abort()
  }, [
    opts.token,
    opts.apiBase,
    opts.since,
    opts.before,
    opts.action,
    opts.actor,
    opts.actorType,
    opts.targetType,
    fetchPage,
  ])

  // Polling loop with visibility pause. Disabled when `before` is set
  // — a closed-upper-bound filter can't admit newer events, so polling
  // would burn requests for nothing.
  useEffect(() => {
    if (opts.pollInterval <= 0) return
    if (opts.before) return

    const interval = Math.max(MIN_POLL_INTERVAL_MS, opts.pollInterval)
    if (interval !== opts.pollInterval) {
      console.warn(
        `[everscribe] pollInterval=${opts.pollInterval}ms is below minimum ${MIN_POLL_INTERVAL_MS}ms; clamping to ${MIN_POLL_INTERVAL_MS}ms`,
      )
    }

    let timer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const schedule = () => {
      if (cancelled) return
      timer = setTimeout(tick, interval)
    }

    const tick = async () => {
      if (cancelled) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        schedule()
        return
      }
      const ctrl = new AbortController()
      try {
        await fetchPage('poll', ctrl.signal)
      } finally {
        schedule()
      }
    }

    schedule()

    const onVisible = () => {
      if (typeof document === 'undefined' || cancelled) return
      if (document.visibilityState === 'visible') {
        if (timer) {
          clearTimeout(timer)
          timer = null
        }
        tick()
      }
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisible)
    }

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible)
      }
    }
  }, [opts.pollInterval, opts.before, fetchPage])

  const loadMore = useCallback(() => {
    if (!cursorRef.current) return
    const ctrl = new AbortController()
    fetchPage('more', ctrl.signal)
  }, [fetchPage])

  const refresh = useCallback(() => {
    setStatus('loading')
    setEvents([])
    setNextCursor(null)
    setError(null)
    const ctrl = new AbortController()
    fetchPage('initial', ctrl.signal)
  }, [fetchPage])

  return {
    events,
    hasMore: nextCursor !== null,
    status,
    error,
    loadMore,
    refresh,
  }
}

type ListEventsParams = NonNullable<Parameters<typeof listEvents>[0]['params']>

function networkErr(cause: unknown): EmbedError {
  return new EmbedError({ kind: 'network', cause, message: 'network error' })
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
