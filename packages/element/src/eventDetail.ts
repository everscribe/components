import {
  hasParseableDiff,
  renderDiff,
  type DiffLine,
  type Event,
} from '@everscribe/components-core'

import { h } from './dom.js'

export interface EventDetailOptions {
  event: Event
  theme: 'light' | 'dark'
  // Fired when the user dismisses the modal (Esc, backdrop click,
  // close button). Not fired when the parent dismisses programmatically
  // via the returned cleanup function.
  onClose: () => void
}

type Tab = 'raw' | 'diff' | 'metadata'

const COPY_ICON_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>' +
  '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>'

const CHECK_ICON_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<polyline points="20 6 9 17 4 12"></polyline></svg>'

// openEventDetail mounts the inspect modal as a child of document.body
// - the React adapter uses createPortal for this; in vanilla we just
// append. Returns a dispose function that removes the modal and tears
// down listeners. User-initiated dismissals (Esc, backdrop, X) call
// dispose() and then opts.onClose. Parent-initiated dismissals call
// dispose() directly without firing onClose.
export function openEventDetail(opts: EventDetailOptions): () => void {
  const { event, theme, onClose } = opts

  let tab: Tab = 'raw'
  let copied = false

  const showDiff = hasParseableDiff(event.change)
  const diff = showDiff ? renderDiff(event.change) : { lines: [] }
  const rawJson = JSON.stringify(event, null, 2)
  const highlightedJson = highlightJSON(rawJson)
  const metadataRows = buildMetadataRows(event.metadata)
  const showMetadata = metadataRows.length > 0

  // The portal wrapper carries the theme class so CSS variables
  // resolve outside `.audit-trail-root`.
  const portal = h('div', { class: `audit-trail-portal audit-trail-theme-${theme}` })

  const closeBtn = h(
    'button',
    {
      type: 'button',
      class: 'audit-trail-inspect-close',
      'aria-label': 'Close',
    },
    '×',
  ) as HTMLButtonElement

  // Modal contents are built lazily because the Raw/Diff tab swap
  // re-renders the panel - keeping this in a closure also avoids a
  // separate "selected tab" element ref.
  const panelContainer = h('div')

  const renderPanel = () => {
    panelContainer.replaceChildren(buildPanel())
  }

  const buildPanel = (): HTMLElement => {
    if (tab === 'diff' && showDiff) {
      return h(
        'div',
        { class: 'audit-trail-inspect-panel' },
        renderDiffTable(diff.lines),
      )
    }
    if (tab === 'metadata' && showMetadata) {
      return h(
        'div',
        { class: 'audit-trail-inspect-panel' },
        renderMetadataTable(metadataRows),
      )
    }
    // Default to Raw. highlightedJson carries pre-escaped HTML
    // with token <span>s - set via the `html` attribute so the
    // browser interprets the tags rather than text-escaping them.
    const codeBlock = h(
      'pre',
      { class: 'audit-trail-code-block' },
      h('code', { html: highlightedJson }),
    )
    const copyBtn = h(
      'button',
      {
        type: 'button',
        class: 'audit-trail-copy-button',
        'aria-label': copied ? 'Copied' : 'Copy to clipboard',
        title: copied ? 'Copied' : 'Copy to clipboard',
        html: copied ? CHECK_ICON_SVG : COPY_ICON_SVG,
      },
    )
    copyBtn.addEventListener('click', () => {
      void (async () => {
        try {
          await navigator.clipboard.writeText(rawJson)
          copied = true
          renderPanel()
          setTimeout(() => {
            copied = false
            // Only re-render if the user is still on the Raw tab and
            // the modal hasn't been disposed.
            if (!disposed && tab === 'raw') renderPanel()
          }, 1500)
        } catch {
          // Clipboard permission denied or unsupported - silent no-op.
        }
      })()
    })
    return h(
      'div',
      { class: 'audit-trail-inspect-panel' },
      h(
        'div',
        { class: 'audit-trail-code-block-wrap' },
        codeBlock,
        copyBtn,
      ),
    )
  }

  const subtitle = h(
    'p',
    { class: 'audit-trail-inspect-subtitle' },
    h(
      'span',
      { class: 'audit-trail-inspect-subtitle-line' },
      h('code', null, event.action || '-'),
    ),
    h(
      'span',
      { class: 'audit-trail-inspect-subtitle-line' },
      formatHeaderTimestamp(event.occurred_at),
    ),
    h(
      'span',
      { class: 'audit-trail-inspect-subtitle-line' },
      h('code', null, event.id),
    ),
  )

  const tabs =
    showDiff || showMetadata
      ? renderTabs(tab, showDiff, showMetadata, (next) => {
          tab = next
          // Toggle visual state on the buttons; rebuild the panel.
          setSelectedTab(tabsEl, next)
          renderPanel()
        })
      : null
  const tabsEl: HTMLElement | null = tabs

  const modalChildren: Node[] = [
    closeBtn,
    h(
      'h2',
      { id: 'audit-trail-inspect-title', class: 'audit-trail-inspect-title' },
      'Inspect Event',
    ),
    subtitle,
  ]
  if (tabs) modalChildren.push(tabs)
  modalChildren.push(panelContainer)

  const modal = h(
    'div',
    {
      class: 'audit-trail-inspect-modal',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'audit-trail-inspect-title',
    },
    ...modalChildren,
  )
  // Stop backdrop dismissal from firing when the user clicks inside
  // the modal.
  modal.addEventListener('mousedown', (e) => e.stopPropagation())

  const backdrop = h('div', { class: 'audit-trail-inspect-backdrop' }, modal)

  portal.appendChild(backdrop)

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
    dispose()
    onClose()
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') userClose()
  }

  closeBtn.addEventListener('click', userClose)
  backdrop.addEventListener('mousedown', userClose)
  document.addEventListener('keydown', onKey)

  document.body.appendChild(portal)
  renderPanel()
  // Defer focus to the next frame - focusing during append can race
  // with the parent's render and lose to whatever pulls focus next.
  queueMicrotask(() => {
    if (!disposed) closeBtn.focus()
  })

  return dispose
}

