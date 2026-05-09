import { COLUMN_LABELS } from '@everscribe/components-core'

export interface ColumnPickerProps {
  available: string[]
  visible: ReadonlySet<string>
  onToggle: (column: string) => void
}

export function ColumnPicker({ available, visible, onToggle }: ColumnPickerProps) {
  const visibleCount = available.reduce((n, c) => (visible.has(c) ? n + 1 : n), 0)

  return (
    <details className="audit-trail-picker">
      <summary className="audit-trail-picker-summary">
        Columns ({visibleCount}/{available.length})
      </summary>
      <div className="audit-trail-picker-content">
        {available.map((col) => (
          <label key={col} className="audit-trail-picker-item">
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
