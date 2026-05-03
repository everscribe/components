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
  return request<ListEventsResponse>(url, opts)
}

export async function getEvent(
  opts: RequestOptions & { id: string },
): Promise<GetEventResponse> {
  const url = new URL(joinUrl(opts.apiBase, `events/${encodeURIComponent(opts.id)}`))
  return request<GetEventResponse>(url, opts)
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
