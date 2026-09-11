import type { CalcField, FieldRef } from '../types/content'
import type { TableInfo } from './sqlite'

/** Pseudo-table name used in FieldRefs that point at a calculated field. */
export const CALC_TABLE = '(calc)'

export const isCalc = (f: FieldRef) => f.table === CALC_TABLE
export const calcRef = (c: CalcField): FieldRef => ({ table: CALC_TABLE, column: c.name })

const KEYWORDS = new Set(
  'case when then else end and or not null is in like between as cast integer int real text numeric distinct true false escape glob collate exists asc desc'.split(' '),
)
const AGG_RE = /\b(sum|avg|count|min|max|total|group_concat)\s*\(/i
const MARK = '§' // placeholder marker for protected string literals

export interface Resolved {
  /** SQL expression with every column reference fully qualified. */
  sql: string
  /** Tables the expression touches. */
  tables: string[]
  /** Contains an aggregate function. */
  aggregate: boolean
  error?: string
}

const q = (s: string) => `"${s.replace(/"/g, '""')}"`

/**
 * Resolve a calculated-field expression against the database model.
 * Accepts Column, Table.Column, Table[Column], [Column] and references to other
 * calculated fields by name. Ambiguous bare columns are an error unless one of
 * `prefer` tables owns one.
 */
export function resolveExpr(expr: string, model: TableInfo[], calcs: CalcField[] = [], prefer: string[] = [], depth = 0): Resolved {
  const tables = new Set<string>()
  let error: string | undefined
  if (!expr.trim()) return { sql: '', tables: [], aggregate: false, error: 'Expression is empty.' }
  if (depth > 3) return { sql: '', tables: [], aggregate: false, error: 'Calculated fields reference each other too deeply.' }

  // 1. protect string literals
  const strings: string[] = []
  let s = expr.replace(/'(?:[^']|'')*'/g, (m) => {
    strings.push(m)
    return `${MARK}${strings.length - 1}${MARK}`
  })

  const findTable = (name: string) => model.find((t) => t.name.toLowerCase() === name.toLowerCase())
  const findCol = (t: TableInfo, name: string) => t.columns.find((c) => c.name.toLowerCase() === name.toLowerCase())
  const findCalc = (name: string) => calcs.find((c) => c.name.toLowerCase() === name.toLowerCase())
  const inlineCalc = (c: CalcField): string => {
    const r = resolveExpr(c.expr, model, calcs.filter((x) => x !== c), prefer, depth + 1)
    if (r.error) error ??= `In "${c.name}": ${r.error}`
    for (const t of r.tables) tables.add(t)
    return `(${r.sql})`
  }
  const qualify = (t: TableInfo, colName: string) => {
    tables.add(t.name)
    return `${q(t.name)}.${q(findCol(t, colName)!.name)}`
  }
  const resolveBare = (name: string): string | null => {
    const owners = model.filter((t) => findCol(t, name))
    if (owners.length === 1) return qualify(owners[0], name)
    if (owners.length > 1) {
      const preferred = owners.filter((t) => prefer.includes(t.name))
      if (preferred.length === 1) return qualify(preferred[0], name)
      error ??= `"${name}" is ambiguous (${owners.map((t) => `${t.name}.${findCol(t, name)!.name}`).join(', ')}); write Table.Column.`
      return `"${name}"`
    }
    const c = findCalc(name)
    if (c) return inlineCalc(c)
    return null
  }

  // 2. Table[Column]
  s = s.replace(/([A-Za-z_][A-Za-z0-9_]*)\s*\[([^\]]+)\]/g, (_, t: string, c: string) => {
    const tab = findTable(t)
    if (!tab) {
      error ??= `Unknown table "${t}".`
      return `${q(t)}.${q(c)}`
    }
    if (!findCol(tab, c.trim())) {
      error ??= `Table ${tab.name} has no column "${c.trim()}".`
      return `${q(tab.name)}.${q(c.trim())}`
    }
    return qualify(tab, c.trim())
  })
  // 3. [Column] or [Calc name]
  s = s.replace(/\[([^\]]+)\]/g, (_, c: string) => {
    const r = resolveBare(c.trim())
    if (r) return r
    error ??= `Unknown field "${c.trim()}".`
    return q(c.trim())
  })
  // 4. Table.Column
  s = s.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)\b/g, (m, t: string, c: string) => {
    const tab = findTable(t)
    if (!tab) {
      error ??= `Unknown table "${t}".`
      return m
    }
    if (!findCol(tab, c)) {
      error ??= `Table ${tab.name} has no column "${c}".`
      return m
    }
    return qualify(tab, c)
  })
  // 5. bare identifiers (not already quoted, not function calls, not keywords)
  s = s.replace(/(^|[^"\w.])([A-Za-z_][A-Za-z0-9_]*)/g, (m, pre: string, name: string, offset: number, whole: string) => {
    const after = whole.slice(offset + m.length).replace(/^\s+/, '')
    if (after.startsWith('(')) return m // function call
    if (KEYWORDS.has(name.toLowerCase())) return m
    const r = resolveBare(name)
    if (r) return pre + r
    error ??= `Unknown column "${name}".`
    return m
  })
  // restore strings
  s = s.replace(new RegExp(`${MARK}(\\d+)${MARK}`, 'g'), (_, i: string) => strings[Number(i)])
  return { sql: s, tables: [...tables], aggregate: AGG_RE.test(expr), error }
}

/** Quick validation for the editor: resolves and, if a runner is given, executes it once. */
export function validateCalc(
  expr: string,
  model: TableInfo[],
  calcs: CalcField[],
  run?: (sql: string, tables: string[]) => void,
): { ok: boolean; message: string; aggregate: boolean; tables: string[] } {
  const r = resolveExpr(expr, model, calcs)
  if (r.error) return { ok: false, message: r.error, aggregate: r.aggregate, tables: r.tables }
  if (run && r.tables.length) {
    try {
      run(r.sql, r.tables)
    } catch (e) {
      return { ok: false, message: (e as Error).message, aggregate: r.aggregate, tables: r.tables }
    }
  }
  return { ok: true, message: r.aggregate ? 'The calculation is valid (aggregate measure).' : 'The calculation is valid.', aggregate: r.aggregate, tables: r.tables }
}
