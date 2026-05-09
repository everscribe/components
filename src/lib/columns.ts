// COLUMN_LABELS includes every Event field the table knows how to
// render. The picker only surfaces ALL_COLUMNS, but if a token's
// `columns` claim opts in to one of the others (origin, metadata,
// etc.) we still want a friendly label for it.
export const COLUMN_LABELS: Record<string, string> = {
  id: 'ID',
  tenant_id: 'Tenant',
  occurred_at: 'Time',
  actor: 'Actor',
  action: 'Action',
  target: 'Target',
  metadata: 'Metadata',
  origin: 'Origin',
  result: 'Result',
  change: 'Change',
  idempotency_key: 'Idempotency key',
}

// ALL_COLUMNS is the picker-visible set, mirroring the upstream
// events UI. Tokens with a custom `columns` claim drive the picker
// directly and can include columns outside this list.
export const ALL_COLUMNS = [
  'occurred_at',
  'action',
  'actor',
  'target',
  'tenant_id',
  'result',
]
