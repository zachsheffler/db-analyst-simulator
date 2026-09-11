import { useEffect, useMemo, useRef, useState } from 'react'
import type { Aggregation, CalcField, DatabaseDef, FieldRef, VisualSpec, VisualType, VizFilter } from '../../types/content'
import { DB, type ResultSet, type TableInfo } from '../../lib/sqlite'
import { buildSql, defaultSort, emptySpec, fieldKey, isNumericType, joinPlan, wellsFor, type BuiltQuery } from '../../lib/vizQuery'
import { CALC_TABLE, calcRef, isCalc } from '../../lib/calcFields'
import { toChartData, type ChartData } from './charts'

export type Well = 'axis' | 'legend' | 'values' | 'columns'

export interface FieldInfo {
  ref: FieldRef
  table: string
  name: string
  numeric: boolean
  pk: boolean
  fk: boolean
  date: boolean
  calc?: CalcField
}

export interface Workbench {
  dbDef: DatabaseDef
  db: DB | null
  ready: boolean
  tables: TableInfo[]
  /** Real columns, grouped by table order. */
  fields: FieldInfo[]
  /** Calculated fields. */
  calcFields: FieldInfo[]
  spec: VisualSpec
  update: (f: (s: VisualSpec) => VisualSpec) => void
  built: BuiltQuery
  data: { rs: ResultSet | null; error: string | null }
  chart: ChartData | null
  sort: VisualSpec['sort']
  wells: ReturnType<typeof wellsFor>
  numeric: (f: FieldRef) => boolean
  info: (f: FieldRef) => FieldInfo | undefined
  isUsed: (f: FieldRef) => boolean
  addField: (f: FieldRef, well?: Well) => void
  removeField: (f: FieldRef) => void
  setType: (t: VisualType) => void
  setAgg: (f: FieldRef, agg: Aggregation) => void
  addFilter: (f: FieldRef) => void
  setFilter: (i: number, f: VizFilter) => void
  removeFilter: (i: number) => void
  setSort: (s: VisualSpec['sort']) => void
  setTitle: (t: string) => void
  addCalc: (c: CalcField) => void
  removeCalc: (name: string) => void
  clear: () => void
  distinctValues: (f: FieldRef) => (string | number)[]
  queryTable: (name: string, limit?: number) => ResultSet | null
  /** Run an expression once (for calc validation); throws on SQL errors. */
  probe: (sql: string, tables: string[]) => void
}

export const DRAG_MIME = 'text/plain'
export function dragStart(e: React.DragEvent, f: FieldRef) {
  e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ field: f }))
}
export function readDrag(e: React.DragEvent): FieldRef | null {
  try {
    const p = JSON.parse(e.dataTransfer.getData(DRAG_MIME)) as { field?: FieldRef }
    return p.field ?? null
  } catch {
    return null
  }
}
/** Props for a drop target. */
export function dropProps(onDrop: (f: FieldRef) => void) {
  return {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).classList.add('over')
    },
    onDragLeave: (e: React.DragEvent) => (e.currentTarget as HTMLElement).classList.remove('over'),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).classList.remove('over')
      const f = readDrag(e)
      if (f) onDrop(f)
    },
  }
}

