/** Common grading result shape shared by all modules. */

export interface GradeItem {
  ok: boolean
  points: number
  max: number
  text: string
  /** 'info' items carry 0 max and are advisory. */
  level?: 'info' | 'warn'
  /**
   * Hidden items are not shown in the score report (they carry the exact error),
   * but stay in the grade so the professor chat can use them for nudges.
   */
  hidden?: boolean
}

export interface Grade {
  score: number
  max: number
  items: GradeItem[]
}

export function makeGrade(items: GradeItem[], scaleTo?: number): Grade {
  const max = items.reduce((a, i) => a + i.max, 0)
  const score = items.reduce((a, i) => a + i.points, 0)
  if (scaleTo && max > 0) {
    const f = scaleTo / max
    return {
      score: Math.round(score * f),
      max: scaleTo,
      items: items.map((i) => ({ ...i, points: Math.round(i.points * f), max: Math.max(i.max > 0 ? 1 : 0, Math.round(i.max * f)) })),
    }
  }
  return { score: Math.round(score), max: Math.round(max), items }
}

export function item(ok: boolean, max: number, text: string, partial?: number): GradeItem {
  return { ok, max, points: ok ? max : Math.max(0, Math.min(max, partial ?? 0)), text }
}

export function info(text: string, level: 'info' | 'warn' = 'info'): GradeItem {
  return { ok: true, max: 0, points: 0, text, level }
}

/** A detail line that is kept out of the report but available to the tutor. */
export function detail(text: string): GradeItem {
  return { ok: false, max: 0, points: 0, text, hidden: true }
}

/** Percentage 0..100. */
export function pct(g: Grade): number {
  return g.max ? (100 * g.score) / g.max : 0
}

/** Short plain-text summary of what went wrong (visible items only). */
export function summarize(g: Grade, limit = 4): string {
  const bad = g.items.filter((i) => !i.hidden && i.max > 0 && !i.ok).map((i) => i.text)
  if (!bad.length) return 'Everything checks out.'
  return bad.slice(0, limit).join(' ') + (bad.length > limit ? ` (+${bad.length - limit} more)` : '')
}
