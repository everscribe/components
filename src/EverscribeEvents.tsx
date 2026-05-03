'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ActionFilter, actionMatches } from './components/ActionFilter.js'
import { ColumnPicker } from './components/ColumnPicker.js'
import { EventDetail } from './components/EventDetail.js'
import { EventTable } from './components/EventTable.js'
import { useClaims } from './hooks/useClaims.js'
import { useEvents } from './hooks/useEvents.js'
import { fetchTokenViaOpts } from './lib/api.js'
import type { EmbedError } from './lib/api.js'
import { ALL_COLUMNS } from './lib/columns.js'
import type { Event } from './lib/types.js'

const DEFAULT_API_BASE = 'https://everscribe.io/api/v1/embed'
const DEFAULT_PAGE_SIZE = 25
const DEFAULT_POLL_INTERVAL_MS = 5000
const DEFAULT_VISIBLE_COLUMNS = [
  'occurred_at',
  'action',
  'actor',
  'target',
  'tenant_id',
]

export interface EverscribeEventsProps {
  /**
   * Embed JWT. If omitted, the component fetches an initial token via
   * `tokenEndpoint` or `onTokenExpired` on mount.
   */
  token?: string
  apiBase?: string
  pageSize?: number
  pollInterval?: number
  theme?: 'light' | 'dark'
  className?: string
  style?: CSSProperties
  /**
   * URL on your backend that returns `{ token }` JSON. Used both for the
   * initial fetch (when `token` is omitted) and for refresh on 401. Sent
   * with `credentials: 'include'`.
   */
  tokenEndpoint?: string
  /**
   * Custom token-fetch callback. Takes precedence over `tokenEndpoint`
   * for both initial load and refresh.
   */
  onTokenExpired?: () => Promise<string>
  onError?: (err: Error) => void
}

type BootstrapState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; token: string }
  | { phase: 'error'; reason: 'config' | 'fetch' }

