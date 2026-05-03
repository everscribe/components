import { COLUMN_LABELS } from '../lib/columns.js'

export interface ColumnPickerProps {
  available: string[]
  visible: ReadonlySet<string>
  onToggle: (column: string) => void
}

export function ColumnPicker({ available, visible, onToggle }: ColumnPickerProps) {
  const visibleCount = available.reduce((n, c) => (visible.has(c) ? n + 1 : n), 0)

  return (
    <details className="evs-picker">
      <summary className="evs-picker-summary">
        Columns ({visibleCount}/{available.length})
      </summary>
      <div className="evs-picker-content">
        {available.map((col) => (
          <label key={col} className="evs-picker-item">
            <input
              type="checkbox"
              checked={visible.has(col)}
              onChange={() => onToggle(col)}
            />
            <span>{COLUMN_LABELS[col] ?? col}</span>
          </label>
        ))}
      </div>
    </details>
  )
}
