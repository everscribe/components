import { useEffect, useState } from 'react'
import { RELATIVE_TIME_TICK_MS } from '@everscribe/components-core'

// useRelativeTimeTick returns a `now` timestamp that re-renders every
// RELATIVE_TIME_TICK_MS so consumers of the value (the events table)
// can recompute "N ago" strings without external state. Returning a
// number rather than a Date keeps the dependency stable across renders
// when the actual instant hasn't ticked yet.
export function useRelativeTimeTick(intervalMs: number = RELATIVE_TIME_TICK_MS): number {
  const [now, setNow] = useState<number>(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
