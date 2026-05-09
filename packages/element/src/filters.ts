import type { DistinctValues } from '@everscribe/components-core'

import { h } from './dom.js'

export type TimeRangePreset = '24h' | '7d' | '30d' | 'custom' | 'all'

export interface FilterValues {
  range: TimeRangePreset
  // since / before are only meaningful when range === 'custom'.
  // Stored as datetime-local strings (YYYY-MM-DDTHH:mm) — the API
  // wants ISO, so resolveTimeBounds promotes them at send-time.
  since?: string
  before?: string
  action?: string
  actor?: string
  actorType?: string
  targetType?: string
}

const TIME_PRESETS: ReadonlyArray<{ key: TimeRangePreset; label: string }> = [
  { key: '24h', label: '24h' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: 'custom', label: 'Custom' },
  { key: 'all', label: 'All' },
]

export interface FiltersPanelOptions {
  value: FilterValues
  distinct: DistinctValues
  onChange: (next: FilterValues) => void
  // Called on every keystroke / datetime tweak. The element schedules a
  // debounced commit; values are read from these refs at commit time.
  onActorInput: () => void
  onCustomRangeInput: () => void
  // Refs returned via callback so the element can hold them for
  // debounced read at commit time.
  setActorInput: (el: HTMLInputElement) => void
  setSinceInput: (el: HTMLInputElement) => void
  setBeforeInput: (el: HTMLInputElement) => void
}

export function renderFiltersPanel(opts: FiltersPanelOptions): HTMLElement {
  const { value, distinct, onChange } = opts

  const tabs = h(
    'div',
    { class: 'audit-trail-filter-tabs', role: 'tablist', 'aria-label': 'Time range' },
    ...TIME_PRESETS.map((p) => {
      const selected = value.range === p.key
      const btn = h(
        'button',
        {
          type: 'button',
          role: 'tab',
          'aria-selected': selected ? 'true' : 'false',
          class: selected
            ? 'audit-trail-filter-tab audit-trail-filter-tab-selected'
            : 'audit-trail-filter-tab',
        },
        p.label,
      )
      btn.addEventListener('click', () => {
        if (p.key === 'custom') {
          // Switching INTO custom keeps existing since/before drafts in
          // the inputs; clearing them is the user's job. The committed
          // values fire from the debounced datetime input handlers.
          onChange({ ...value, range: p.key })
        } else {
          onChange({ ...value, range: p.key, since: undefined, before: undefined })
        }
      })
      return btn
    }),
  )

  const customRow =
    value.range === 'custom'
      ? h(
          'div',
          { class: 'audit-trail-filter-row' },
          h(
            'label',
            { class: 'audit-trail-filter-field' },
            h('span', { class: 'audit-trail-filter-field-label' }, 'From'),
            buildDateInput(value.since ?? '', opts.setSinceInput, opts.onCustomRangeInput),
          ),
          h(
            'label',
            { class: 'audit-trail-filter-field' },
            h('span', { class: 'audit-trail-filter-field-label' }, 'To'),
            buildDateInput(value.before ?? '', opts.setBeforeInput, opts.onCustomRangeInput),
          ),
        )
      : null

  const dropdownRow = h(
    'div',
    { class: 'audit-trail-filter-row' },
    buildSelect('Action', 'All actions', value.action ?? '', distinct.actions, (v) =>
      onChange({ ...value, action: v || undefined }),
    ),
    buildSelect(
      'Actor type',
      'All actor types',
      value.actorType ?? '',
      distinct.actorTypes,
      (v) => onChange({ ...value, actorType: v || undefined }),
    ),
    buildSelect(
      'Target type',
      'All target types',
      value.targetType ?? '',
      distinct.targetTypes,
      (v) => onChange({ ...value, targetType: v || undefined }),
    ),
  )

  const actorRow = h(
    'div',
    { class: 'audit-trail-filter-row' },
    buildActorInput(value.actor ?? '', opts.setActorInput, opts.onActorInput),
  )

  const activeCount = countActiveColumnFilters(value)
  const actions =
    activeCount > 0
      ? (() => {
          const clear = h(
            'button',
            {
              type: 'button',
              class: 'audit-trail-button audit-trail-button-secondary',
            },
            'Clear',
          )
          clear.addEventListener('click', () => onChange({ range: value.range }))
          return h('div', { class: 'audit-trail-filter-actions' }, clear)
        })()
      : null

  const children: (Node | null)[] = [tabs]
  if (customRow) children.push(customRow)
  children.push(dropdownRow, actorRow)
  if (actions) children.push(actions)

  return h(
    'div',
    { class: 'audit-trail-filter-panel' },
    ...(children.filter(Boolean) as Node[]),
  )
}

