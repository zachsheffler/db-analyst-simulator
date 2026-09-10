import type { QueryTemplate } from '../types/content'
import type { DB, ResultSet } from './sqlite'

export interface GeneratedQuestion {
  template: QueryTemplate
  text: string
  sql: string
  expected: ResultSet
  points: number
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function substitute(s: string, values: Record<string, string | number>): string {
  return s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => String(values[k] ?? `{{${k}}}`))
}

export const DEFAULT_POINTS: Record<number, number> = { 1: 10, 2: 15, 3: 20, 4: 30, 5: 40 }

/** Instantiate a template with random parameters; retries until the reference query returns rows. */
export function generateQuestion(db: DB, t: QueryTemplate, attempts = 10): GeneratedQuestion | null {
  for (let i = 0; i < attempts; i++) {
    const values: Record<string, string | number> = {}
    for (const [k, p] of Object.entries(t.params ?? {})) {
      if (p.values?.length) values[k] = pick(p.values)
      else if (p.from) {
        try {
          const rs = db.query(p.from, 500)
          if (!rs.rows.length) return null
          const v = pick(rs.rows)[0]
          values[k] = v === null ? '' : v
        } catch {
          return null
        }
      }
    }
    const sql = substitute(t.sql, values)
    try {
      const expected = db.query(sql)
      if (expected.rows.length === 0 && i < attempts - 1) continue
      return { template: t, text: substitute(t.text, values), sql, expected, points: t.points ?? DEFAULT_POINTS[t.difficulty] ?? 10 }
    } catch {
      return null
    }
  }
  return null
}

/** Shuffle a copy. */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const TOPIC_LABELS: Record<string, string> = {
  'select-basic': 'SELECT basics',
  'select-where': 'WHERE conditions',
  'distinct-order': 'DISTINCT & ORDER BY',
  'like-in-between': 'LIKE, IN, BETWEEN',
  aggregate: 'Aggregate functions',
  'group-by': 'GROUP BY',
  having: 'HAVING',
  join: 'Joins',
  'multi-join': 'Multi-table joins',
  alias: 'Aliases',
  subquery: 'Nested queries',
  'set-ops': 'Set operators',
  exists: 'EXISTS / correlated',
  'self-join': 'Self-joins',
  null: 'NULL handling',
  'outer-join': 'Outer joins',
  view: 'Views',
  dml: 'INSERT / UPDATE / DELETE',
}
