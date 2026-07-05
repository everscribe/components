import type { FilterValues } from './FiltersPanel.js'
import { parseQClauses, removeClauseFromQ } from './FiltersPanel.js'

export interface ActiveFilterChipsProps {
  value: FilterValues
  onChange: (next: FilterValues) => void
}

interface Chip {
  label: string
  onRemove: () => void
}

// ActiveFilterChips renders one chip per active column filter and
// one chip per top-level DSL clause in `q`. Clicking × strips that
// single filter (or rebuilds q without the clause). When nothing is
// active the component renders nothing - the parent decides whether
// to leave the row visible at all.
export function ActiveFilterChips({ value, onChange }: ActiveFilterChipsProps) {
  const chips: Chip[] = []

  const colChip = (
    field: keyof FilterValues,
    label: string,
    raw: string | undefined,
  ) => {
    if (!raw) return
    chips.push({
      label: `${label}: ${raw}`,
      onRemove: () => onChange({ ...value, [field]: undefined }),
    })
  }
  colChip('action', 'Action', value.action)
  colChip('actor', 'Actor', value.actor)
  colChip('actorType', 'Actor type', value.actorType)
  colChip('tenantId', 'Tenant', value.tenantId)
  colChip('targetType', 'Target type', value.targetType)
  colChip('targetId', 'Target ID', value.targetId)
  colChip('resultStatus', 'Result', value.resultStatus)
  colChip('originIP', 'Origin IP', value.originIP)

  // DSL clauses get their own chip each - removing one re-serializes
  // q without that clause so the rest stay applied.
  if (value.q) {
    for (const clause of parseQClauses(value.q)) {
      chips.push({
        label: clause.label,
        onRemove: () => {
          const nextQ = removeClauseFromQ(value.q!, clause.raw)
          onChange({
            ...value,
            q: nextQ,
            // If this was the last DSL clause and the q came from an
            // NLP translation, clear the echo fields too - there's
            // nothing left to attribute to "you asked".
            nlpQ: nextQ ? value.nlpQ : undefined,
            nlpExplanation: nextQ ? value.nlpExplanation : undefined,
            nlpUnsupported: nextQ ? value.nlpUnsupported : undefined,
          })
        },
      })
    }
  }

  if (chips.length === 0) return null

  const clearAll = () =>
    onChange({
      range: value.range,
      since: value.since,
      before: value.before,
    })

  return (
    <div className="audit-trail-filter-chips-row">
      <div className="audit-trail-filter-chips">
        {chips.map((c, i) => (
          <button
            key={i}
            type="button"
            className="audit-trail-filter-chip"
            onClick={c.onRemove}
            title="Remove this filter"
            aria-label={`Remove filter: ${c.label}`}
          >
            <span>{c.label}</span>
            <span aria-hidden="true" className="audit-trail-filter-chip-x">
              ×
            </span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="audit-trail-button audit-trail-button-text"
        onClick={clearAll}
      >
        Clear all
      </button>
    </div>
  )
}
