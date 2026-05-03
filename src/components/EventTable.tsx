import type { Event } from '../lib/types.js'
import { EventRow } from './EventRow.js'

export interface EventTableProps {
  events: Event[]
  visibleColumns: string[]
  onRowClick?: (event: Event) => void
}

const COLUMN_LABELS: Record<string, string> = {
  id: 'ID',
  tenant_id: 'Tenant',
  occurred_at: 'When',
  actor: 'Actor',
  action: 'Action',
  target: 'Target',
  metadata: 'Metadata',
  origin: 'Origin',
  result: 'Result',
  change: 'Change',
  idempotency_key: 'Idempotency key',
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