export function EverscribeEvents(props: EverscribeEventsProps) {
  const [bootstrap, setBootstrap] = useState<BootstrapState>(() =>
    props.token ? { phase: 'ready', token: props.token } : { phase: 'idle' },
  )
  const [retryCount, setRetryCount] = useState(0)

  // If a token prop is supplied (or changes), use it as the source of truth.
  useEffect(() => {
    if (props.token) setBootstrap({ phase: 'ready', token: props.token })
  }, [props.token])

  // Bootstrap fetch when no token prop is supplied. Read endpoint /
  // callback via a ref so inline handlers (`onTokenExpired={() => ...}`)
  // don't retrigger the effect on every render.
  const propsRef = useRef(props)
  propsRef.current = props

  useEffect(() => {
    if (propsRef.current.token) return
    if (!propsRef.current.tokenEndpoint && !propsRef.current.onTokenExpired) {
      setBootstrap({ phase: 'error', reason: 'config' })
      return
    }
    setBootstrap({ phase: 'loading' })
    let cancelled = false
    void (async () => {
      const t = await fetchTokenViaOpts({
        tokenEndpoint: propsRef.current.tokenEndpoint,
        onTokenExpired: propsRef.current.onTokenExpired,
      })
      if (cancelled) return
      if (!t) {
        setBootstrap({ phase: 'error', reason: 'fetch' })
        return
      }
      setBootstrap({ phase: 'ready', token: t })
    })()
    return () => {
      cancelled = true
    }
  }, [props.token, retryCount])

  const activeToken = bootstrap.phase === 'ready' ? bootstrap.token : null
  const claims = useClaims(activeToken)
  const [selected, setSelected] = useState<Event | null>(null)
  const [actionFilter, setActionFilter] = useState<string | null>(null)

  const availableColumns = useMemo(() => {
    if (claims?.columns && claims.columns.length > 0) return claims.columns
    return ALL_COLUMNS
  }, [claims])

  const [visibleSet, setVisibleSet] = useState<Set<string>>(() => {
    if (claims?.columns && claims.columns.length > 0) return new Set(claims.columns)
    return new Set(DEFAULT_VISIBLE_COLUMNS)
  })

  const visibleColumns = useMemo(
    () => availableColumns.filter((c) => visibleSet.has(c)),
    [availableColumns, visibleSet],
  )

  const toggleColumn = (col: string) => {
    setVisibleSet((prev) => {
      const next = new Set(prev)
      if (next.has(col)) next.delete(col)
      else next.add(col)
      return next
    })
  }

  const { events, hasMore, status, error, loadMore, refresh } = useEvents({
    apiBase: props.apiBase ?? DEFAULT_API_BASE,
    token: activeToken,
    pageSize: props.pageSize ?? DEFAULT_PAGE_SIZE,
    pollInterval: props.pollInterval ?? DEFAULT_POLL_INTERVAL_MS,
    tokenEndpoint: props.tokenEndpoint,
    onTokenExpired: props.onTokenExpired,
    onError: props.onError,
  })

  const filteredEvents = useMemo(() => {
    if (!actionFilter) return events
    return events.filter((e) => actionMatches(e.action, actionFilter))
  }, [events, actionFilter])

  const rootClassName = [
    'evs-root',
    `evs-theme-${props.theme ?? 'light'}`,
    props.className,
  ]
    .filter(Boolean)
    .join(' ')

  if (bootstrap.phase === 'error' && bootstrap.reason === 'config') {
    return (
      <div className={rootClassName} style={props.style}>
        <div className="evs-state evs-state-error">
          Configure <code>token</code>, <code>tokenEndpoint</code>, or{' '}
          <code>onTokenExpired</code>.
        </div>
      </div>
    )
  }

  if (bootstrap.phase === 'error' && bootstrap.reason === 'fetch') {
    return (
      <div className={rootClassName} style={props.style}>
        <div className="evs-state evs-state-error">
          <span>Couldn’t fetch token.</span>
          <button
            type="button"
            className="evs-button"
            onClick={() => setRetryCount((c) => c + 1)}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (bootstrap.phase !== 'ready') {
    return (
      <div className={rootClassName} style={props.style}>
        <div className="evs-state evs-state-loading">Loading…</div>
      </div>
    )
  }

  if (claims === null) {
    return (
      <div className={rootClassName} style={props.style}>
        <div className="evs-state evs-state-error">Invalid token.</div>
      </div>
    )
  }

  const showActionFilter = (claims.actions?.length ?? 0) > 0

  return (
    <div className={rootClassName} style={props.style}>
      <div className="evs-toolbar">
        <ColumnPicker
          available={availableColumns}
          visible={visibleSet}
          onToggle={toggleColumn}
        />
        {showActionFilter && (
          <ActionFilter
            actions={claims.actions!}
            value={actionFilter}
            onChange={setActionFilter}
          />
        )}
      </div>

      {status === 'loading' && events.length === 0 && (
        <div className="evs-state evs-state-loading">Loading…</div>
      )}
      {status === 'expired' && (
        <div className="evs-state evs-state-error">Session expired.</div>
      )}
      {status === 'error' && error && (
        <div className="evs-state evs-state-error">
          <span>{errorMessage(error)}</span>
          <button type="button" className="evs-button" onClick={refresh}>
            Retry
          </button>
        </div>
      )}
      {status === 'ok' && events.length === 0 && (
        <div className="evs-state evs-state-empty">No events yet.</div>
      )}
      {events.length > 0 && filteredEvents.length === 0 && (
        <div className="evs-state evs-state-empty">
          No events match the current filter.
        </div>
      )}
      {filteredEvents.length > 0 && visibleColumns.length === 0 && (
        <div className="evs-state evs-state-empty">No columns selected.</div>
      )}
      {filteredEvents.length > 0 && visibleColumns.length > 0 && (
        <>
          <EventTable
            events={filteredEvents}
            visibleColumns={visibleColumns}
            onRowClick={setSelected}
          />
          {hasMore && (
            <button type="button" className="evs-button evs-load-more" onClick={loadMore}>
              Load more
            </button>
          )}
        </>
      )}

      {selected && (
        <EventDetail
          key={selected.id}
          event={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function errorMessage(err: EmbedError): string {
  switch (err.kind) {
    case 'unauthorized':
      return 'Authentication failed.'
    case 'not_found':
      return 'Not found.'
    case 'rate_limited':
      return 'Too many requests. Please slow down.'
    case 'bad_request':
      return err.message || 'Bad request.'
    case 'server':
      return 'Server error. Please try again.'
    case 'network':
      return 'Network error. Check your connection.'
  }
}
