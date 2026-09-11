/** Persistent progress in localStorage. */

export interface SprintSession {
  date: string
  setId: string
  durationSec: number
  score: number
  answered: number
  correct: number
  bestStreak: number
}
export type QuerySession = SprintSession

export interface Progress {
  studentName: string
  design: Record<string, { er?: number; schema?: number; ddl?: number; max?: { er: number; schema: number; ddl: number } }>
  query: { sessions: QuerySession[] }
  present: Record<string, { score: number; max: number }>
  /** Diagramming sprints (generated ER / schema questions). */
  designSprints: { sessions: SprintSession[] }
  /** Viz sprints (generated chart questions). */
  vizSprints: { sessions: SprintSession[] }
}

const KEY = 'dbsim.progress.v1'

function empty(): Progress {
  return { studentName: '', design: {}, query: { sessions: [] }, present: {}, designSprints: { sessions: [] }, vizSprints: { sessions: [] } }
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...empty(), ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return empty()
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}

export function updateProgress(fn: (p: Progress) => void): Progress {
  const p = loadProgress()
  fn(p)
  saveProgress(p)
  return p
}

export function resetProgress(): void {
  localStorage.removeItem(KEY)
}

export function totals(p: Progress) {
  const design = Object.values(p.design).reduce((a, d) => a + (d.er ?? 0) + (d.schema ?? 0) + (d.ddl ?? 0), 0)
  const designMax = Object.values(p.design).reduce((a, d) => a + (d.max ? d.max.er + d.max.schema + d.max.ddl : 0), 0)
  const best = (s: SprintSession[]) => s.reduce((a, x) => Math.max(a, x.score), 0)
  const present = Object.values(p.present).reduce((a, s) => a + s.score, 0)
  const presentMax = Object.values(p.present).reduce((a, s) => a + s.max, 0)
  return { design, designMax, queryBest: best(p.query.sessions), present, presentMax, designSprintBest: best(p.designSprints.sessions), vizSprintBest: best(p.vizSprints.sessions) }
}
