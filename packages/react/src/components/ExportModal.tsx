import { useEffect, useState } from 'react'
import type { ExportFormat } from '@everscribe/components-core'

export interface ExportModalProps {
  open: boolean
  onClose: () => void
  // onDownload runs the export. The parent owns the API call and the
  // browser download trigger so the modal stays UI-only and the token
  // refresh path can live alongside the rest of useEvents.
  onDownload: (format: ExportFormat) => Promise<void>
}

type Status = 'idle' | 'downloading' | 'error'

export function ExportModal({ open, onClose, onDownload }: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [errMsg, setErrMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setFormat(null)
      setStatus('idle')
      setErrMsg(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && status !== 'downloading') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, status, onClose])

  if (!open) return null

  const handleDownload = async () => {
    if (!format) return
    setStatus('downloading')
    setErrMsg(null)
    try {
      await onDownload(format)
      onClose()
    } catch (err) {
      setStatus('error')
      setErrMsg(err instanceof Error ? err.message : 'Export failed.')
    }
  }

  const onBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    if (status === 'downloading') return
    onClose()
  }

  return (
    <div
      className="audit-trail-export-backdrop"
      role="presentation"
      onClick={onBackdropClick}
    >
      <div
        className="audit-trail-export-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-trail-export-title"
      >
        <h2 id="audit-trail-export-title" className="audit-trail-export-title">
          Export events
        </h2>
        <p className="audit-trail-export-blurb">
          The current filters and time range are applied. Capped at 100,000 rows
          — narrow the filters or time window if you hit it.
        </p>

        <div className="audit-trail-export-options">
          <FormatCard
            format="csv"
            selected={format === 'csv'}
            onSelect={() => setFormat('csv')}
            title="CSV"
            body="Spreadsheet-friendly. Common fields are columns; nested fields (origin, metadata, change) are JSON in single columns."
          />
          <FormatCard
            format="json"
            selected={format === 'json'}
            onSelect={() => setFormat('json')}
            title="JSON"
            body="Full event objects preserving nested structure. Same shape the API returns."
          />
        </div>

        {status === 'error' && errMsg && (
          <div className="audit-trail-export-error" role="alert">
            {errMsg}
          </div>
        )}

        <div className="audit-trail-export-actions">
          <button
            type="button"
            className="audit-trail-button"
            onClick={handleDownload}
            disabled={!format || status === 'downloading'}
          >
            {status === 'downloading' ? 'Downloading…' : 'Download'}
          </button>
          <button
            type="button"
            className="audit-trail-button audit-trail-button-secondary"
            onClick={onClose}
            disabled={status === 'downloading'}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

interface FormatCardProps {
  format: ExportFormat
  selected: boolean
  onSelect: () => void
  title: string
  body: string
}

function FormatCard({ format, selected, onSelect, title, body }: FormatCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={
        selected
          ? 'audit-trail-export-card audit-trail-export-card-selected'
          : 'audit-trail-export-card'
      }
      onClick={onSelect}
      data-format={format}
    >
      <span className="audit-trail-export-card-title">{title}</span>
      <span className="audit-trail-export-card-body">{body}</span>
    </button>
  )
}
