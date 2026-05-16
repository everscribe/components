'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ActiveFilterChips } from './components/ActiveFilterChips.js'
import { ColumnPicker } from './components/ColumnPicker.js'
import { EventDetail } from './components/EventDetail.js'
import { EventTable } from './components/EventTable.js'
import { ExportModal } from './components/ExportModal.js'
import {
  FiltersPanel,
  countActiveColumnFilters,
  parseQClauses,
} from './components/FiltersPanel.js'
import type { FilterValues, TimeRangePreset } from './components/FiltersPanel.js'
import { FiltersToggle } from './components/FiltersToggle.js'
import { LiveIndicator } from './components/LiveIndicator.js'
import { useClaims } from './hooks/useClaims.js'
import { useDistinctValues } from './hooks/useDistinctValues.js'
import { useEvents } from './hooks/useEvents.js'
import {
  ALL_COLUMNS,
  EmbedError,
  exportEvents,
  fetchTokenViaOpts,
  type Event,
  type ExportFormat,
} from '@everscribe/components-core'

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

export type DefaultTimeRange = '24h' | '7d' | '30d' | 'all'

export interface AuditTrailProps {
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
  /**
   * Initial time-range preset for the filters panel. Defaults to
   * `'all'` to preserve historical embed behavior (no time bound).
   * Set to `'7d'` to match the upstream events UI default.
   */
  defaultTimeRange?: DefaultTimeRange
}

type BootstrapState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; token: string }
  | { phase: 'error'; reason: 'config' | 'fetch' }

