import { useMemo } from 'react'
import { decodeJwtPayload } from '../lib/jwt.js'
import type { EmbedClaims } from '../lib/types.js'

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
