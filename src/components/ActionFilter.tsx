export interface ActionFilterProps {
  actions: string[]
  value: string | null
  onChange: (action: string | null) => void
}

export function ActionFilter({ actions, value, onChange }: ActionFilterProps) {
  return (
    <label className="evs-filter">
      <span className="evs-filter-label">Action</span>
      <select
        className="evs-filter-select"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">All</option>
        {actions.map((action) => (
          <option key={action} value={action}>
            {action}
          </option>
        ))}
      </select>
    </label>
  )
}

export function actionMatches(action: string, entry: string): boolean {
  if (entry.endsWith('.*')) {
    return action.startsWith(entry.slice(0, -1))
  }
  return action === entry
}
