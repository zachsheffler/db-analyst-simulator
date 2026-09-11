import type { Notation, VisualSpec, VizTemplate } from '../types/content'
import type { ResultSet } from './sqlite'
import { compareResults } from './resultCompare'
import { VISUAL_LABELS } from './vizQuery'

export const VIZ_TOPIC_LABELS: Record<string, string> = {
  'single-value': 'Single number',
  compare: 'Compare categories',
  trend: 'Trend over time',
  'part-whole': 'Part of a whole',
  table: 'Tables',
  filter: 'Filtering',
  calc: 'Calculated fields',
  'two-dim': 'Two dimensions',
  sort: 'Sorting',
}

export interface VizSprintResult {
  ok: boolean
  reason: string
  dataOk: boolean
  typeOk: boolean
  titleOk: boolean
  principles: string[]
}

/** Sprint check: numbers match the reference, visual type acceptable, title if required, no principle violations. */
export function gradeVizSprint(spec: VisualSpec, data: ResultSet | null, expected: ResultSet, t: VizTemplate, n: Notation): VizSprintResult {
  const cmp = data ? compareResults(data, expected, !!t.orderMatters) : { ok: false, reason: 'Your visual has no data yet.' }
  const typeOk = t.types.includes(spec.type)
  const titleOk = !t.requireTitle || !!spec.title?.trim()
  const rows = data?.rows.length ?? 0
  const principles: string[] = []
  for (const p of n.viz.principles) {
    const c = p.check
    let fired = false
    switch (c.kind) {
      case 'maxPieSlices':
        fired = (spec.type === 'pie' || spec.type === 'donut') && rows > c.max
        break
      case 'lineNeedsOrderedAxis':
        fired = spec.type === 'line' && !!spec.axis && !/date|month|year|week|day|time|period|quarter/i.test(spec.axis.column)
        break
      case 'maxSeries': {
        const series = spec.legend && data ? new Set(data.rows.map((r) => r[1])).size : 0
        fired = series > c.max
        break
      }
      case 'barNotForTime':
        fired = (spec.type === 'clusteredBar' || spec.type === 'clusteredColumn') && !!spec.axis && /month|year|week|date|quarter/i.test(spec.axis.column) && rows > 6
        break
      default:
        fired = false
    }
    if (fired && typeOk) principles.push(p.text)
  }
  const problems: string[] = []
  if (!cmp.ok) problems.push(cmp.reason)
  if (!typeOk) problems.push(cmp.ok ? `Right numbers, but a ${VISUAL_LABELS[spec.type].toLowerCase()} is not the right visual for this question.` : `A ${VISUAL_LABELS[spec.type].toLowerCase()} is not the right visual for this question.`)
  if (!titleOk) problems.push('The question asks for a title.')
  for (const p of principles) problems.push(`Principle: ${p}`)
  const ok = cmp.ok && typeOk && titleOk && principles.length === 0
  return { ok, reason: ok ? 'Correct.' : problems.join(' '), dataOk: cmp.ok, typeOk, titleOk, principles }
}
