import { decodeJwtPayload } from './jwt.js'
import type { EmbedClaims } from './types.js'

export function parseClaims(token: string | null | undefined): EmbedClaims | null {
  if (!token) return null
  try {
    return decodeJwtPayload<EmbedClaims>(token)
  } catch {
    return null
  }
}
