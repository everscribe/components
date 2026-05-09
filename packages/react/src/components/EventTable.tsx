import { COLUMN_LABELS, type Event } from '@everscribe/components-core'
import { EventRow } from './EventRow.js'

export interface EventTableProps {
  events: Event[]
  visibleColumns: string[]
  onRowClick?: (event: Event) => void
}

export function EventTable({ events, visibleColumns, onRowClick }: EventTableProps) {
  return (
    <table className="evs-table">
      <thead>
        <tr>
          {visibleColumns.map((col) => (
            <th key={col} scope="col" className={`evs-th evs-th-${col}`}>
              {COLUMN_LABELS[col] ?? col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {events.map((event) => (
          <EventRow
            key={event.id}
            event={event}
            columns={visibleColumns}
            onClick={onRowClick}
          />
        ))}
      </tbody>
    </table>
  )
}
