'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { hasParseableDiff, renderDiff } from '../lib/diff.js'
import type { DiffLine } from '../lib/diff.js'
import type { Event } from '../lib/types.js'

export interface EventDetailProps {
  event: Event
  onClose: () => void
  // theme propagates the parent's theme into the portal so the modal's
  // CSS variables (--evs-bg, --evs-fg, --evs-overlay, …) still resolve
  // — the portal target is document.body, which sits outside .evs-root.
  theme?: 'light' | 'dark'
}

type Tab = 'raw' | 'diff'

export function EventDetail({ event, onClose, theme = 'light' }: EventDetailProps) {
  const [mounted, setMounted] = useState(false)
  const [tab, setTab] = useState<Tab>('raw')
  const [copied, setCopied] = useState(false)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  const showDiff = hasParseableDiff(event.change)
  const diff = useMemo(
    () => (showDiff ? renderDiff(event.change) : { lines: [] }),
    [event.change, showDiff],
  )
  const rawJson = useMemo(() => JSON.stringify(event, null, 2), [event])

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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawJson)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard permission denied or unsupported — silently no-op.
      // The user can still select the text manually.
    }
  }

  if (!mounted) return null

  return createPortal(
    <div className={`evs-portal evs-theme-${theme}`}>
      <div className="evs-inspect-backdrop" onMouseDown={onClose}>
        <div
          className="evs-inspect-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="evs-inspect-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          ref={closeBtnRef}
          className="evs-inspect-close"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
        <h2 id="evs-inspect-title" className="evs-inspect-title">
          Inspect Event
        </h2>
        <p className="evs-inspect-subtitle">
          <code>{event.action || '—'}</code>
          {' · '}
          {formatHeaderTimestamp(event.occurred_at)}
          {' · ID '}
          <code>{event.id}</code>
        </p>

        {showDiff && (
          <div className="evs-inspect-tabs" role="tablist" aria-label="View">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'raw'}
              className={
                tab === 'raw'
                  ? 'evs-inspect-tab evs-inspect-tab-active'
                  : 'evs-inspect-tab'
              }
              onClick={() => setTab('raw')}
            >
              Raw
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'diff'}
              className={
                tab === 'diff'
                  ? 'evs-inspect-tab evs-inspect-tab-active'
                  : 'evs-inspect-tab'
              }
              onClick={() => setTab('diff')}
            >
              Diff
            </button>
          </div>
        )}

        {tab === 'raw' && (
          <div className="evs-inspect-panel">
            <div className="evs-code-block-wrap">
              <pre className="evs-code-block">
                <code>{rawJson}</code>
              </pre>
              <button
                type="button"
                className="evs-copy-button"
                onClick={handleCopy}
                aria-label={copied ? 'Copied' : 'Copy to clipboard'}
                title={copied ? 'Copied' : 'Copy to clipboard'}
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </button>
            </div>
          </div>
        )}

        {tab === 'diff' && showDiff && (
          <div className="evs-inspect-panel">
            <DiffTable lines={diff.lines} />
          </div>
        )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function DiffTable({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="evs-diff-wrap">
      <table className="evs-diff-table">
        <thead>
          <tr>
            <th>Before</th>
            <th>After</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => (
            <tr key={idx}>
              <td
                className={`evs-diff-cell evs-diff-before-${
                  line.beforeKind || 'blank'
                }`}
              >
                <pre>{line.before}</pre>
              </td>
              <td
                className={`evs-diff-cell evs-diff-after-${
                  line.afterKind || 'blank'
                }`}
              >
                <pre>{line.after}</pre>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

// formatHeaderTimestamp renders an ISO timestamp as
// "Month D, YYYY HH:MM:SS.mmm UTC" — matches the upstream events UI
// header. Always UTC so two readers in different timezones see the
// same string when comparing notes on an event.
function formatHeaderTimestamp(rfc3339: string | undefined): string {
  if (!rfc3339) return '—'
  const d = new Date(rfc3339)
  if (Number.isNaN(d.getTime())) return rfc3339
  const month = MONTHS[d.getUTCMonth()] ?? ''
  const day = d.getUTCDate()
  const year = d.getUTCFullYear()
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  const ss = String(d.getUTCSeconds()).padStart(2, '0')
  const ms = String(d.getUTCMilliseconds()).padStart(3, '0')
  return `${month} ${day}, ${year} ${hh}:${mm}:${ss}.${ms} UTC`
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]
