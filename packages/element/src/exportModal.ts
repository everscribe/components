import type { ExportFormat } from '@everscribe/components-core'

import { h } from './dom.js'

export interface ExportModalOptions {
  theme: 'light' | 'dark'
  // onDownload runs the actual export. Resolves on success; the modal
  // self-closes. Rejects with an Error to surface a message inline
  // without dismissing the modal.
  onDownload: (format: ExportFormat) => Promise<void>
  // Fired on user-initiated dismissal (Esc, backdrop, Cancel button).
  // Not fired on programmatic dispose, nor on a successful download
  // (the modal still closes itself in both cases - the parent already
  // knows or doesn't care).
  onClose: () => void
}

type Status = 'idle' | 'downloading' | 'error'

// openExportModal mounts the export modal as a child of document.body
// and returns a dispose function. See openEventDetail for the dispose
// vs onClose contract.
export function openExportModal(opts: ExportModalOptions): () => void {
  const { theme, onDownload, onClose } = opts

  let format: ExportFormat | null = null
  let status: Status = 'idle'
  let errMsg: string | null = null

  const csvCard = renderFormatCard(
    'csv',
    'CSV',
    'Spreadsheet-friendly. Common fields are columns; nested fields (origin, metadata, change) are JSON in single columns.',
    () => selectFormat('csv'),
  )
  const jsonCard = renderFormatCard(
    'json',
    'JSON',
    'Full event objects preserving nested structure. Same shape the API returns.',
    () => selectFormat('json'),
  )

  const errorSlot = h('div', { class: 'audit-trail-export-error-slot' })

  const downloadBtn = h(
    'button',
    { type: 'button', class: 'audit-trail-button' },
    'Download',
  ) as HTMLButtonElement
  downloadBtn.disabled = true

  const cancelBtn = h(
    'button',
    {
      type: 'button',
      class: 'audit-trail-button audit-trail-button-secondary',
    },
    'Cancel',
  ) as HTMLButtonElement

  const modal = h(
    'div',
    {
      class: 'audit-trail-export-modal',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'audit-trail-export-title',
    },
    h(
      'h2',
      { id: 'audit-trail-export-title', class: 'audit-trail-export-title' },
      'Export events',
    ),
    h(
      'p',
      { class: 'audit-trail-export-blurb' },
      'The current filters and time range are applied. Capped at 100,000 rows - narrow the filters or time window if you hit it.',
    ),
    h('div', { class: 'audit-trail-export-options' }, csvCard, jsonCard),
    errorSlot,
    h('div', { class: 'audit-trail-export-actions' }, downloadBtn, cancelBtn),
  )

  const backdrop = h(
    'div',
    { class: 'audit-trail-export-backdrop', role: 'presentation' },
    modal,
  )
  const portal = h(
    'div',
    { class: `audit-trail-portal audit-trail-theme-${theme}` },
    backdrop,
  )

  // ---- selection / state transitions ----

  const selectFormat = (fmt: ExportFormat) => {
    format = fmt
    setSelected(csvCard, fmt === 'csv')
    setSelected(jsonCard, fmt === 'json')
    refreshButtons()
  }

  const refreshButtons = () => {
    downloadBtn.disabled = !format || status === 'downloading'
    downloadBtn.textContent = status === 'downloading' ? 'Downloading…' : 'Download'
    cancelBtn.disabled = status === 'downloading'
    if (status === 'error' && errMsg) {
      errorSlot.replaceChildren(
        h(
          'div',
          { class: 'audit-trail-export-error', role: 'alert' },
          errMsg,
        ),
      )
    } else {
      errorSlot.replaceChildren()
    }
  }

  // ---- lifecycle ----

  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    document.removeEventListener('keydown', onKey)
    portal.remove()
  }
  const userClose = () => {
    if (disposed) return
    if (status === 'downloading') return
    dispose()
    onClose()
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') userClose()
  }

  cancelBtn.addEventListener('click', userClose)
  backdrop.addEventListener('click', (e) => {
    if (e.target !== backdrop) return
    userClose()
  })
  document.addEventListener('keydown', onKey)

  downloadBtn.addEventListener('click', () => {
    if (!format || status === 'downloading') return
    status = 'downloading'
    errMsg = null
    refreshButtons()
    void (async () => {
      try {
        await onDownload(format!)
        if (disposed) return
        // Successful download - close the modal. We don't fire
        // onClose because the parent already drove the action.
        dispose()
      } catch (err) {
        if (disposed) return
        status = 'error'
        errMsg = err instanceof Error ? err.message : 'Export failed.'
        refreshButtons()
      }
    })()
  })

  document.body.appendChild(portal)
  return dispose
}

function renderFormatCard(
  format: ExportFormat,
  title: string,
  body: string,
  onSelect: () => void,
): HTMLElement {
  const btn = h(
    'button',
    {
      type: 'button',
      role: 'radio',
      'aria-checked': 'false',
      class: 'audit-trail-export-card',
      'data-format': format,
    },
    h('span', { class: 'audit-trail-export-card-title' }, title),
    h('span', { class: 'audit-trail-export-card-body' }, body),
  )
  btn.addEventListener('click', onSelect)
  return btn
}

function setSelected(card: HTMLElement, selected: boolean) {
  card.className = selected
    ? 'audit-trail-export-card audit-trail-export-card-selected'
    : 'audit-trail-export-card'
  card.setAttribute('aria-checked', selected ? 'true' : 'false')
}
