export function decodeJwtPayload<T = unknown>(token: string): T {
  const parts = token.trim().split('.')
  if (parts.length !== 3) {
    throw new Error('malformed token: expected three dot-separated segments')
  }
  const b64url = parts[1]
  if (!b64url) throw new Error('malformed token: empty payload segment')

  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = (4 - (b64.length % 4)) % 4
  const padded = b64 + '='.repeat(pad)

  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  const json = new TextDecoder().decode(bytes)
  return JSON.parse(json) as T
}
