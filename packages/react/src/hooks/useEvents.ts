'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  createEventsStore,
  type EmbedError,
  type Event,
  type EventsStatus,
  type EventsStore,
  type EventsStoreState,
} from '@everscribe/components-core'

export type { EventsStatus } from '@everscribe/components-core'

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
  tenantId?: string
  targetType?: string
  targetId?: string
  resultStatus?: string
  originIP?: string
  q?: string
}

export interface UseEventsResult {
  events: Event[]
  hasMore: boolean
  status: EventsStatus
  error: EmbedError | null
  loadMore: () => void
  refresh: () => void
}

const EMPTY_STATE: EventsStoreState = {
  events: [],
  nextCursor: null,
  status: 'loading',
  error: null,
}

const NOOP_UNSUB = () => {}

export function useEvents(opts: UseEventsOptions): UseEventsResult {
  const [store, setStore] = useState<EventsStore | null>(null)

  useEffect(() => {
    if (!opts.token) {
      setStore(null)
      return
    }
    const s = createEventsStore({
      apiBase: opts.apiBase,
      token: opts.token,
      pageSize: opts.pageSize,
      pollInterval: opts.pollInterval,
      tokenEndpoint: opts.tokenEndpoint,
      onTokenExpired: opts.onTokenExpired,
      onError: opts.onError,
      since: opts.since,
      before: opts.before,
      action: opts.action,
      actor: opts.actor,
      actorType: opts.actorType,
      tenantId: opts.tenantId,
      targetType: opts.targetType,
      targetId: opts.targetId,
      resultStatus: opts.resultStatus,
      originIP: opts.originIP,
      q: opts.q,
    })
    setStore(s)
    return () => {
      s.dispose()
    }
  }, [
    opts.token,
    opts.apiBase,
    opts.pageSize,
    opts.pollInterval,
    opts.since,
    opts.before,
    opts.action,
    opts.actor,
    opts.actorType,
    opts.tenantId,
    opts.targetType,
    opts.targetId,
    opts.resultStatus,
    opts.originIP,
    opts.q,
  ])

  const subscribe = useMemo(
    () => (listener: () => void) => store?.subscribe(listener) ?? NOOP_UNSUB,
    [store],
  )
  const getSnapshot = () => store?.getSnapshot() ?? EMPTY_STATE
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  return {
    events: state.events,
    hasMore: state.nextCursor !== null,
    status: state.status,
    error: state.error,
    loadMore: () => store?.loadMore(),
    refresh: () => store?.refresh(),
  }
}
