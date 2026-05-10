'use client'

import { useCallback, useRef, useState } from 'react'
import {
  EmbedError,
  fetchTokenViaOpts,
  generateNLPFilters,
  type GenerateNLPFiltersResponse,
} from '@everscribe/components-core'

export interface UseNLPOptions {
  apiBase: string
  token: string | null
  tokenEndpoint?: string
  onTokenExpired?: () => Promise<string>
}

export type NLPState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; query: string; result: GenerateNLPFiltersResponse }
  | { phase: 'error'; query: string; error: NLPErrorReason }

export type NLPErrorReason =
  | 'not_configured'
  | 'not_allowed'
  | 'rate_limited'
  | 'provider_busy'
  | 'bad_request'
  | 'unknown'

export interface UseNLPResult {
  state: NLPState
  submit: (query: string) => Promise<void>
  reset: () => void
}

// useNLP wraps the embed NLP endpoint with a simple state machine
// the AI tab consumes. Submitting clears any prior result; the
// caller renders state.phase to drive button label + spinner + error
// banner. Network/auth failures fold into the error phase so the
// component doesn't have to try/catch around submit.
export function useNLP(opts: UseNLPOptions): UseNLPResult {
  const [state, setState] = useState<NLPState>({ phase: 'idle' })
  const ctrlRef = useRef<AbortController | null>(null)

  const submit = useCallback(
    async (query: string) => {
      const trimmed = query.trim()
      if (!trimmed) return
      if (!opts.token) {
        setState({ phase: 'error', query: trimmed, error: 'not_configured' })
        return
      }
      ctrlRef.current?.abort()
      const ctrl = new AbortController()
      ctrlRef.current = ctrl
      setState({ phase: 'loading' })

      try {
        const result = await generateNLPFilters({
          apiBase: opts.apiBase,
          token: opts.token,
          query: trimmed,
          signal: ctrl.signal,
        })
        if (ctrl.signal.aborted) return
        setState({ phase: 'ready', query: trimmed, result })
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        // Try a token refresh on 401, otherwise map the EmbedError
        // kind to the user-facing reason. Anything else folds to
        // "unknown" so the UI can fall back to a generic message.
        if (err instanceof EmbedError && err.kind === 'unauthorized') {
          const refreshed = await fetchTokenViaOpts({
            tokenEndpoint: opts.tokenEndpoint,
            onTokenExpired: opts.onTokenExpired,
          })
          if (refreshed && !ctrl.signal.aborted) {
            try {
              const retry = await generateNLPFilters({
                apiBase: opts.apiBase,
                token: refreshed,
                query: trimmed,
                signal: ctrl.signal,
              })
              setState({ phase: 'ready', query: trimmed, result: retry })
              return
            } catch (retryErr) {
              setState({
                phase: 'error',
                query: trimmed,
                error: classifyNLPError(retryErr),
              })
              return
            }
          }
        }
        setState({ phase: 'error', query: trimmed, error: classifyNLPError(err) })
      }
    },
    [opts.apiBase, opts.token, opts.tokenEndpoint, opts.onTokenExpired],
  )

  const reset = useCallback(() => {
    ctrlRef.current?.abort()
    setState({ phase: 'idle' })
  }, [])

  return { state, submit, reset }
}

// classifyNLPError folds an EmbedError into the small set of reasons
// the AI tab actually distinguishes. 403 + "nlp_not_allowed" message
// is the AllowNLP claim refusal; everything else falls through to
// generic buckets.
function classifyNLPError(err: unknown): NLPErrorReason {
  if (!(err instanceof EmbedError)) return 'unknown'
  if (err.status === 503) {
    if (err.message?.includes('busy')) return 'provider_busy'
    return 'not_configured'
  }
  if (err.status === 429) return 'rate_limited'
  if (err.status === 403) return 'not_allowed'
  if (err.kind === 'bad_request') return 'bad_request'
  return 'unknown'
}
