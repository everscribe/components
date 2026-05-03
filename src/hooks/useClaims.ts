import { useMemo } from 'react'
import { decodeJwtPayload } from '../lib/jwt.js'
import type { EmbedClaims } from '../lib/types.js'

export function useClaims(token: string): EmbedClaims | null {
  return useMemo(() => {
    try {
      return decodeJwtPayload<EmbedClaims>(token)
    } catch {
      return null
    }
  }, [token])
}
