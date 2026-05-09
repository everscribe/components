import {
  EmbedError,
  fetchTokenViaOpts,
  listDistinctActions,
  listDistinctActorTypes,
  listDistinctTargetTypes,
} from './api.js'

export interface DistinctValues {
  actions: string[]
  actorTypes: string[]
  targetTypes: string[]
}

export interface DistinctValuesStoreConfig {
  apiBase: string
  token: string | null
  tokenEndpoint?: string
  onTokenExpired?: () => Promise<string>
}

export interface DistinctValuesStore {
  getSnapshot(): DistinctValues
  subscribe(listener: () => void): () => void
  dispose(): void
}

export const EMPTY_DISTINCT_VALUES: DistinctValues = {
  actions: [],
  actorTypes: [],
  targetTypes: [],
}

export function createDistinctValuesStore(
  config: DistinctValuesStoreConfig,
): DistinctValuesStore {
  let state: DistinctValues = EMPTY_DISTINCT_VALUES
  const listeners = new Set<() => void>()
  const ctrl = new AbortController()
  let disposed = false

  const setState = (next: DistinctValues) => {
    state = next
    for (const l of listeners) l()
  }

  const fetchOnce = async (token: string) => {
    const base = { apiBase: config.apiBase, token, signal: ctrl.signal }
    const [actions, actorTypes, targetTypes] = await Promise.all([
      listDistinctActions(base).catch(() => ({ actions: [] })),
      listDistinctActorTypes(base).catch(() => ({ actor_types: [] })),
      listDistinctTargetTypes(base).catch(() => ({ target_types: [] })),
    ])
    if (disposed) return
    setState({
      actions: actions.actions,
      actorTypes: actorTypes.actor_types,
      targetTypes: targetTypes.target_types,
    })
  }

  if (config.token) {
    void (async () => {
      try {
        await fetchOnce(config.token!)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (err instanceof EmbedError && err.kind === 'unauthorized') {
          const refreshed = await fetchTokenViaOpts({
            tokenEndpoint: config.tokenEndpoint,
            onTokenExpired: config.onTokenExpired,
          })
          if (refreshed && !disposed) {
            try {
              await fetchOnce(refreshed)
            } catch {
              // Distinct dropdowns are non-critical; swallow.
            }
          }
        }
      }
    })()
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      ctrl.abort()
      listeners.clear()
    },
  }
}
