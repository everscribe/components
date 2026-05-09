// LiveIndicator renders the green "● Live" badge in the toolbar when
// the events table is actively polling for updates. Hidden whenever
// polling is disabled — either because pollInterval was set to 0 or
// because a closed-upper-bound time filter is in effect.
export interface LiveIndicatorProps {
  active: boolean
}

export function LiveIndicator({ active }: LiveIndicatorProps) {
  if (!active) return null
  return (
    <span className="audit-trail-live" aria-label="Live updates" title="Live updates">
      <span className="audit-trail-live-dot" aria-hidden="true" />
      <span>Live</span>
    </span>
  )
}
