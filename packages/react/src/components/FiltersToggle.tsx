export interface FiltersToggleProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  activeCount: number
}

export function FiltersToggle({ open, onOpenChange, activeCount }: FiltersToggleProps) {
  return (
    <button
      type="button"
      className="audit-trail-filter-toggle"
      aria-expanded={open}
      onClick={() => onOpenChange(!open)}
    >
      Search options
      {activeCount > 0 && (
        <span className="audit-trail-filter-toggle-badge">{activeCount}</span>
      )}
      <span className="audit-trail-filter-toggle-caret" aria-hidden="true">
        {open ? '▴' : '▾'}
      </span>
    </button>
  )
}
