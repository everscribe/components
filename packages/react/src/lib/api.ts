import type { Event } from './types.js'

export type ApiErrorKind =
  | 'unauthorized'
  | 'not_found'
  | 'rate_limited'
  | 'bad_request'
  | 'server'
  | 'network'

export interface ApiErrorInfo {
  kind: ApiErrorKind
  status?: number
  retryAfterMs?: number
  message?: string
  cause?: unknown
}

export class EmbedError extends Error {
  readonly kind: ApiErrorKind
  readonly status?: number
  readonly retryAfterMs?: number

  constructor(info: ApiErrorInfo) {
    super(info.message ?? info.kind)
    this.name = 'EmbedError'
    this.kind = info.kind
    this.status = info.status
    this.retryAfterMs = info.retryAfterMs
  }
}

export interface ListEventsResponse {
  events: Event[]
  next_cursor?: string
}

export interface GetEventResponse {
  event: Event
}

export interface ListEventsParams {
  limit?: number
  cursor?: string
  since?: string
  before?: string
  action?: string
  actor?: string
  actorType?: string
  targetType?: string
}

export interface DistinctActionsResponse {
  actions: string[]
}

export interface DistinctActorTypesResponse {
  actor_types: string[]
}

export interface DistinctTargetTypesResponse {
  target_types: string[]
}

export type ExportFormat = 'csv' | 'json'

export interface ExportEventsParams {
  format: ExportFormat
  since?: string
  before?: string
  action?: string
  actor?: string
  actorType?: string
  targetType?: string
}

export interface ExportEventsResult {
  blob: Blob
  filename: string
}

export interface RequestOptions {
  apiBase: string
  token: string
  signal?: AbortSignal
}

export async function listEvents(
  opts: RequestOptions & { params?: ListEventsParams },
): Promise<ListEventsResponse> {
  const url = new URL(joinUrl(opts.apiBase, 'events'))
  const p = opts.params
  if (p?.limit !== undefined) url.searchParams.set('limit', String(p.limit))
  if (p?.cursor) url.searchParams.set('cursor', p.cursor)
  if (p?.since) url.searchParams.set('since', p.since)
  if (p?.before) url.searchParams.set('before', p.before)
  if (p?.action) url.searchParams.set('action', p.action)
  if (p?.actor) url.searchParams.set('actor', p.actor)
  if (p?.actorType) url.searchParams.set('actor_type', p.actorType)
  if (p?.targetType) url.searchParams.set('target_type', p.targetType)
  return request<ListEventsResponse>(url, opts)
}

export async function getEvent(
  opts: RequestOptions & { id: string },
): Promise<GetEventResponse> {
  const url = new URL(joinUrl(opts.apiBase, `events/${encodeURIComponent(opts.id)}`))
  return request<GetEventResponse>(url, opts)
}

export async function listDistinctActions(
  opts: RequestOptions,
): Promise<DistinctActionsResponse> {
  const url = new URL(joinUrl(opts.apiBase, 'events/actions'))
  return request<DistinctActionsResponse>(url, opts)
}

export async function listDistinctActorTypes(
  opts: RequestOptions,
): Promise<DistinctActorTypesResponse> {
  const url = new URL(joinUrl(opts.apiBase, 'events/actor-types'))
  return request<DistinctActorTypesResponse>(url, opts)
}

export async function listDistinctTargetTypes(
  opts: RequestOptions,
): Promise<DistinctTargetTypesResponse> {
  const url = new URL(joinUrl(opts.apiBase, 'events/target-types'))
  return request<DistinctTargetTypesResponse>(url, opts)
}

// exportEvents triggers the streaming export endpoint and returns the
// response body as a Blob plus the server-suggested filename pulled
// from Content-Disposition. The caller drives the actual download
// (createObjectURL + anchor click) so this stays UI-agnostic.
export async function exportEvents(
  opts: RequestOptions & { params: ExportEventsParams },
): Promise<ExportEventsResult> {
  const url = new URL(joinUrl(opts.apiBase, 'events/export'))
  const p = opts.params
  url.searchParams.set('format', p.format)
  if (p.since) url.searchParams.set('since', p.since)
  if (p.before) url.searchParams.set('before', p.before)
  if (p.action) url.searchParams.set('action', p.action)
  if (p.actor) url.searchParams.set('actor', p.actor)
  if (p.actorType) url.searchParams.set('actor_type', p.actorType)
  if (p.targetType) url.searchParams.set('target_type', p.targetType)

  let res: Response
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${opts.token}` },
      signal: opts.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new EmbedError({ kind: 'network', cause: err, message: 'network error' })
  }

  if (!res.ok) throw await mapErrorResponse(res)

  const blob = await res.blob()
  const filename =
    parseFilenameFromContentDisposition(res.headers.get('Content-Disposition')) ??
    `events.${p.format}`
  return { blob, filename }
}

function parseFilenameFromContentDisposition(value: string | null): string | undefined {
  if (!value) return undefined
  // Server emits `attachment; filename="events-2026-05-07.csv"`. Match the
  // quoted form first, then fall back to the unquoted form.
  const quoted = /filename="([^"]+)"/.exec(value)
  if (quoted?.[1]) return quoted[1]
  const unquoted = /filename=([^;]+)/.exec(value)
  if (unquoted?.[1]) return unquoted[1].trim()
  return undefined
}

async function request<T>(url: URL, opts: RequestOptions): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${opts.token}` },
      signal: opts.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new EmbedError({ kind: 'network', cause: err, message: 'network error' })
  }

  if (res.ok) return (await res.json()) as T
  throw await mapErrorResponse(res)
}

async function mapErrorResponse(res: Response): Promise<EmbedError> {
  switch (res.status) {
    case 401:
      return new EmbedError({ kind: 'unauthorized', status: 401 })
    case 404:
      return new EmbedError({ kind: 'not_found', status: 404 })
    case 429: {
      const retryAfterMs = parseRetryAfter(res.headers.get('Retry-After'))
      return new EmbedError({ kind: 'rate_limited', status: 429, retryAfterMs })
    }
    case 400: {
      const message = (await res.text()).trim() || 'bad request'
      return new EmbedError({ kind: 'bad_request', status: 400, message })
    }
    default:
      return new EmbedError({
        kind: 'server',
        status: res.status,
        message: `unexpected status ${res.status}`,
      })
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const t = Date.parse(value)
  if (!Number.isNaN(t)) return Math.max(0, t - Date.now())
  return undefined
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

export interface TokenSourceOptions {
  tokenEndpoint?: string
  onTokenExpired?: () => Promise<string>
}

export async function fetchTokenViaOpts(opts: TokenSourceOptions): Promise<string | null> {
  try {
    if (opts.onTokenExpired) return await opts.onTokenExpired()
    if (opts.tokenEndpoint) {
      const res = await fetch(opts.tokenEndpoint, { credentials: 'include' })
      if (!res.ok) return null
      const body = (await res.json()) as { token?: string }
      return body.token ?? null
    }
    return null
  } catch {
    return null
  }
}