function buildDateInput(
  value: string,
  setRef: (el: HTMLInputElement) => void,
  onInput: () => void,
): HTMLInputElement {
  const input = h('input', {
    type: 'datetime-local',
    class: 'audit-trail-filter-input',
    value,
  }) as HTMLInputElement
  // Some browsers ignore the `value` attribute on datetime-local inputs;
  // setting the property directly is the reliable path.
  input.value = value
  input.addEventListener('input', onInput)
  setRef(input)
  return input
}

function buildSelect(
  ariaLabel: string,
  emptyLabel: string,
  selected: string,
  options: string[],
  onChange: (value: string) => void,
): HTMLSelectElement {
  const select = h('select', {
    class: 'audit-trail-filter-select',
    'aria-label': ariaLabel,
  }) as HTMLSelectElement
  const empty = h('option', { value: '' }, emptyLabel) as HTMLOptionElement
  if (selected === '') empty.selected = true
  select.appendChild(empty)
  for (const opt of options) {
    const o = h('option', { value: opt }, opt) as HTMLOptionElement
    if (opt === selected) o.selected = true
    select.appendChild(o)
  }
  select.addEventListener('change', () => onChange(select.value))
  return select
}

function buildActorInput(
  value: string,
  setRef: (el: HTMLInputElement) => void,
  onInput: () => void,
): HTMLInputElement {
  const input = h('input', {
    type: 'text',
    class: 'audit-trail-filter-input audit-trail-filter-actor-input',
    placeholder: 'Actor (id, name, email)',
    value,
  }) as HTMLInputElement
  input.value = value
  input.addEventListener('input', onInput)
  setRef(input)
  return input
}

// countActiveColumnFilters reports how many *column* filters are
// active (action, actor, actor type, target type). Time range is
// excluded — it always has a value, so counting it would make the
// badge perpetually non-zero.
export function countActiveColumnFilters(v: FilterValues): number {
  let n = 0
  if (v.action) n++
  if (v.actor) n++
  if (v.actorType) n++
  if (v.targetType) n++
  return n
}

// resolveTimeBounds turns a FilterValues time-range preset into the
// concrete (since, before) ISO strings the API expects. 'all' yields
// no bounds; presets emit a relative `since` from now; 'custom' uses
// the user's own datetime-local strings (which we promote to ISO).
export function resolveTimeBounds(filters: FilterValues): {
  since?: string
  before?: string
} {
  switch (filters.range) {
    case '24h':
      return { since: relativeIso(24 * 60 * 60 * 1000) }
    case '7d':
      return { since: relativeIso(7 * 24 * 60 * 60 * 1000) }
    case '30d':
      return { since: relativeIso(30 * 24 * 60 * 60 * 1000) }
    case 'custom':
      return {
        since: localToIso(filters.since),
        before: localToIso(filters.before),
      }
    case 'all':
    default:
      return {}
  }
}

function relativeIso(ms: number): string {
  return new Date(Date.now() - ms).toISOString()
}

function localToIso(value: string | undefined): string | undefined {
  if (!value) return undefined
  // datetime-local emits "YYYY-MM-DDTHH:mm" without a timezone. Date()
  // interprets that as local time; toISOString normalizes to UTC.
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}
