import { useMemo } from 'react'
import { decodeJwtPayload, type EmbedClaims } from '@everscribe/components-core'

export function useClaims(token: string | null | undefined): EmbedClaims | null {
  return useMemo(() => {
    if (!token) return null
    try {
      return decodeJwtPayload<EmbedClaims>(token)
    } catch {
      return null
    }
  }, [token])
}
