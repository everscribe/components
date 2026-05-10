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
  /**
   * actions_prefix is a list of action prefixes the token can read
   * (e.g. ["user.", "billing."]). Server-enforced; the component
   * uses it only when filtering the action dropdown.
   */
  actions_prefix?: string[]
  /**
   * allowed_fields restricts which catalog fields the token can
   * use in DSL filters (and the NLP endpoint). When set, the
   * Query and AI tabs constrain what the user can ask for; the
   * server rejects out-of-scope fields independently.
   */
  allowed_fields?: string[]
  /**
   * allow_dsl_input toggles the Query (advanced DSL) tab. When
   * false, the embed API also rejects ?q=... requests.
   */
  allow_dsl_input?: boolean
  /**
   * allow_nlp toggles the AI ("Ask in plain English") tab. When
   * false, POST /v1/embed/events/nlp returns 403.
   */
  allow_nlp?: boolean
}

/**
 * MetadataKey describes one entry in the project's metadata
 * vocabulary side table — surfaced for the inline metadata-filter
 * builder's autocomplete and the NLP context.
 */
export interface MetadataKey {
  key: string
  observed_type: string
  sample_value?: string
  event_count: number
}

/**
 * ChangeField names a field that's been observed changing on
 * mutation events. Drives the change-field picker autocomplete.
 */
export interface ChangeField {
  field: string
  event_count: number
}

/**
 * GenerateNLPFiltersRequest is the JSON body for
 * POST /v1/embed/events/nlp. Mirror of the monorepo's types/nlp.go.
 */
export interface GenerateNLPFiltersRequest {
  q: string
}

/**
 * GenerateNLPFiltersResponse is the JSON shape returned by
 * POST /v1/embed/events/nlp. DSL is empty when the model couldn't
 * translate anything; the caller falls back to rendering the
 * unsupported list.
 */
export interface GenerateNLPFiltersResponse {
  dsl: string
  unsupported?: string[]
  explanation?: string
  model?: string
  input_tokens?: number
  output_tokens?: number
  cache_hit_tokens?: number
}
