export const COLUMN_LABELS: Record<string, string> = {
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

export const ALL_COLUMNS = [
  'occurred_at',
  'action',
  'actor',
  'target',
  'tenant_id',
  'origin',
  'result',
  'change',
  'metadata',
  'idempotency_key',
  'id',
]
