import { COLUMN_LABELS, type Event } from '@everscribe/components-core'
import { useRelativeTimeTick } from '../hooks/useRelativeTimeTick.js'
import { EventRow } from './EventRow.js'

export interface EventTableProps {
  events: Event[]
  visibleColumns: string[]
  onRowClick?: (event: Event) => void
}

export function EventTable({ events, visibleColumns, onRowClick }: EventTableProps) {
  // 30s tick re-renders the table so each row's "N ago" string stays
  // current. The absolute half is stable; only the text inside the
  // <time> cell changes per tick.
  const now = useRelativeTimeTick()
  return (
    <div className="audit-trail-table-wrap">
      <table className="audit-trail-table">
        <thead>
          <tr>
            {visibleColumns.map((col) => (
              <th key={col} scope="col" className={`audit-trail-th audit-trail-th-${col}`}>
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
              now={now}
              onClick={onRowClick}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
