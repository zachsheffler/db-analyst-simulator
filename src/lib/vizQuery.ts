import type { Aggregation, FieldRef, VisualSpec, VisualType } from '../types/content'
import type { TableInfo } from './sqlite'

export const VISUAL_LABELS: Record<VisualType, string> = {
  clusteredColumn: 'Clustered column chart',
  clusteredBar: 'Clustered bar chart',
  stackedColumn: 'Stacked column chart',
  line: 'Line chart',
  pie: 'Pie chart',
  donut: 'Donut chart',
  card: 'Card',
  table: 'Table',
}

export const AGG_LABELS: Record<Aggregation, string> = {
  sum: 'Sum',
  avg: 'Average',
  count: 'Count',
  countDistinct: 'Count (Distinct)',
  min: 'Minimum',
  max: 'Maximum',
  none: "Don't summarize",
}

/** Which field wells a visual type exposes. */
export function wellsFor(type: VisualType): { axis?: string; legend?: string; values?: string; columns?: string } {
  switch (type) {
    case 'clusteredColumn':
    case 'stackedColumn':
    case 'clusteredBar':
      return { axis: 'X-axis', legend: 'Legend', values: 'Y-axis' }
    case 'line':
      return { axis: 'X-axis', legend: 'Legend', values: 'Y-axis' }
    case 'pie':
    case 'donut':
      return { axis: 'Legend', values: 'Values' }
    case 'card':
      return { values: 'Fields' }
    case 'table':
      return { columns: 'Columns' }
  }
}

export function isNumericType(t: string): boolean {
  return /int|real|num|dec|doub|float|money/i.test(t)
}

export function fieldKey(f: FieldRef): string {
  return `${f.table}.${f.column}`
}

const q = (s: string) => `"${s.replace(/"/g, '""')}"`
const qf = (f: FieldRef) => `${q(f.table)}.${q(f.column)}`

function aggSql(agg: Aggregation, f: FieldRef): string {
  const x = qf(f)
  switch (agg) {
    case 'sum':
      return `SUM(${x})`
    case 'avg':
      return `AVG(${x})`
    case 'count':
      return `COUNT(${x})`
    case 'countDistinct':
      return `COUNT(DISTINCT ${x})`
    case 'min':
      return `MIN(${x})`
    case 'max':
      return `MAX(${x})`
    default:
      return x
  }
}

export function measureLabel(agg: Aggregation, f: FieldRef): string {
  if (agg === 'none') return f.column
  return `${AGG_LABELS[agg]} of ${f.column}`
}

