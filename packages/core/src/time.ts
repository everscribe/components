// Shared timestamp formatting for the audit trail UI. The table cell
// shows "Month Day, Year, HH:MM:SS (N ago)" and the relative half is
// re-rendered on a 30s interval so the user always sees a fresh delta
// without losing the absolute reference.

const TIMESTAMP_FMT = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
})

export function formatAbsolute(rfc3339: string): string {
  const d = new Date(rfc3339)
  if (Number.isNaN(d.getTime())) return rfc3339
  return TIMESTAMP_FMT.format(d)
}

export function formatRelative(rfc3339: string, now: number): string {
  const d = new Date(rfc3339)
  if (Number.isNaN(d.getTime())) return ''
  const ms = now - d.getTime()
  // Clock-skew safety: events can't be in the future, but if the user's
  // clock disagrees with the server, render the closest "just now"
  // bucket rather than "in 3s".
  if (ms < 0) return 'just now'
  const seconds = Math.floor(ms / 1000)
  if (seconds < 30) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  const years = Math.floor(days / 365)
  return `${years}y ago`
}

// formatTimeCell composes the table cell's "absolute (relative)" form.
// `now` is injected so callers control re-render cadence: the element
// passes Date.now() on each tick; React passes a state value that
// updates every 30s via useRelativeTimeTick.
export function formatTimeCell(rfc3339: string, now: number): string {
  const absolute = formatAbsolute(rfc3339)
  const relative = formatRelative(rfc3339, now)
  if (!relative) return absolute
  return `${absolute} (${relative})`
}

// RELATIVE_TIME_TICK_MS is the polling cadence both adapters use. 30s
// is fine-grained enough to feel responsive in the seconds/minutes
// regime and coarse enough to avoid wasted updates further out.
export const RELATIVE_TIME_TICK_MS = 30000
