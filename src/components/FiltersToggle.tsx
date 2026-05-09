export interface FiltersToggleProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  activeCount: number
}

export function FiltersToggle({ open, onOpenChange, activeCount }: FiltersToggleProps) {
  return (
    <button
      type="button"
      className="evs-filter-toggle"
      aria-expanded={open}
      onClick={() => onOpenChange(!open)}
    >
      Set filters
      {activeCount > 0 && (
        <span className="evs-filter-toggle-badge">{activeCount}</span>
      )}
      <span className="evs-filter-toggle-caret" aria-hidden="true">
        {open ? '▴' : '▾'}
      </span>
    </button>
  )
}
