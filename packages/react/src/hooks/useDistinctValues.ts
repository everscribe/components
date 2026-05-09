'use client'

import { useEffect, useState } from 'react'
import {
  EmbedError,
  fetchTokenViaOpts,
  listDistinctActions,
  listDistinctActorTypes,
  listDistinctTargetTypes,
} from '../lib/api.js'

export interface DistinctValues {
  actions: string[]
  actorTypes: string[]
  targetTypes: string[]
}

export interface UseDistinctValuesOptions {
  apiBase: string
  token: string | null
  tokenEndpoint?: string
  onTokenExpired?: () => Promise<string>
}

// useDistinctValues fetches the three filter-dropdown source lists once
// per token. Failures are swallowed silently — an empty dropdown is
// strictly better UX than blocking the table render on a 500.
export function useDistinctValues(opts: UseDistinctValuesOptions): DistinctValues {
  const [values, setValues] = useState<DistinctValues>({
    actions: [],
    actorTypes: [],
    targetTypes: [],
  })

  useEffect(() => {
    if (!opts.token) {
      setValues({ actions: [], actorTypes: [], targetTypes: [] })
      return
    }
    const ctrl = new AbortController()
    let cancelled = false

    const fetchOnce = async (token: string) => {
      const base = { apiBase: opts.apiBase, token, signal: ctrl.signal }
      const [actions, actorTypes, targetTypes] = await Promise.all([
        listDistinctActions(base).catch(() => ({ actions: [] })),
        listDistinctActorTypes(base).catch(() => ({ actor_types: [] })),
        listDistinctTargetTypes(base).catch(() => ({ target_types: [] })),
      ])
      if (cancelled) return
      setValues({
        actions: actions.actions,
        actorTypes: actorTypes.actor_types,
        targetTypes: targetTypes.target_types,
      })
    }

    void (async () => {
      try {
        await fetchOnce(opts.token!)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (err instanceof EmbedError && err.kind === 'unauthorized') {
          const refreshed = await fetchTokenViaOpts(opts)
          if (refreshed && !cancelled) {
            try {
              await fetchOnce(refreshed)
            } catch {
              // Distinct dropdowns are non-critical; swallow.
            }
          }
        }
      }
    })()

    return () => {
      cancelled = true
      ctrl.abort()
    }
  }, [opts.token, opts.apiBase])

  return values
}
