import { useEffect, useRef, useState } from 'react'
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

// Debounce window for the free-text actor input and the custom-range
// datetime inputs. Long enough to absorb continuous typing / wheel
// adjustments on the datepicker, short enough to feel responsive.
const TEXT_DEBOUNCE_MS = 300

export function FiltersPanel({ value, onChange, distinct }: FiltersPanelProps) {
  // Local draft state for the free-text + datetime inputs only —
  // selects and time-range tabs commit immediately. The drafts let
  // typing accumulate before we trip a refetch via the debounced
  // commit effects below.
  const [draftSince, setDraftSince] = useState(value.since ?? '')
  const [draftBefore, setDraftBefore] = useState(value.before ?? '')
  const [draftActor, setDraftActor] = useState(value.actor ?? '')

  // Re-sync drafts when `value` changes externally (Clear button,
  // time-range preset reset, parent-driven update).
  useEffect(() => {
    setDraftSince(value.since ?? '')
    setDraftBefore(value.before ?? '')
    setDraftActor(value.actor ?? '')
  }, [value.since, value.before, value.actor])

  // valueRef + onChangeRef avoid stale closures inside the debounced
  // commit effects — we always pull the freshest applied filters and
  // the freshest onChange when the timer fires.
  const valueRef = useRef(value)
  valueRef.current = value
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Debounced commit for the actor text input.
  useEffect(() => {
    const next = draftActor || undefined
    if (next === valueRef.current.actor) return
    const t = setTimeout(() => {
      onChangeRef.current({ ...valueRef.current, actor: next })
    }, TEXT_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [draftActor])

  // Debounced commit for the custom-range datetime inputs. Only
  // active in custom mode — preset ranges discard since/before.
  useEffect(() => {
    if (valueRef.current.range !== 'custom') return
    const nextSince = draftSince || undefined
    const nextBefore = draftBefore || undefined
    if (
      nextSince === valueRef.current.since &&
      nextBefore === valueRef.current.before
    ) {
      return
    }
    const t = setTimeout(() => {
      onChangeRef.current({
        ...valueRef.current,
        since: nextSince,
        before: nextBefore,
      })
    }, TEXT_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [draftSince, draftBefore])

  const handlePresetClick = (range: TimeRangePreset) => {
    if (range === 'custom') {
      // Switching into Custom mode opens the inputs — committing
      // since/before is the datetime inputs' job.
      onChange({ ...value, range })
      return
    }
    onChange({ ...value, range, since: undefined, before: undefined })
  }

  const handleClear = () => {
    onChange({ range: value.range })
  }

  const activeCount = countActiveColumnFilters(value)

  return (
    <div className="audit-trail-filter-panel">
      <div className="audit-trail-filter-tabs" role="tablist" aria-label="Time range">
        {TIME_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={value.range === p.key}
            className={
              value.range === p.key
                ? 'audit-trail-filter-tab audit-trail-filter-tab-selected'
                : 'audit-trail-filter-tab'
            }
            onClick={() => handlePresetClick(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {value.range === 'custom' && (
        <div className="audit-trail-filter-row">
          <label className="audit-trail-filter-field">
            <span className="audit-trail-filter-field-label">From</span>
            <input
              type="datetime-local"
              className="audit-trail-filter-input"
              value={draftSince}
              onChange={(e) => setDraftSince(e.target.value)}
            />
          </label>
          <label className="audit-trail-filter-field">
            <span className="audit-trail-filter-field-label">To</span>
            <input
              type="datetime-local"
              className="audit-trail-filter-input"
              value={draftBefore}
              onChange={(e) => setDraftBefore(e.target.value)}
            />
          </label>
        </div>
      )}

      <div className="audit-trail-filter-row">
        <select
          className="audit-trail-filter-select"
          aria-label="Action"
          value={value.action ?? ''}
          onChange={(e) =>
            onChange({ ...value, action: e.target.value || undefined })
          }
        >
          <option value="">All actions</option>
          {distinct.actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <select
          className="audit-trail-filter-select"
          aria-label="Actor type"
          value={value.actorType ?? ''}
          onChange={(e) =>
            onChange({ ...value, actorType: e.target.value || undefined })
          }
        >
          <option value="">All actor types</option>
          {distinct.actorTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          className="audit-trail-filter-select"
          aria-label="Target type"
          value={value.targetType ?? ''}
          onChange={(e) =>
            onChange({ ...value, targetType: e.target.value || undefined })
          }
        >
          <option value="">All target types</option>
          {distinct.targetTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="audit-trail-filter-row">
        <input
          type="text"
          className="audit-trail-filter-input audit-trail-filter-actor-input"
          placeholder="Actor (id, name, email)"
          value={draftActor}
          onChange={(e) => setDraftActor(e.target.value)}
        />
      </div>

      {activeCount > 0 && (
        <div className="audit-trail-filter-actions">
          <button
            type="button"
            className="audit-trail-button audit-trail-button-secondary"
            onClick={handleClear}
          >
            Clear
          </button>
        </div>
      )}
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
