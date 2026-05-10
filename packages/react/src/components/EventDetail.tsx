'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  hasParseableDiff,
  renderDiff,
  type DiffLine,
  type Event,
} from '@everscribe/components-core'

export interface EventDetailProps {
  event: Event
  onClose: () => void
  // theme propagates the parent's theme into the portal so the modal's
  // CSS variables (--audit-trail-bg, --audit-trail-fg, --audit-trail-overlay, …) still resolve
  // — the portal target is document.body, which sits outside .audit-trail-root.
  theme?: 'light' | 'dark'
}

type Tab = 'raw' | 'diff' | 'metadata'

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
  const highlightedJson = useMemo(() => highlightJSON(rawJson), [rawJson])
  const metadataRows = useMemo(() => buildMetadataRows(event.metadata), [event.metadata])
  const showMetadata = metadataRows.length > 0

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
    <div className={`audit-trail-portal audit-trail-theme-${theme}`}>
      <div className="audit-trail-inspect-backdrop" onMouseDown={onClose}>
        <div
          className="audit-trail-inspect-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-trail-inspect-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          ref={closeBtnRef}
          className="audit-trail-inspect-close"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
        <h2 id="audit-trail-inspect-title" className="audit-trail-inspect-title">
          Inspect Event
        </h2>
        <p className="audit-trail-inspect-subtitle">
          <code>{event.action || '—'}</code>
          {' · '}
          {formatHeaderTimestamp(event.occurred_at)}
          {' · ID '}
          <code>{event.id}</code>
        </p>

        {(showDiff || showMetadata) && (
          <div className="audit-trail-inspect-tabs" role="tablist" aria-label="View">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'raw'}
              className={inspectTabClass(tab === 'raw')}
              onClick={() => setTab('raw')}
            >
              Raw
            </button>
            {showDiff && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'diff'}
                className={inspectTabClass(tab === 'diff')}
                onClick={() => setTab('diff')}
              >
                Diff
              </button>
            )}
            {showMetadata && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'metadata'}
                className={inspectTabClass(tab === 'metadata')}
                onClick={() => setTab('metadata')}
              >
                Metadata
              </button>
            )}
          </div>
        )}

        {tab === 'raw' && (
          <div className="audit-trail-inspect-panel">
            <div className="audit-trail-code-block-wrap">
              <pre className="audit-trail-code-block">
                {/* dangerouslySetInnerHTML carries pre-escaped HTML
                    from highlightJSON — every value-bearing slot in
                    the source string is HTML-escaped before the
                    token regex runs, so injected user data renders
                    as text. */}
                <code dangerouslySetInnerHTML={{ __html: highlightedJson }} />
              </pre>
              <button
                type="button"
                className="audit-trail-copy-button"
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
          <div className="audit-trail-inspect-panel">
            <DiffTable lines={diff.lines} />
          </div>
        )}

        {tab === 'metadata' && showMetadata && (
          <div className="audit-trail-inspect-panel">
            <MetadataTable rows={metadataRows} />
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
    <div className="audit-trail-diff-wrap">
      <table className="audit-trail-diff-table">
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
                className={`audit-trail-diff-cell audit-trail-diff-before-${
                  line.beforeKind || 'blank'
                }`}
              >
                <pre>{line.before}</pre>
              </td>
              <td
                className={`audit-trail-diff-cell audit-trail-diff-after-${
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

function inspectTabClass(active: boolean): string {
  return active
    ? 'audit-trail-inspect-tab audit-trail-inspect-tab-active'
    : 'audit-trail-inspect-tab'
}

// ============================================================
// JSON syntax highlighter for the Raw tab. Walks the pretty-
// printed source, escapes HTML, and wraps tokens in <span>
// classes the CSS colors. Punctuation (braces, commas, colons)
// keeps the default text color.
// ============================================================
function highlightJSON(json: string): string {
  const safe = escapeHTML(json)
  return safe.replace(
    /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'audit-trail-json-num'
      if (match.startsWith('"')) {
        cls = /:$/.test(match)
          ? 'audit-trail-json-key'
          : 'audit-trail-json-str'
      } else if (/true|false/.test(match)) {
        cls = 'audit-trail-json-bool'
      } else if (/null/.test(match)) {
        cls = 'audit-trail-json-null'
      }
      return `<span class="${cls}">${match}</span>`
    },
  )
}

function escapeHTML(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ============================================================
// Metadata tab — flat key/value table. Renders each top-level
// metadata field as one row with type hint + value. Nested
// objects / arrays render compactly so the column doesn't blow
// out; users still get the full picture from the Raw tab.
// ============================================================

interface MetadataRow {
  key: string
  value: string
  type: string
}

function buildMetadataRows(metadata: Record<string, unknown> | undefined): MetadataRow[] {
  if (!metadata) return []
  const keys = Object.keys(metadata)
  if (keys.length === 0) return []
  keys.sort()
  return keys.map((k) => {
    const raw = metadata[k]
    return { key: k, value: renderMetadataValue(raw), type: classifyValue(raw) }
  })
}

function renderMetadataValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  // Objects/arrays render as compact JSON so the cell stays readable.
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function classifyValue(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  if (typeof v === 'object') return 'object'
  return typeof v
}

function MetadataTable({ rows }: { rows: MetadataRow[] }) {
  return (
    <table className="audit-trail-metadata-kv-table">
      <thead>
        <tr>
          <th className="audit-trail-md-col-key">Key</th>
          <th className="audit-trail-md-col-type">Type</th>
          <th className="audit-trail-md-col-value">Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td className="audit-trail-md-col-key">
              <code>{r.key}</code>
            </td>
            <td className="audit-trail-md-col-type">
              <span className="audit-trail-muted">{r.type}</span>
            </td>
            <td className="audit-trail-md-col-value">
              <code>{r.value}</code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