export function useWorkbench(dbDef: DatabaseDef, onDirty?: () => void, resetKey?: string): Workbench {
  const dbRef = useRef<DB | null>(null)
  const [tables, setTables] = useState<TableInfo[]>([])
  const [ready, setReady] = useState(false)
  const [spec, setSpec] = useState<VisualSpec>(emptySpec())
  const [, bump] = useState(0)

  useEffect(() => {
    let alive = true
    setReady(false)
    DB.create([...dbDef.ddl, ...dbDef.seed]).then((db) => {
      if (!alive) return db.close()
      dbRef.current = db
      setTables(db.describe())
      setReady(true)
      bump((x) => x + 1)
    })
    return () => {
      alive = false
      dbRef.current?.close()
      dbRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbDef.id])

  useEffect(() => {
    if (resetKey !== undefined) setSpec(emptySpec())
  }, [resetKey])

  const built = useMemo(() => buildSql(spec, tables), [spec, tables])
  const data = useMemo<{ rs: ResultSet | null; error: string | null }>(() => {
    const db = dbRef.current
    if (!db || !built.sql) return { rs: null, error: built.error ?? null }
    try {
      return { rs: db.query(built.sql, 2000), error: null }
    } catch (e) {
      return { rs: null, error: (e as Error).message }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built, tables, ready])
  const chart = useMemo(() => (data.rs ? toChartData(data.rs, built.dims) : null), [data, built.dims])

  const fields = useMemo<FieldInfo[]>(
    () =>
      tables.flatMap((t) =>
        t.columns.map((c) => {
          const fk = t.fks.some((f) => f.from.includes(c.name))
          return {
            ref: { table: t.name, column: c.name },
            table: t.name,
            name: c.name,
            numeric: isNumericType(c.type) && c.pk === 0 && !fk,
            pk: c.pk > 0,
            fk,
            date: /date|month|year|time/i.test(c.type) || /date|month|year|time/i.test(c.name),
          }
        }),
      ),
    [tables],
  )
  const calcFields = useMemo<FieldInfo[]>(
    () => (spec.calcs ?? []).map((c) => ({ ref: calcRef(c), table: CALC_TABLE, name: c.name, numeric: c.numeric, pk: false, fk: false, date: false, calc: c })),
    [spec.calcs],
  )
  const info = (f: FieldRef) => (isCalc(f) ? calcFields : fields).find((x) => fieldKey(x.ref) === fieldKey(f))
  const numeric = (f: FieldRef) => !!info(f)?.numeric
  const wells = wellsFor(spec.type)

  const update = (fn: (s: VisualSpec) => VisualSpec) => {
    onDirty?.()
    setSpec(fn)
  }
  const same = (a: FieldRef | undefined, b: FieldRef) => !!a && fieldKey(a) === fieldKey(b)

  const isUsed = (f: FieldRef) => same(spec.axis, f) || same(spec.legend, f) || spec.values.some((v) => same(v.field, f)) || (spec.columns ?? []).some((v) => same(v.field, f))

  /** Add a field to the most sensible well (Power BI's click-to-add behavior). */
  const addField = (f: FieldRef, well?: Well) => {
    const isNum = numeric(f)
    update((s) => {
      const w = wellsFor(s.type)
      const defaultAgg: Aggregation = isNum ? 'sum' : 'count'
      const target = well ?? (w.columns ? 'columns' : isNum && w.values ? 'values' : !s.axis && w.axis ? 'axis' : w.legend && !s.legend && s.axis ? 'legend' : 'values')
      if (target === 'columns') {
        if ((s.columns ?? []).some((c) => same(c.field, f))) return s
        return { ...s, columns: [...(s.columns ?? []), { field: f, agg: isNum ? 'sum' : 'none' }] }
      }
      if (target === 'axis') return { ...s, axis: f }
      if (target === 'legend') return { ...s, legend: f }
      if (s.values.some((v) => same(v.field, f))) return s
      const values = s.type === 'card' ? [{ field: f, agg: defaultAgg }] : [...s.values, { field: f, agg: defaultAgg }]
      return { ...s, values }
    })
  }
  const removeField = (f: FieldRef) =>
    update((s) => ({
      ...s,
      axis: same(s.axis, f) ? undefined : s.axis,
      legend: same(s.legend, f) ? undefined : s.legend,
      values: s.values.filter((v) => !same(v.field, f)),
      columns: (s.columns ?? []).filter((v) => !same(v.field, f)),
    }))
  const setType = (type: VisualType) =>
    update((s) => {
      const w = wellsFor(type)
      const next: VisualSpec = { ...s, type, sort: undefined }
      if (w.columns) {
        const cols = [...(s.columns ?? [])]
        const push = (fr: FieldRef, agg: Aggregation) => !cols.some((c) => same(c.field, fr)) && cols.push({ field: fr, agg })
        if (s.axis) push(s.axis, 'none')
        if (s.legend) push(s.legend, 'none')
        for (const v of s.values) push(v.field, v.agg)
        next.columns = cols
      } else if (s.type === 'table' && s.columns?.length) {
        const dims = s.columns.filter((c) => c.agg === 'none')
        next.axis = dims[0]?.field
        next.legend = w.legend ? dims[1]?.field : undefined
        next.values = s.columns.filter((c) => c.agg !== 'none')
      }
      if (!w.axis) next.axis = undefined
      if (!w.legend) next.legend = undefined
      if (type === 'card') next.values = next.values.slice(0, 1)
      return next
    })
  const setAgg = (f: FieldRef, agg: Aggregation) =>
    update((s) => ({
      ...s,
      values: s.values.map((v) => (same(v.field, f) ? { ...v, agg } : v)),
      columns: (s.columns ?? []).map((v) => (same(v.field, f) ? { ...v, agg } : v)),
    }))
  const addFilter = (f: FieldRef) => {
    if (isCalc(f)) return
    const isNum = numeric(f)
    update((s) => {
      if (s.filters.some((x) => same(x.field, f))) return s
      const filt: VizFilter = isNum ? { field: f, op: 'between', values: [] } : { field: f, op: 'in', values: [] }
      return { ...s, filters: [...s.filters, filt] }
    })
  }
  const setFilter = (i: number, f: VizFilter) => update((s) => ({ ...s, filters: s.filters.map((x, j) => (j === i ? f : x)) }))
  const removeFilter = (i: number) => update((s) => ({ ...s, filters: s.filters.filter((_, j) => j !== i) }))
  const setSort = (sort: VisualSpec['sort']) => update((s) => ({ ...s, sort }))
  const setTitle = (title: string) => update((s) => ({ ...s, title }))
  const addCalc = (c: CalcField) => update((s) => ({ ...s, calcs: [...(s.calcs ?? []).filter((x) => x.name !== c.name), c] }))
  const removeCalc = (name: string) =>
    update((s) => {
      const gone = (f: FieldRef) => isCalc(f) && f.column === name
      return {
        ...s,
        calcs: (s.calcs ?? []).filter((x) => x.name !== name),
        axis: s.axis && gone(s.axis) ? undefined : s.axis,
        legend: s.legend && gone(s.legend) ? undefined : s.legend,
        values: s.values.filter((v) => !gone(v.field)),
        columns: (s.columns ?? []).filter((v) => !gone(v.field)),
      }
    })
  const clear = () => update((s) => emptySpec(s.type, s.calcs))

  const distinctValues = (f: FieldRef) => {
    const db = dbRef.current
    if (!db || isCalc(f)) return []
    try {
      return db
        .query(`SELECT DISTINCT "${f.column.replace(/"/g, '""')}" FROM "${f.table.replace(/"/g, '""')}" ORDER BY 1`, 60)
        .rows.map((r) => r[0])
        .filter((v): v is string | number => v !== null)
    } catch {
      return []
    }
  }
  const queryTable = (name: string, limit = 100) => {
    const db = dbRef.current
    if (!db) return null
    try {
      return db.query(`SELECT * FROM "${name.replace(/"/g, '""')}"`, limit)
    } catch {
      return null
    }
  }
  const probe = (sql: string, tbls: string[]) => {
    const db = dbRef.current
    if (!db) return
    const plan = joinPlan(tables, tbls)
    if (plan.error) throw new Error(plan.error)
    db.query(`SELECT ${sql} FROM ${plan.from} LIMIT 1`, 1)
  }

  return {
    dbDef,
    db: dbRef.current,
    ready,
    tables,
    fields,
    calcFields,
    spec,
    update,
    built,
    data,
    chart,
    sort: spec.sort ?? defaultSort(spec),
    wells,
    numeric,
    info,
    isUsed,
    addField,
    removeField,
    setType,
    setAgg,
    addFilter,
    setFilter,
    removeFilter,
    setSort,
    setTitle,
    addCalc,
    removeCalc,
    clear,
    distinctValues,
    queryTable,
    probe,
  }
}

/** Compact text description of a visual spec (for the professor chat). */
export function describeSpec(wb: Workbench): string {
  const s = wb.spec
  const f = (x: FieldRef) => (isCalc(x) ? `[calc ${x.column}]` : `${x.table}.${x.column}`)
  const parts = [`Visual: ${s.type}${s.title ? ` titled "${s.title}"` : ' (no title)'}`]
  if (s.axis) parts.push(`axis: ${f(s.axis)}`)
  if (s.legend) parts.push(`legend: ${f(s.legend)}`)
  if (s.values.length) parts.push(`values: ${s.values.map((v) => `${v.agg}(${f(v.field)})`).join(', ')}`)
  if (s.columns?.length && s.type === 'table') parts.push(`columns: ${s.columns.map((v) => `${v.agg === 'none' ? '' : v.agg + ' '}${f(v.field)}`).join(', ')}`)
  if (s.filters.length) parts.push(`filters: ${s.filters.map((x) => `${f(x.field)} ${x.op} ${x.values.join(',') || '(all)'}`).join('; ')}`)
  if (s.calcs?.length) parts.push(`calculated fields: ${s.calcs.map((c) => `${c.name} = ${c.expr}`).join('; ')}`)
  if (wb.sort) parts.push(`sort: ${wb.sort.by} ${wb.sort.dir}`)
  if (wb.data.error) parts.push(`error: ${wb.data.error}`)
  else if (wb.data.rs) parts.push(`result: ${wb.data.rs.rows.length} rows × ${wb.data.rs.columns.length} columns (${wb.data.rs.columns.join(', ')})`)
  return parts.join('\n')
}
