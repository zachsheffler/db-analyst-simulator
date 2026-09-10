import type { FieldRef, Notation, PresentationChallenge, VisualSpec, VizFilter } from '../types/content'
import { canonical } from './names'
import { info, item, makeGrade, type Grade, type GradeItem } from './grade'
import type { ResultSet } from './sqlite'
import { compareResults } from './resultCompare'
import { VISUAL_LABELS, AGG_LABELS } from './vizQuery'

function sameField(a: FieldRef | undefined, b: FieldRef | undefined): boolean {
  if (!a || !b) return false
  return canonical(a.column) === canonical(b.column) && canonical(a.table) === canonical(b.table)
}

function sameFilter(a: VizFilter, b: VizFilter): boolean {
  if (!sameField(a.field, b.field) || a.op !== b.op) return false
  const norm = (v: (string | number)[]) => [...v].map((x) => String(x).toLowerCase()).sort().join('|')
  return norm(a.values) === norm(b.values)
}

const fl = (f: FieldRef) => `${f.table}[${f.column}]`

export interface VizGradeInput {
  spec: VisualSpec
  data: ResultSet | null
  reference: ResultSet | null
  dims: number
}

export function gradeViz(inp: VizGradeInput, ch: PresentationChallenge, n: Notation): Grade {
  const { spec } = inp
  const ex = ch.expected
  const items: GradeItem[] = []

  // 1. Visual type
  const typeOk = ex.types.includes(spec.type)
  items.push(
    item(
      typeOk,
      20,
      typeOk
        ? `Visual type ${VISUAL_LABELS[spec.type]} is appropriate.`
        : `A ${VISUAL_LABELS[ex.types[0]]} would suit this question better than a ${VISUAL_LABELS[spec.type]}.`,
      0,
    ),
  )

  // 2. Fields: either exact match, or data equivalence with the reference query
  const dataEquivalent = !!(inp.data && inp.reference && compareResults(inp.data, inp.reference, !!ex.sort).ok)
  const fieldItems: GradeItem[] = []
  if (ex.axis) {
    const axes = Array.isArray(ex.axis) ? ex.axis : [ex.axis]
    const ok = axes.some((a) => sameField(a, spec.axis))
    fieldItems.push(item(ok, 12, ok ? `Axis field ${fl(axes[0])} correct.` : `Put ${fl(axes[0])} on the axis${spec.axis ? ` (you used ${fl(spec.axis)})` : ''}.`))
  }
  if (ex.legend) {
    const ok = sameField(ex.legend, spec.legend)
    fieldItems.push(item(ok, 8, ok ? `Legend field ${fl(ex.legend)} correct.` : `Use ${fl(ex.legend)} as the legend.`))
  } else if (spec.legend && spec.type !== 'pie' && spec.type !== 'donut') {
    fieldItems.push(item(false, 4, `No legend is needed for this question; you added ${fl(spec.legend)}.`))
  }
  for (const v of ex.values ?? []) {
    const aggs = Array.isArray(v.agg) ? v.agg : [v.agg]
    const hit = spec.values.find((sv) => sameField(sv.field, v.field))
    if (!hit) fieldItems.push(item(false, 12, `Add ${fl(v.field)} to the values.`))
    else {
      const aggOk = aggs.includes(hit.agg)
      fieldItems.push(item(aggOk, 12, aggOk ? `Value ${AGG_LABELS[hit.agg]} of ${v.field.column} correct.` : `${v.field.column} should be aggregated as ${aggs.map((a) => AGG_LABELS[a]).join(' or ')}, not ${AGG_LABELS[hit.agg]}.`, 6))
    }
  }
  for (const c of ex.columns ?? []) {
    const ok = (spec.columns ?? []).some((sc) => sameField(sc.field, c))
    fieldItems.push(item(ok, 8, ok ? `Column ${fl(c)} included.` : `Include column ${fl(c)}.`))
  }
  if (dataEquivalent && fieldItems.some((f) => !f.ok)) {
    // Award full field credit: the resulting data matches the reference.
    items.push(...fieldItems.map((f) => ({ ...f, ok: true, points: f.max, text: f.text + ' (accepted: your data matches the expected result)' })))
  } else {
    items.push(...fieldItems)
  }
  if (inp.reference) {
    items.push(
      dataEquivalent
        ? item(true, 10, 'Your visual shows the expected numbers.')
        : item(false, 10, inp.data ? 'The numbers in your visual differ from the expected result.' : 'Your visual has no data yet.'),
    )
  }

  // 3. Filters
  for (const f of ex.filters ?? []) {
    const ok = spec.filters.some((sf) => sameFilter(sf, f))
    items.push(item(ok, 12, ok ? `Filter on ${fl(f.field)} applied.` : `Add a filter on ${fl(f.field)} (${f.op} ${f.values.join(', ')}).`, 0))
  }
  const extraFilters = spec.filters.filter((sf) => !(ex.filters ?? []).some((f) => sameFilter(sf, f)) && sf.values.length)
  if (extraFilters.length) items.push(item(false, 4, `Remove filters not asked for: ${extraFilters.map((f) => fl(f.field)).join(', ')}.`))

  // 4. Sort
  if (ex.sort) {
    const s = spec.sort
    const ok = !!s && s.by === ex.sort.by && s.dir === ex.sort.dir
    items.push(item(ok, 8, ok ? 'Sorted as requested.' : `Sort by ${ex.sort.by === 'axis' ? 'the axis' : 'the value'} ${ex.sort.dir === 'asc' ? 'ascending' : 'descending'}.`))
  }

  // 5. Title
  if (ex.requireTitle) {
    const ok = !!spec.title?.trim()
    items.push(item(ok, 6, ok ? 'Title present.' : 'Give the visual a descriptive title.'))
  }

  // 6. Visualization principles
  const rows = inp.data?.rows.length ?? 0
  for (const p of n.viz.principles) {
    const c = p.check
    let fired = false
    switch (c.kind) {
      case 'maxPieSlices':
        fired = (spec.type === 'pie' || spec.type === 'donut') && rows > c.max
        break
      case 'requireTitle':
        fired = !spec.title?.trim()
        break
      case 'lineNeedsOrderedAxis':
        fired = spec.type === 'line' && !!spec.axis && !/date|month|year|week|day|time|period|quarter/i.test(spec.axis.column)
        break
      case 'maxSeries': {
        const series = spec.legend && inp.data ? new Set(inp.data.rows.map((r) => r[1])).size : 0
        fired = series > c.max
        break
      }
      case 'barNotForTime':
        fired = (spec.type === 'clusteredBar' || spec.type === 'clusteredColumn') && !!spec.axis && /month|year|week|date|quarter/i.test(spec.axis.column) && rows > 6
        break
      default:
        fired = false
    }
    if (fired) items.push(item(false, 4, `Principle: ${p.text}`))
  }
  if (!items.some((i) => i.text.startsWith('Principle:'))) items.push(info('No visualization-principle violations.'))

  return makeGrade(items, ch.points ?? 100)
}
