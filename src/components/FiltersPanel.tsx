import { useEffect, useState } from 'react'
import type { DistinctValues } from '../hooks/useDistinctValues.js'

export type TimeRangePreset = '24h' | '7d' | '30d' | 'custom' | 'all'

export interface FilterValues {
  range: TimeRangePreset
  // since / before are only meaningful when range === 'custom'.
  // Stored as datetime-local strings (YYYY-MM-DDTHH:mm) — the parent
  // converts to ISO before sending to the API.
  since?: string
  before?: string
  action?: string
  actor?: string
  actorType?: string
  targetType?: string
}

export interface FiltersPanelProps {
  value: FilterValues
  onChange: (next: FilterValues) => void
  distinct: DistinctValues
}

const TIME_PRESETS: ReadonlyArray<{ key: TimeRangePreset; label: string }> = [
  { key: '24h', label: '24h' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: 'custom', label: 'Custom' },
  { key: 'all', label: 'All' },
]

export function FiltersPanel({ value, onChange, distinct }: FiltersPanelProps) {
  // Draft state for fields that require explicit Apply. Time range
  // presets bypass this (they apply immediately on click) — only
  // Custom needs since/before drafting.
  const [draftSince, setDraftSince] = useState(value.since ?? '')
  const [draftBefore, setDraftBefore] = useState(value.before ?? '')
  const [draftAction, setDraftAction] = useState(value.action ?? '')
  const [draftActor, setDraftActor] = useState(value.actor ?? '')
  const [draftActorType, setDraftActorType] = useState(value.actorType ?? '')
  const [draftTargetType, setDraftTargetType] = useState(value.targetType ?? '')

  // Re-sync drafts when `value` changes externally (e.g. parent clears
  // filters or switches between presets that reset since/before).
  useEffect(() => {
    setDraftSince(value.since ?? '')
    setDraftBefore(value.before ?? '')
    setDraftAction(value.action ?? '')
    setDraftActor(value.actor ?? '')
    setDraftActorType(value.actorType ?? '')
    setDraftTargetType(value.targetType ?? '')
  }, [value])

  const handlePresetClick = (range: TimeRangePreset) => {
    if (range === 'custom') {
      // Switching into Custom mode just opens the inputs — apply waits
      // for the user to fill them and click Apply.
      onChange({ ...value, range })
      return
    }
    onChange({ ...value, range, since: undefined, before: undefined })
  }

  const handleApply = () => {
    onChange({
      range: value.range,
      since: value.range === 'custom' ? draftSince || undefined : undefined,
      before: value.range === 'custom' ? draftBefore || undefined : undefined,
      action: draftAction || undefined,
      actor: draftActor || undefined,
      actorType: draftActorType || undefined,
      targetType: draftTargetType || undefined,
    })
  }

  const handleClear = () => {
    onChange({ range: value.range })
  }

  const activeCount = countActiveColumnFilters(value)

  return (
    <div className="evs-filter-panel">
      <div className="evs-filter-tabs" role="tablist" aria-label="Time range">
        {TIME_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={value.range === p.key}
            className={
              value.range === p.key
                ? 'evs-filter-tab evs-filter-tab-selected'
                : 'evs-filter-tab'
            }
            onClick={() => handlePresetClick(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {value.range === 'custom' && (
        <div className="evs-filter-row">
          <label className="evs-filter-field">
            <span className="evs-filter-field-label">From</span>
            <input
              type="datetime-local"
              className="evs-filter-input"
              value={draftSince}
              onChange={(e) => setDraftSince(e.target.value)}
            />
          </label>
          <label className="evs-filter-field">
            <span className="evs-filter-field-label">To</span>
            <input
              type="datetime-local"
              className="evs-filter-input"
              value={draftBefore}
              onChange={(e) => setDraftBefore(e.target.value)}
            />
          </label>
        </div>
      )}

      <div className="evs-filter-row">
        <select
          className="evs-filter-select"
          aria-label="Action"
          value={draftAction}
          onChange={(e) => setDraftAction(e.target.value)}
        >
          <option value="">All actions</option>
          {distinct.actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <select
          className="evs-filter-select"
          aria-label="Actor type"
          value={draftActorType}
          onChange={(e) => setDraftActorType(e.target.value)}
        >
          <option value="">All actor types</option>
          {distinct.actorTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          className="evs-filter-select"
          aria-label="Target type"
          value={draftTargetType}
          onChange={(e) => setDraftTargetType(e.target.value)}
        >
          <option value="">All target types</option>
          {distinct.targetTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="evs-filter-row">
        <input
          type="text"
          className="evs-filter-input evs-filter-actor-input"
          placeholder="Actor (id, name, email)"
          value={draftActor}
          onChange={(e) => setDraftActor(e.target.value)}
        />
      </div>

      <div className="evs-filter-actions">
        <button type="button" className="evs-button" onClick={handleApply}>
          Apply
        </button>
        {activeCount > 0 && (
          <button
            type="button"
            className="evs-button evs-button-secondary"
            onClick={handleClear}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

// countActiveColumnFilters reports how many *column* filters are
// active (action, actor, actor type, target type). Time range is
// excluded from the count — it always has a value, so counting it
// would make the badge perpetually non-zero.
export function countActiveColumnFilters(v: FilterValues): number {
  let n = 0
  if (v.action) n++
  if (v.actor) n++
  if (v.actorType) n++
  if (v.targetType) n++
  return n
}
