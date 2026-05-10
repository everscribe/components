import {
  EmbedError,
  fetchTokenViaOpts,
  listChangeFields,
  listDistinctActions,
  listDistinctActorTypes,
  listDistinctResultStatuses,
  listDistinctTargetTypes,
  listMetadataKeys,
} from './api.js'
import type { ChangeField, MetadataKey } from './types.js'

export interface DistinctValues {
  actions: string[]
  actorTypes: string[]
  targetTypes: string[]
  resultStatuses: string[]
  metadataKeys: MetadataKey[]
  changeFields: ChangeField[]
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
  resultStatuses: [],
  metadataKeys: [],
  changeFields: [],
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
    const [actions, actorTypes, targetTypes, statuses, mdk, cf] = await Promise.all([
      listDistinctActions(base).catch(() => ({ actions: [] })),
      listDistinctActorTypes(base).catch(() => ({ actor_types: [] })),
      listDistinctTargetTypes(base).catch(() => ({ target_types: [] })),
      listDistinctResultStatuses(base).catch(() => ({ statuses: [] })),
      listMetadataKeys(base).catch(() => ({ keys: [] })),
      listChangeFields(base).catch(() => ({ fields: [] })),
    ])
    if (disposed) return
    // Coerce nullable response fields to empty arrays — the Go server
    // serializes a nil slice as `null`, not `[]`, when a project has
    // no rows. Without this guard, `distinct.metadataKeys.map(...)`
    // crashes on a fresh project.
    setState({
      actions: actions.actions ?? [],
      actorTypes: actorTypes.actor_types ?? [],
      targetTypes: targetTypes.target_types ?? [],
      resultStatuses: statuses.statuses ?? [],
      metadataKeys: mdk.keys ?? [],
      changeFields: cf.fields ?? [],
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