export function AuditTrail(props: AuditTrailProps) {
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
  const [filters, setFilters] = useState<FilterValues>(() => ({
    range: (props.defaultTimeRange ?? 'all') as TimeRangePreset,
  }))
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  const pollIntervalMs = props.pollInterval ?? DEFAULT_POLL_INTERVAL_MS

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

  const { since: filterSince, before: filterBefore } = useMemo(
    () => resolveTimeBounds(filters),
    [filters],
  )

  // Live indicator tracks whether useEvents will actually poll —
  // mirrors the disable condition inside useEvents (pollInterval > 0
  // and no closed upper time bound).
  const livePollActive = pollIntervalMs > 0 && !filterBefore

  const distinct = useDistinctValues({
    apiBase: props.apiBase ?? DEFAULT_API_BASE,
    token: activeToken,
    tokenEndpoint: props.tokenEndpoint,
    onTokenExpired: props.onTokenExpired,
  })

  const { events, hasMore, status, error, loadMore, refresh } = useEvents({
    apiBase: props.apiBase ?? DEFAULT_API_BASE,
    token: activeToken,
    pageSize: props.pageSize ?? DEFAULT_PAGE_SIZE,
    pollInterval: pollIntervalMs,
    tokenEndpoint: props.tokenEndpoint,
    onTokenExpired: props.onTokenExpired,
    onError: props.onError,
    since: filterSince,
    before: filterBefore,
    action: filters.action,
    actor: filters.actor,
    actorType: filters.actorType,
    tenantId: filters.tenantId,
    targetType: filters.targetType,
    targetId: filters.targetId,
    resultStatus: filters.resultStatus,
    originIP: filters.originIP,
    q: filters.q,
  })

  const handleExportDownload = useCallback(
    async (format: ExportFormat) => {
      if (!activeToken) throw new Error('Not authenticated.')
      const apiBase = props.apiBase ?? DEFAULT_API_BASE
      const params = {
        format,
        since: filterSince,
        before: filterBefore,
        action: filters.action,
        actor: filters.actor,
        actorType: filters.actorType,
        tenantId: filters.tenantId,
        targetType: filters.targetType,
        targetId: filters.targetId,
        resultStatus: filters.resultStatus,
        originIP: filters.originIP,
        q: filters.q,
      }
      const run = (token: string) =>
        exportEvents({ apiBase, token, params })
      let result
      try {
        result = await run(activeToken)
      } catch (err) {
        if (err instanceof EmbedError && err.kind === 'unauthorized') {
          const refreshed = await fetchTokenViaOpts({
            tokenEndpoint: props.tokenEndpoint,
            onTokenExpired: props.onTokenExpired,
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
    },
    [
      activeToken,
      props.apiBase,
      props.tokenEndpoint,
      props.onTokenExpired,
      filterSince,
      filterBefore,
      filters.action,
      filters.actor,
      filters.actorType,
      filters.tenantId,
      filters.targetType,
      filters.targetId,
      filters.resultStatus,
      filters.originIP,
      filters.q,
    ],
  )

  const rootClassName = [
    'audit-trail-root',
    `audit-trail-theme-${props.theme ?? 'light'}`,
    props.className,
  ]
    .filter(Boolean)
    .join(' ')

  if (bootstrap.phase === 'error' && bootstrap.reason === 'config') {
    return (
      <div className={rootClassName} style={props.style}>
        <div className="audit-trail-state audit-trail-state-error">
          Configure <code>token</code>, <code>tokenEndpoint</code>, or{' '}
          <code>onTokenExpired</code>.
        </div>
      </div>
    )
  }

  if (bootstrap.phase === 'error' && bootstrap.reason === 'fetch') {
    return (
      <div className={rootClassName} style={props.style}>
        <div className="audit-trail-state audit-trail-state-error">
          <span>Couldn’t fetch token.</span>
          <button
            type="button"
            className="audit-trail-button"
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
        <div className="audit-trail-state audit-trail-state-loading">Loading…</div>
      </div>
    )
  }

  if (claims === null) {
    return (
      <div className={rootClassName} style={props.style}>
        <div className="audit-trail-state audit-trail-state-error">Invalid token.</div>
      </div>
    )
  }

  return (
    <div className={rootClassName} style={props.style}>
      <div className="audit-trail-toolbar">
        <LiveIndicator active={livePollActive} />
        <span className="audit-trail-toolbar-spacer" />
        <FiltersToggle
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          activeCount={
            countActiveColumnFilters(filters) +
            (filters.q ? parseQClauses(filters.q).length : 0)
          }
        />
        <button
          type="button"
          className="audit-trail-button"
          onClick={() => setExportOpen(true)}
        >
          Export
        </button>
        <ColumnPicker
          available={availableColumns}
          visible={visibleSet}
          onToggle={toggleColumn}
        />
      </div>

      <ActiveFilterChips value={filters} onChange={setFilters} />

      {filtersOpen && (
        <FiltersPanel
          value={filters}
          onChange={setFilters}
          distinct={distinct}
          claims={claims}
          apiBase={props.apiBase ?? DEFAULT_API_BASE}
          token={activeToken}
          tokenEndpoint={props.tokenEndpoint}
          onTokenExpired={props.onTokenExpired}
          onApplied={() => setFiltersOpen(false)}
        />
      )}

      {status === 'loading' && events.length === 0 && (
        <div className="audit-trail-state audit-trail-state-loading">Loading…</div>
      )}
      {status === 'expired' && (
        <div className="audit-trail-state audit-trail-state-error">Session expired.</div>
      )}
      {status === 'error' && error && (
        <div className="audit-trail-state audit-trail-state-error">
          <span>{errorMessage(error)}</span>
          <button type="button" className="audit-trail-button" onClick={refresh}>
            Retry
          </button>
        </div>
      )}
      {status === 'ok' && events.length === 0 && (
        <div className="audit-trail-state audit-trail-state-empty">No events match.</div>
      )}
      {events.length > 0 && visibleColumns.length === 0 && (
        <div className="audit-trail-state audit-trail-state-empty">No columns selected.</div>
      )}
      {events.length > 0 && visibleColumns.length > 0 && (
        <>
          <EventTable
            events={events}
            visibleColumns={visibleColumns}
            onRowClick={setSelected}
          />
          {hasMore && (
            <button type="button" className="audit-trail-button audit-trail-load-more" onClick={loadMore}>
              Load more
            </button>
          )}
        </>
      )}

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onDownload={handleExportDownload}
      />

      {selected && (
        <EventDetail
          key={selected.id}
          event={selected}
          onClose={() => setSelected(null)}
          theme={props.theme ?? 'light'}
        />
      )}
    </div>
  )
}

// resolveTimeBounds turns a FilterValues time-range preset into the
// concrete (since, before) ISO strings the API expects. 'all' yields
// no bounds; presets emit a relative `since` from now; 'custom' uses
// the user's own datetime-local strings (which we promote to ISO).
function resolveTimeBounds(filters: FilterValues): {
  since?: string
  before?: string
} {
  switch (filters.range) {
    case '24h':
      return { since: relativeIso(24 * 60 * 60 * 1000) }
    case '7d':
      return { since: relativeIso(7 * 24 * 60 * 60 * 1000) }
    case '30d':
      return { since: relativeIso(30 * 24 * 60 * 60 * 1000) }
    case 'custom':
      return {
        since: localToIso(filters.since),
        before: localToIso(filters.before),
      }
    case 'all':
    default:
      return {}
  }
}

function relativeIso(ms: number): string {
  return new Date(Date.now() - ms).toISOString()
}

function localToIso(value: string | undefined): string | undefined {
  if (!value) return undefined
  // datetime-local emits "YYYY-MM-DDTHH:mm" without a timezone; the
  // browser interprets that as local time when passed to Date(), and
  // toISOString normalizes to UTC. Round-trip is lossless for the
  // minute-precision the input supports.
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

// triggerBrowserDownload synthesizes an anchor click against a blob
// URL so the browser saves the export with the server-suggested name.
// Object URL is revoked on the next tick so the click has time to
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
