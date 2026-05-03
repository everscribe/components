'use client'

import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { EventDetail } from './components/EventDetail.js'
import { EventTable } from './components/EventTable.js'
import { useClaims } from './hooks/useClaims.js'
import { useEvents } from './hooks/useEvents.js'
import type { EmbedError } from './lib/api.js'
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
  token: string
  apiBase?: string
  pageSize?: number
  pollInterval?: number
  theme?: 'light' | 'dark'
  className?: string
  style?: CSSProperties
  tokenEndpoint?: string
  onTokenExpired?: () => Promise<string>
  onError?: (err: Error) => void
}

export function EverscribeEvents(props: EverscribeEventsProps) {
  const claims = useClaims(props.token)
  const [selected, setSelected] = useState<Event | null>(null)

  const visibleColumns = useMemo(() => {
    if (claims?.columns && claims.columns.length > 0) return claims.columns
    return DEFAULT_VISIBLE_COLUMNS
  }, [claims])

  const { events, hasMore, status, error, loadMore, refresh } = useEvents({
    apiBase: props.apiBase ?? DEFAULT_API_BASE,
    token: props.token,
    pageSize: props.pageSize ?? DEFAULT_PAGE_SIZE,
    pollInterval: props.pollInterval ?? DEFAULT_POLL_INTERVAL_MS,
    tokenEndpoint: props.tokenEndpoint,
    onTokenExpired: props.onTokenExpired,
    onError: props.onError,
  })

  const rootClassName = [
    'evs-root',
    `evs-theme-${props.theme ?? 'light'}`,
    props.className,
  ]
    .filter(Boolean)
    .join(' ')

  if (claims === null) {
    return (
      <div className={rootClassName} style={props.style}>
        <div className="evs-state evs-state-error">Invalid token.</div>
      </div>
    )
  }

  return (
    <div className={rootClassName} style={props.style}>
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
      {events.length > 0 && (
        <>
          <EventTable
            events={events}
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
