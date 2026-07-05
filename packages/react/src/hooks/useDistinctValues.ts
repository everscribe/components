'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  createDistinctValuesStore,
  EMPTY_DISTINCT_VALUES,
  type DistinctValues,
  type DistinctValuesStore,
} from '@everscribe/components-core'

export type { DistinctValues } from '@everscribe/components-core'

export interface UseDistinctValuesOptions {
  apiBase: string
  token: string | null
  tokenEndpoint?: string
  onTokenExpired?: () => Promise<string>
}

const NOOP_UNSUB = () => {}

// useDistinctValues fetches the three filter-dropdown source lists once
// per token. Failures are swallowed silently - an empty dropdown is
// strictly better UX than blocking the table render on a 500.
export function useDistinctValues(opts: UseDistinctValuesOptions): DistinctValues {
  const [store, setStore] = useState<DistinctValuesStore | null>(null)

  useEffect(() => {
    if (!opts.token) {
      setStore(null)
      return
    }
    const s = createDistinctValuesStore({
      apiBase: opts.apiBase,
      token: opts.token,
      tokenEndpoint: opts.tokenEndpoint,
      onTokenExpired: opts.onTokenExpired,
    })
    setStore(s)
    return () => {
      s.dispose()
    }
  }, [opts.token, opts.apiBase])

  const subscribe = useMemo(
    () => (listener: () => void) => store?.subscribe(listener) ?? NOOP_UNSUB,
    [store],
  )
  const getSnapshot = () => store?.getSnapshot() ?? EMPTY_DISTINCT_VALUES
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
