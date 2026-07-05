import type { ReactNode } from 'react'
import { COLUMN_LABELS, formatTimeCell, type Event } from '@everscribe/components-core'

export interface EventRowProps {
  event: Event
  columns: string[]
  // `now` is passed in so EventTable controls the tick cadence; rows
  // stay pure renders driven by their props.
  now: number
  onClick?: (event: Event) => void
}

export function EventRow({ event, columns, now, onClick }: EventRowProps) {
  const interactive = Boolean(onClick)
  return (
    <tr
      className="audit-trail-row"
      onClick={interactive ? () => onClick!(event) : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick!(event)
              }
            }
          : undefined
      }
    >
      {columns.map((col) => (
        <td
          key={col}
          className={`audit-trail-cell audit-trail-cell-${col}`}
          data-label={COLUMN_LABELS[col] ?? col}
        >
          {renderCell(col, event, now)}
        </td>
      ))}
    </tr>
  )
}

function renderCell(column: string, event: Event, now: number): ReactNode {
  switch (column) {
    case 'result':
      return renderResult(event.result)
    case 'origin':
      return renderOrigin(event.origin)
    case 'change':
    case 'metadata':
      return renderPresence(getField(event, column))
    default: {
      const value = getField(event, column)
      if (value == null) return null
      if (column === 'occurred_at' && typeof value === 'string') {
        return (
          <time dateTime={value} title={value}>
            {formatTimeCell(value, now)}
          </time>
        )
      }
      if (typeof value === 'string') return value
      if (typeof value === 'object') return summarizeObject(value)
      return String(value)
    }
  }
}

function getField(event: Event, key: string): unknown {
  return (event as unknown as Record<string, unknown>)[key]
}

// renderResult shows the status as a small pill so the table cell
// reads at a glance ("ok" / "error") instead of the generic
// {N fields} fallback. The numeric code is intentionally omitted -
// it lives in the Raw tab of the inspect modal for callers who need it.
function renderResult(value: unknown): ReactNode {
  if (value == null || typeof value !== 'object') return '-'
  const obj = value as { status?: unknown }
  const status = typeof obj.status === 'string' ? obj.status : ''
  if (!status) return '-'
  return (
    <span className={`audit-trail-status audit-trail-status-${cssToken(status)}`}>{status}</span>
  )
}

// renderOrigin prefers the network-identity fields a reader actually
// scans for (IP, hostname). Falls back to the generic object summary
// only when none of those are present.
function renderOrigin(value: unknown): ReactNode {
  if (value == null || typeof value !== 'object') return '-'
  const obj = value as Record<string, unknown>
  for (const key of ['ip', 'hostname', 'host']) {
    const v = obj[key]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return summarizeObject(obj)
}

// renderPresence collapses arbitrary-shape JSON columns (change,
// metadata) to a single "View" affordance when content exists, else
// "-". The full payload is still reachable via the row's detail
// panel; the cell just signals presence.
function renderPresence(value: unknown): ReactNode {
  if (value == null) return '-'
  if (typeof value === 'object') {
    const keys = Object.keys(value as object)
    if (keys.length === 0) return '-'
    return <span className="audit-trail-cell-presence">View</span>
  }
  if (typeof value === 'string' && value.length > 0) {
    return <span className="audit-trail-cell-presence">View</span>
  }
  return '-'
}

function summarizeObject(value: object): string {
  const obj = value as Record<string, unknown>
  for (const key of ['name', 'email', 'id', 'type']) {
    const v = obj[key]
    if (typeof v === 'string' && v.length > 0) return v
  }
  const keys = Object.keys(obj)
  if (keys.length === 0) return '-'
  return `{${keys.length} ${keys.length === 1 ? 'field' : 'fields'}}`
}

// cssToken sanitizes a status string ("ok", "ERROR", "needs review")
// into a token safe to slot into an audit-trail-status-{token} class name.
function cssToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
}
