import { COLUMN_LABELS, formatTimeCell, type Event } from '@everscribe/components-core'

import { h, type Child } from './dom.js'

export function renderTable(
  events: Event[],
  columns: string[],
  onRowClick?: (event: Event) => void,
): HTMLElement {
  const headerCells = columns.map((col) =>
    h(
      'th',
      { scope: 'col', class: `audit-trail-th audit-trail-th-${col}` },
      COLUMN_LABELS[col] ?? col,
    ),
  )
  const rows = events.map((event) => renderRow(event, columns, onRowClick))
  return h(
    'div',
    { class: 'audit-trail-table-wrap' },
    h(
      'table',
      { class: 'audit-trail-table' },
      h('thead', null, h('tr', null, ...headerCells)),
      h('tbody', null, ...rows),
    ),
  )
}

function renderRow(
  event: Event,
  columns: string[],
  onClick?: (event: Event) => void,
): HTMLElement {
  const interactive = Boolean(onClick)
  const cells = columns.map((col) =>
    h(
      'td',
      {
        class: `audit-trail-cell audit-trail-cell-${col}`,
        'data-label': COLUMN_LABELS[col] ?? col,
      },
      renderCell(col, event),
    ),
  )
  const tr = h(
    'tr',
    {
      class: 'audit-trail-row',
      tabindex: interactive ? '0' : undefined,
    },
    ...cells,
  )
  if (interactive && onClick) {
    tr.addEventListener('click', () => onClick(event))
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onClick(event)
      }
    })
  }
  return tr
}

function renderCell(column: string, event: Event): Child {
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
        return h(
          'time',
          {
            datetime: value,
            title: value,
            // Marker for AuditTrailElement's 30s tick: each render uses
            // Date.now(), and the timer queries by this attribute to
            // refresh the relative half without rebuilding the table.
            'data-occurred-at': value,
          },
          formatTimeCell(value, Date.now()),
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
function renderResult(value: unknown): Child {
  if (value == null || typeof value !== 'object') return '-'
  const obj = value as { status?: unknown }
  const status = typeof obj.status === 'string' ? obj.status : ''
  if (!status) return '-'
  return h(
    'span',
    { class: `audit-trail-status audit-trail-status-${cssToken(status)}` },
    status,
  )
}

// renderOrigin prefers the network-identity fields a reader actually
// scans for (IP, hostname). Falls back to the generic object summary
// only when none of those are present.
function renderOrigin(value: unknown): Child {
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
function renderPresence(value: unknown): Child {
  if (value == null) return '-'
  if (typeof value === 'object') {
    const keys = Object.keys(value as object)
    if (keys.length === 0) return '-'
    return h('span', { class: 'audit-trail-cell-presence' }, 'View')
  }
  if (typeof value === 'string' && value.length > 0) {
    return h('span', { class: 'audit-trail-cell-presence' }, 'View')
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

function cssToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
}
