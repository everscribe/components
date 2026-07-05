// renderDiff turns an event's `change` payload ({before, after}) into a
// side-by-side line diff for the Inspect Event modal. Mirrors the
// upstream Go implementation (internal/ui/diff.go) so client and
// server produce the same alignment.
//
// Strategy: pretty-print both sides as 2-space-indented JSON, split by
// '\n', and run an LCS-based line diff. Line-level granularity is
// coarser than a structural JSON diff but works for the common
// mutation patterns and stays dependency-free.

export type DiffKind = 'same' | 'removed' | 'added' | ''

export interface DiffLine {
  before: string
  after: string
  beforeKind: DiffKind
  afterKind: DiffKind
}

export interface DiffView {
  lines: DiffLine[]
}

export function renderDiff(change: unknown): DiffView {
  if (change == null || typeof change !== 'object') return { lines: [] }
  const c = change as { before?: unknown; after?: unknown }
  if (c.before === undefined && c.after === undefined) return { lines: [] }
  const beforeStr = prettyJSON(c.before)
  const afterStr = prettyJSON(c.after)
  return { lines: lineDiff(splitLines(beforeStr), splitLines(afterStr)) }
}

// hasParseableDiff is the cheap predicate for "should we show the Diff
// tab?" - true when the change payload has at least one of {before,
// after} present (matches renderDiff's early-out logic without paying
// the LCS cost).
export function hasParseableDiff(change: unknown): boolean {
  if (change == null || typeof change !== 'object') return false
  const c = change as { before?: unknown; after?: unknown }
  return c.before !== undefined || c.after !== undefined
}

function prettyJSON(v: unknown): string {
  if (v === undefined || v === null) return 'null'
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

function splitLines(s: string): string[] {
  if (s === '') return []
  return s.split('\n')
}

function lineDiff(before: string[], after: string[]): DiffLine[] {
  const n = before.length
  const m = after.length
  if (n === 0 && m === 0) return []

  // dp[i][j] = length of the longest common subsequence of
  // before[i:] and after[j:]. Filled bottom-up so the walk-back
  // below can read forward into a populated table.
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  )
  for (let i = n - 1; i >= 0; i--) {
    const row = dp[i]!
    const next = dp[i + 1]!
    for (let j = m - 1; j >= 0; j--) {
      if (before[i] === after[j]) {
        row[j] = next[j + 1]! + 1
      } else if (next[j]! >= row[j + 1]!) {
        row[j] = next[j]!
      } else {
        row[j] = row[j + 1]!
      }
    }
  }

  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      out.push({
        before: before[i]!,
        after: after[j]!,
        beforeKind: 'same',
        afterKind: 'same',
      })
      i++
      j++
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ before: before[i]!, after: '', beforeKind: 'removed', afterKind: '' })
      i++
    } else {
      out.push({ before: '', after: after[j]!, beforeKind: '', afterKind: 'added' })
      j++
    }
  }
  while (i < n) {
    out.push({ before: before[i]!, after: '', beforeKind: 'removed', afterKind: '' })
    i++
  }
  while (j < m) {
    out.push({ before: '', after: after[j]!, beforeKind: '', afterKind: 'added' })
    j++
  }
  return out
}
