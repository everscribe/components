export interface Event {
  id: string
  tenant_id?: string
  occurred_at: string
  actor?: Record<string, unknown>
  action: string
  target?: Record<string, unknown>
  metadata?: Record<string, unknown>
  origin?: Record<string, unknown>
  result?: Record<string, unknown>
  change?: Record<string, unknown>
  idempotency_key?: string
}

export interface EmbedClaims {
  v: number
  iss: string
  sub: string
  aud: string
  exp: number
  iat: number
  jti: string
  tenant_id?: string
  columns?: string[]
  actions?: string[]
}
