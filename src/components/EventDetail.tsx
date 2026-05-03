'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Event } from '../lib/types.js'
import { COLUMN_LABELS, FIELD_ORDER } from '../lib/columns.js'

export interface EventDetailProps {
  event: Event
  onClose: () => void
}

const TIMESTAMP_FMT = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
})

export function EventDetail({ event, onClose }: EventDetailProps) {
  const [mounted, setMounted] = useState(false)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!mounted) return
    closeBtnRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mounted, onClose])

  if (!mounted) return null

  const fields = orderFields(event)
  const title = event.action || 'Event'

  return createPortal(
    <div className="evs-detail-backdrop" onMouseDown={onClose}>
      <div
        className="evs-detail-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="evs-detail-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="evs-detail-header">
          <h2 id="evs-detail-title" className="evs-detail-title">
            {title}
          </h2>
          <button
            type="button"
            ref={closeBtnRef}
            className="evs-detail-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <dl className="evs-detail-body">
          {fields.map(([key, value]) => (
            <div key={key} className={`evs-detail-row evs-detail-row-${key}`}>
              <dt className="evs-detail-label">{COLUMN_LABELS[key] ?? key}</dt>
              <dd className="evs-detail-value">{renderValue(key, value)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>,
    document.body,
  )
}

function orderFields(event: Event): Array<[string, unknown]> {
  const obj = event as unknown as Record<string, unknown>
  const ordered: Array<[string, unknown]> = []
  const seen = new Set<string>()
  for (const key of FIELD_ORDER) {
    if (key in obj && obj[key] != null) {
      ordered.push([key, obj[key]])
      seen.add(key)
    }
  }
  for (const key of Object.keys(obj)) {
    if (!seen.has(key) && obj[key] != null) {
      ordered.push([key, obj[key]])
    }
  }
  return ordered
}

function renderValue(key: string, value: unknown): ReactNode {
  if (key === 'occurred_at' && typeof value === 'string') {
    return <time dateTime={value}>{formatTimestamp(value)}</time>
  }
  if (typeof value === 'string') {
    return <span className="evs-detail-string">{value}</span>
  }
  if (typeof value === 'object' && value !== null) {
    return <pre className="evs-detail-json">{JSON.stringify(value, null, 2)}</pre>
  }
  return <span>{String(value)}</span>
}

function formatTimestamp(rfc3339: string): string {
  const d = new Date(rfc3339)
  if (Number.isNaN(d.getTime())) return rfc3339
  return TIMESTAMP_FMT.format(d)
}
