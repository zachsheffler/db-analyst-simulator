/** Common grading result shape shared by all modules. */

export interface GradeItem {
  ok: boolean
  points: number
  max: number
  text: string
  /** 'info' items carry 0 max and are advisory. */
  level?: 'info' | 'warn'
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
