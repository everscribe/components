'use client'

import type { CSSProperties } from 'react'

export interface EverscribeEventsProps {
  token: string
  apiBase?: string
  pageSize?: number
  pollInterval?: number
  theme?: 'light' | 'dark'
  className?: string
  style?: CSSProperties
  tokenEndpoint?: string
  onTokenExpired?: () => Promise<string>
  onError?: (err: Error) => void
}

export function EverscribeEvents(props: EverscribeEventsProps) {
  return (
    <div className={props.className} style={props.style}>
      Everscribe Events (stub)
    </div>
  )
}