function renderTabs(
  initial: Tab,
  showDiff: boolean,
  showMetadata: boolean,
  onSelect: (tab: Tab) => void,
): HTMLElement {
  const make = (key: Tab, label: string) => {
    const btn = h(
      'button',
      {
        type: 'button',
        role: 'tab',
        class:
          initial === key
            ? 'audit-trail-inspect-tab audit-trail-inspect-tab-active'
            : 'audit-trail-inspect-tab',
        'aria-selected': initial === key ? 'true' : 'false',
        'data-tab': key,
      },
      label,
    )
    btn.addEventListener('click', () => onSelect(key))
    return btn
  }
  const tabs: HTMLElement[] = [make('raw', 'Raw')]
  if (showDiff) tabs.push(make('diff', 'Diff'))
  if (showMetadata) tabs.push(make('metadata', 'Metadata'))
  return h(
    'div',
    { class: 'audit-trail-inspect-tabs', role: 'tablist', 'aria-label': 'View' },
    ...tabs,
  )
}

function setSelectedTab(tabsEl: HTMLElement | null, tab: Tab) {
  if (!tabsEl) return
  for (const child of Array.from(tabsEl.children)) {
    if (!(child instanceof HTMLElement)) continue
    const isMatch = child.dataset.tab === tab
    child.className = isMatch
      ? 'audit-trail-inspect-tab audit-trail-inspect-tab-active'
      : 'audit-trail-inspect-tab'
    child.setAttribute('aria-selected', isMatch ? 'true' : 'false')
  }
}

function renderDiffTable(lines: DiffLine[]): HTMLElement {
  const rows = lines.map((line) =>
    h(
      'tr',
      null,
      h(
        'td',
        {
          class: `audit-trail-diff-cell audit-trail-diff-before-${line.beforeKind || 'blank'}`,
        },
        h('pre', null, line.before),
      ),
      h(
        'td',
        {
          class: `audit-trail-diff-cell audit-trail-diff-after-${line.afterKind || 'blank'}`,
        },
        h('pre', null, line.after),
      ),
    ),
  )
  return h(
    'div',
    { class: 'audit-trail-diff-wrap' },
    h(
      'table',
      { class: 'audit-trail-diff-table' },
      h(
        'thead',
        null,
        h('tr', null, h('th', null, 'Before'), h('th', null, 'After')),
      ),
      h('tbody', null, ...rows),
    ),
  )
}

// formatHeaderTimestamp renders an ISO timestamp as
// "Month D, YYYY HH:MM:SS.mmm UTC" - matches the upstream events UI
// header. Always UTC so two readers in different timezones see the
// same string when comparing notes on an event.
function formatHeaderTimestamp(rfc3339: string | undefined): string {
  if (!rfc3339) return '-'
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

// JSON syntax highlighter for the Raw tab. Walks the pretty-
// printed source, escapes HTML, and wraps tokens in <span>
// classes the CSS colors. Punctuation (braces, commas, colons)
// keeps the default text color.

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

// Metadata tab - flat key/value table. Renders each top-level
// metadata field as one row with type hint + value. Nested
// objects / arrays render compactly so the column doesn't blow
// out; users still get the full picture from the Raw tab.

interface MetadataRow {
  key: string
  value: string
  type: string
}

function buildMetadataRows(
  metadata: Record<string, unknown> | undefined,
): MetadataRow[] {
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

function renderMetadataTable(rows: MetadataRow[]): HTMLElement {
  return h(
    'table',
    { class: 'audit-trail-metadata-kv-table' },
    h(
      'thead',
      null,
      h(
        'tr',
        null,
        h('th', { class: 'audit-trail-md-col-key' }, 'Key'),
        h('th', { class: 'audit-trail-md-col-type' }, 'Type'),
        h('th', { class: 'audit-trail-md-col-value' }, 'Value'),
      ),
    ),
    h(
      'tbody',
      null,
      ...rows.map((r) =>
        h(
          'tr',
          null,
          h('td', { class: 'audit-trail-md-col-key' }, h('code', null, r.key)),
          h(
            'td',
            { class: 'audit-trail-md-col-type' },
            h('span', { class: 'audit-trail-muted' }, r.type),
          ),
          h('td', { class: 'audit-trail-md-col-value' }, h('code', null, r.value)),
        ),
      ),
    ),
  )
}