function lit(v: string | number): string {
  return typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`
}

interface Edge {
  a: string
  b: string
  on: string
}

function edges(model: TableInfo[]): Edge[] {
  const out: Edge[] = []
  for (const t of model) {
    for (const fk of t.fks) {
      const ref = model.find((m) => m.name === fk.table)
      if (!ref) continue
      const to = fk.to.map((c, i) => c || ref.columns.filter((x) => x.pk > 0).sort((x, y) => x.pk - y.pk)[i]?.name || '')
      const on = fk.from.map((c, i) => `${q(t.name)}.${q(c)} = ${q(ref.name)}.${q(to[i])}`).join(' AND ')
      out.push({ a: t.name, b: ref.name, on })
    }
  }
  return out
}

/** Build FROM/JOIN clause connecting all needed tables through foreign keys. */
export function joinPlan(model: TableInfo[], needed: string[]): { from: string; error?: string; tables: string[] } {
  const uniq = [...new Set(needed)]
  if (!uniq.length) return { from: '', error: 'No fields selected.', tables: [] }
  const es = edges(model)
  const joined: string[] = [uniq[0]]
  let from = q(uniq[0])
  const adj = (t: string) => es.filter((e) => e.a === t || e.b === t).map((e) => ({ other: e.a === t ? e.b : e.a, on: e.on }))
  while (true) {
    const missing = uniq.filter((t) => !joined.includes(t))
    if (!missing.length) break
    // BFS from joined set
    const prev = new Map<string, { from: string; on: string }>()
    const queue = [...joined]
    const seen = new Set(joined)
    let target: string | null = null
    while (queue.length && !target) {
      const cur = queue.shift()!
      for (const { other, on } of adj(cur)) {
        if (seen.has(other)) continue
        seen.add(other)
        prev.set(other, { from: cur, on })
        if (missing.includes(other)) {
          target = other
          break
        }
        queue.push(other)
      }
    }
    if (!target) return { from, error: `No relationship path connects ${joined[0]} to ${missing[0]}.`, tables: joined }
    // walk back to build path
    const path: string[] = []
    let cur: string = target
    while (!joined.includes(cur)) {
      path.unshift(cur)
      cur = prev.get(cur)!.from
    }
    for (const t of path) {
      from += ` JOIN ${q(t)} ON ${prev.get(t)!.on}`
      joined.push(t)
    }
  }
  return { from, tables: joined }
}

export interface BuiltQuery {
  sql: string
  /** Number of leading dimension columns in the result (0 for card). */
  dims: number
  error?: string
}

export function buildSql(spec: VisualSpec, model: TableInfo[]): BuiltQuery {
  const dims: FieldRef[] = []
  const measures: { field: FieldRef; agg: Aggregation }[] = []
  if (spec.type === 'table') {
    for (const c of spec.columns ?? []) {
      if (c.agg === 'none') dims.push(c.field)
      else measures.push(c)
    }
  } else if (spec.type === 'card') {
    if (spec.values[0]) measures.push(spec.values[0])
  } else {
    if (spec.axis) dims.push(spec.axis)
    if (spec.legend && spec.type !== 'pie' && spec.type !== 'donut') dims.push(spec.legend)
    measures.push(...spec.values)
  }
  if (!dims.length && !measures.length) return { sql: '', dims: 0, error: 'Drag fields into the visual to build it.' }
  const needed = [...dims, ...measures.map((m) => m.field), ...spec.filters.map((f) => f.field)].map((f) => f.table)
  const plan = joinPlan(model, needed)
  if (plan.error) return { sql: '', dims: 0, error: plan.error }

  const selectParts: string[] = []
  for (const d of dims) selectParts.push(`${qf(d)} AS ${q(d.column)}`)
  for (const m of measures) selectParts.push(`${aggSql(m.agg, m.field)} AS ${q(measureLabel(m.agg, m.field))}`)
  // table with only dims and no measures: distinct rows (Power BI collapses duplicates)
  const distinct = spec.type === 'table' && !measures.length ? 'DISTINCT ' : ''
  let sql = `SELECT ${distinct}${selectParts.join(', ')} FROM ${plan.from}`
  const where = spec.filters
    .map((f) => {
      const x = qf(f.field)
      switch (f.op) {
        case 'in':
          return f.values.length ? `${x} IN (${f.values.map(lit).join(', ')})` : ''
        case 'between':
          return `${x} BETWEEN ${lit(f.values[0])} AND ${lit(f.values[1])}`
        case 'eq':
          return `${x} = ${lit(f.values[0])}`
        case 'gte':
          return `${x} >= ${lit(f.values[0])}`
        case 'lte':
          return `${x} <= ${lit(f.values[0])}`
      }
    })
    .filter(Boolean)
  if (where.length) sql += ` WHERE ${where.join(' AND ')}`
  if (dims.length && measures.length) sql += ` GROUP BY ${dims.map((d) => qf(d)).join(', ')}`
  // ordering
  const sort = spec.sort ?? defaultSort(spec)
  if (sort && (dims.length || measures.length)) {
    const target = sort.by === 'axis' ? (dims[0] ? qf(dims[0]) : null) : measures[0] ? aggSql(measures[0].agg, measures[0].field) : null
    if (target) sql += ` ORDER BY ${target} ${sort.dir.toUpperCase()}`
  }
  return { sql, dims: dims.length }
}

export function defaultSort(spec: VisualSpec): VisualSpec['sort'] | undefined {
  switch (spec.type) {
    case 'line':
      return { by: 'axis', dir: 'asc' }
    case 'clusteredColumn':
    case 'clusteredBar':
    case 'stackedColumn':
    case 'pie':
    case 'donut':
      return { by: 'value', dir: 'desc' }
    default:
      return undefined
  }
}

export function emptySpec(type: VisualType = 'clusteredColumn'): VisualSpec {
  return { type, values: [], columns: [], filters: [] }
}
