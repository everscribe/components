import { useMemo } from 'react'
import { parseClaims, type EmbedClaims } from '@everscribe/components-core'

export function useClaims(token: string | null | undefined): EmbedClaims | null {
  return useMemo(() => parseClaims(token), [token])
}
