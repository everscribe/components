import type { ReactNode } from 'react'
import type { Event } from '../lib/types.js'

export interface EventRowProps {
  event: Event
  columns: string[]
  onClick?: (event: Event) => void
}

const TIMESTAMP_FMT = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
})

export function EventRow({ event, columns, onClick }: EventRowProps) {
  const interactive = Boolean(onClick)
  return (
    <tr
      className="evs-row"
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
        <td key={col} className={`evs-cell evs-cell-${col}`}>
          {renderCell(col, event)}
        </td>
      ))}
    </tr>
  )
}

function renderCell(column: string, event: Event): ReactNode {
  const value = getField(event, column)
  if (value == null) return null

  if (column === 'occurred_at' && typeof value === 'string') {
    return <time dateTime={value} title={value}>{formatTimestamp(value)}</time>
  }
  if (typeof value === 'string') return value
  if (typeof value === 'object') return summarizeObject(value)
  return String(value)
}

function getField(event: Event, key: string): unknown {
  return (event as unknown as Record<string, unknown>)[key]
}

function formatTimestamp(rfc3339: string): string {
  const d = new Date(rfc3339)
  if (Number.isNaN(d.getTime())) return rfc3339
  return TIMESTAMP_FMT.format(d)
}

function summarizeObject(value: object): string {
  const obj = value as Record<string, unknown>
  for (const key of ['name', 'email', 'id', 'type']) {
    const v = obj[key]
    if (typeof v === 'string' && v.length > 0) return v
  }
  const keys = Object.keys(obj)
  if (keys.length === 0) return '—'
  return `{${keys.length} ${keys.length === 1 ? 'field' : 'fields'}}`
}
