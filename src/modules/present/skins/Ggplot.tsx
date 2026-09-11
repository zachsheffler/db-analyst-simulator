import { useMemo, useState } from 'react'
import type { Aggregation, FieldRef, VisualType } from '../../../types/content'
import { fieldKey } from '../../../lib/vizQuery'
import { isCalc } from '../../../lib/calcFields'
import { CardVisual, TableVisual } from '../charts'
import type { Workbench } from '../workbench'
import { CalcEditor, FilterCard } from '../parts'
import { VisualBody } from './PowerBI'
import type { SkinProps } from './types'

const GEOMS: { type: VisualType; label: string }[] = [
  { type: 'clusteredColumn', label: 'geom_col()  — vertical bars' },
  { type: 'clusteredBar', label: 'geom_col() + coord_flip()  — horizontal bars' },
  { type: 'stackedColumn', label: 'geom_col(position = "stack")' },
  { type: 'line', label: 'geom_line() + geom_point()' },
  { type: 'pie', label: 'geom_col() + coord_polar()  — pie' },
  { type: 'donut', label: 'geom_col() + coord_polar() + xlim()  — donut' },
  { type: 'card', label: 'summarise() %>% pull()  — one number' },
  { type: 'table', label: 'knitr::kable()  — table' },
]
const R_FUN: Record<Aggregation, string> = { sum: 'sum', avg: 'mean', count: 'n', countDistinct: 'n_distinct', min: 'min', max: 'max', none: '' }

const rname = (s: string) => (/^[A-Za-z.][A-Za-z0-9._]*$/.test(s) ? s : `\`${s}\``)
const rstr = (s: string | number) => (typeof s === 'number' ? String(s) : `"${String(s).replace(/"/g, '\\"')}"`)

/** Generate a tidyverse script from the current spec. */
export function toRCode(wb: Workbench): string {
  const s = wb.spec
  const b = wb.built
  const t = s.type
  const out: string[] = ['library(tidyverse)', '']
  const dims: FieldRef[] = t === 'table' ? (s.columns ?? []).filter((c) => c.agg === 'none').map((c) => c.field) : [s.axis, ...(t === 'pie' || t === 'donut' ? [] : [s.legend])].filter((x): x is FieldRef => !!x)
  const measures = t === 'table' ? (s.columns ?? []).filter((c) => c.agg !== 'none') : t === 'card' ? s.values.slice(0, 1) : s.values
  const calcOf = (f: FieldRef) => (isCalc(f) ? (s.calcs ?? []).find((c) => c.name === f.column) : undefined)
  const label = (m: { field: FieldRef; agg: Aggregation }) => {
    const c = calcOf(m.field)
    return c?.aggregate ? c.name : `${R_FUN[m.agg] === 'n' ? 'n' : R_FUN[m.agg]}_${m.field.column}`
  }
  const first = b.tables[0] ?? wb.tables[0]?.name ?? 'data'
  const pipe: string[] = [rname(first)]
  for (const st of b.steps) pipe.push(`left_join(${rname(st.table)}, by = c(${st.by.map(([tc, vc]) => `${rstr(vc)} = ${rstr(tc)}`).join(', ')}))`)
  for (const f of s.filters) {
    const col = rname(f.field.column)
    if (f.op === 'in' && f.values.length) pipe.push(`filter(${col} %in% c(${f.values.map(rstr).join(', ')}))`)
    else if (f.op === 'between' && f.values.length === 2) pipe.push(`filter(between(${col}, ${f.values[0]}, ${f.values[1]}))`)
    else if (f.op === 'eq') pipe.push(`filter(${col} == ${rstr(f.values[0])})`)
    else if (f.op === 'gte') pipe.push(`filter(${col} >= ${rstr(f.values[0])})`)
    else if (f.op === 'lte') pipe.push(`filter(${col} <= ${rstr(f.values[0])})`)
  }
  const rowCalcs = (s.calcs ?? []).filter((c) => !c.aggregate && [...dims, ...measures.map((m) => m.field)].some((f) => isCalc(f) && f.column === c.name))
  if (rowCalcs.length) pipe.push(`mutate(${rowCalcs.map((c) => `${rname(c.name)} = ${c.expr}`).join(', ')})`)
  if (dims.length) pipe.push(`group_by(${dims.map((d) => rname(d.column)).join(', ')})`)
  if (measures.length) {
    const parts = measures.map((m) => {
      const c = calcOf(m.field)
      if (c?.aggregate) return `${rname(c.name)} = ${c.expr}`
      const fn = R_FUN[m.agg]
      return `${rname(label(m))} = ${fn === 'n' ? 'n()' : `${fn}(${rname(m.field.column)})`}`
    })
    pipe.push(`summarise(${parts.join(', ')}${dims.length ? ', .groups = "drop"' : ''})`)
  } else if (dims.length) pipe.push('distinct()')
  const sort = wb.sort
  const x = dims[0] ? rname(dims[0].column) : null
  const y = measures[0] ? rname(label(measures[0])) : null
  if (sort && x && t !== 'table' && t !== 'card') {
    if (sort.by === 'value' && y) pipe.push(`mutate(${x} = fct_reorder(${x}, ${y}, .desc = ${sort.dir === 'desc' ? 'TRUE' : 'FALSE'}))`)
    else pipe.push(`arrange(${sort.dir === 'desc' ? `desc(${x})` : x}) %>% mutate(${x} = fct_inorder(as.character(${x})))`)
  } else if (sort && x && t === 'table') pipe.push(`arrange(${sort.by === 'value' && y ? (sort.dir === 'desc' ? `desc(${y})` : y) : sort.dir === 'desc' ? `desc(${x})` : x})`)
  out.push(`df <- ${pipe.join(' %>%\n  ')}`)
  out.push('')
  if (t === 'card') {
    out.push(y ? `df %>% pull(${y})` : '# add a measure to summarise')
    return out.join('\n')
  }
  if (t === 'table') {
    out.push('knitr::kable(df)')
    return out.join('\n')
  }
  const fill = dims[1] ? rname(dims[1].column) : t === 'pie' || t === 'donut' ? x : null
  const aes = t === 'pie' || t === 'donut' ? `aes(x = ${t === 'donut' ? '2' : '""'}, y = ${y ?? 'value'}, fill = ${fill ?? 'NULL'})` : `aes(x = ${x ?? 'NULL'}, y = ${y ?? 'NULL'}${fill ? `, fill = ${fill}` : ''}${t === 'line' ? `, group = ${fill ?? '1'}${fill ? `, colour = ${fill}` : ''}` : ''})`
  const layers: string[] = [`ggplot(df, ${aes})`]
  switch (t) {
    case 'clusteredColumn':
      layers.push(fill ? 'geom_col(position = "dodge")' : 'geom_col(fill = "grey35")')
      break
    case 'clusteredBar':
      layers.push(fill ? 'geom_col(position = "dodge")' : 'geom_col(fill = "grey35")', 'coord_flip()')
      break
    case 'stackedColumn':
      layers.push('geom_col(position = "stack")')
      break
    case 'line':
      layers.push('geom_line()', 'geom_point()')
      break
    case 'pie':
      layers.push('geom_col(width = 1)', 'coord_polar(theta = "y")', 'theme_void()')
      break
    case 'donut':
      layers.push('geom_col(width = 1)', 'coord_polar(theta = "y")', 'xlim(c(0.5, 2.5))', 'theme_void()')
      break
  }
  if (s.title) layers.push(`labs(title = ${rstr(s.title)})`)
  if (t !== 'pie' && t !== 'donut') layers.push('theme_minimal()')
  out.push(layers.join(' +\n  '))
  return out.join('\n')
}

function highlight(code: string): React.ReactNode[] {
  return code.split('\n').map((line, i) => {
    const parts: React.ReactNode[] = []
    const re = /("[^"]*"|`[^`]*`|#.*$|\b(?:library|filter|mutate|group_by|summarise|left_join|ggplot|aes|geom_col|geom_line|geom_point|coord_flip|coord_polar|labs|theme_minimal|theme_void|xlim|arrange|distinct|pull|fct_reorder|fct_inorder|as\.character|desc|between|n|n_distinct|sum|mean|min|max|c)\b(?=\()|%>%|%in%|<-|\b(?:TRUE|FALSE|NULL)\b|\b\d+(?:\.\d+)?\b)/g
    let last = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(line))) {
      if (m.index > last) parts.push(line.slice(last, m.index))
      const tok = m[0]
      const cls = tok.startsWith('"') || tok.startsWith('`') ? 'str' : tok.startsWith('#') ? 'cmt' : /^(%>%|%in%|<-)$/.test(tok) ? 'op' : /^(TRUE|FALSE|NULL)$/.test(tok) ? 'kw' : /^\d/.test(tok) ? 'num' : 'fn'
      parts.push(
        <span key={`${i}-${m.index}`} className={`r-${cls}`}>
          {tok}
        </span>,
      )
      last = m.index + tok.length
    }
    if (last < line.length) parts.push(line.slice(last))
    return (
      <div key={i} className="r-line">
        <span className="r-ln">{i + 1}</span>
        <span>{parts}</span>
      </div>
    )
  })
}

export function GgplotSkin({ wb, docTitle, onCheck, checkLabel, banner }: SkinProps) {
  const [rightTab, setRightTab] = useState<'recipe' | 'env'>('recipe')
  const [mutate, setMutate] = useState(false)
  const [runs, setRuns] = useState<{ code: string; out: string }[]>([])
  const [envTable, setEnvTable] = useState<string | null>(null)
  const code = useMemo(() => toRCode(wb), [wb])
  const spec = wb.spec
  const t = spec.type
  const dims = wb.fields.filter((f) => !f.numeric).concat(wb.calcFields.filter((f) => !f.numeric))
  const meas = wb.fields.filter((f) => f.numeric).concat(wb.calcFields.filter((f) => f.numeric))
  const opt = (f: (typeof wb.fields)[number]) => (
    <option key={fieldKey(f.ref)} value={fieldKey(f.ref)}>
      {f.name}
      {isCalc(f.ref) ? ' (calc)' : ` · ${f.table}`}
    </option>
  )
  const byKey = (k: string) => [...wb.fields, ...wb.calcFields].find((f) => fieldKey(f.ref) === k)?.ref
  const run = () => {
    const rs = wb.data.rs
    let out: string
    if (wb.data.error) out = `Error: ${wb.data.error}`
    else if (!rs) out = 'Error: nothing to plot yet — add aesthetics in the recipe.'
    else if (t === 'card') out = `[1] ${rs.rows[0]?.[0] ?? 'NA'}`
    else out = `# A tibble: ${rs.rows.length} × ${rs.columns.length}\n${rs.columns.map((c) => c.padEnd(14)).join(' ')}\n${rs.rows.slice(0, 5).map((r) => r.map((v) => String(v ?? 'NA').slice(0, 13).padEnd(14)).join(' ')).join('\n')}${rs.rows.length > 5 ? `\n# ℹ ${rs.rows.length - 5} more rows` : ''}`
    setRuns((r) => [...r.slice(-4), { code, out }])
  }
  const measuresList = t === 'table' ? (spec.columns ?? []).filter((c) => c.agg !== 'none') : spec.values
  const dimsList = t === 'table' ? (spec.columns ?? []).filter((c) => c.agg === 'none').map((c) => c.field) : []

  return (
    <div className="rs viz-skin">
      <div className="rs-menubar">
        {['File', 'Edit', 'Code', 'View', 'Plots', 'Session', 'Build', 'Debug', 'Profile', 'Tools', 'Help'].map((m) => (
          <span key={m}>{m}</span>
        ))}
        <span className="doc">{docTitle} — ArrStudio</span>
      </div>
      {banner}
      <div className="rs-grid">
        <div className="rs-pane rs-source">
          <div className="rs-tabs">
            <span className="active">📄 viz.R</span>
            <span className="grow" />
            <button className="small" onClick={run} title="Ctrl+Shift+Enter">
              ▶ Run
            </button>
            <button className="small check" onClick={onCheck} disabled={!wb.ready} title="Ctrl+Enter">
              ✓ {checkLabel}
            </button>
          </div>
          <div className="rs-code">{highlight(code)}</div>
        </div>
        <div className="rs-pane rs-right">
          <div className="rs-tabs">
            <span className={rightTab === 'recipe' ? 'active' : ''} onClick={() => setRightTab('recipe')}>
              Recipe
            </span>
            <span className={rightTab === 'env' ? 'active' : ''} onClick={() => setRightTab('env')}>
              Environment
            </span>
            <span>History</span>
          </div>
          {rightTab === 'env' ? (
            <div className="rs-env">
              <div className="muted" style={{ padding: '4px 8px', fontSize: 11 }}>
                Global Environment · {wb.dbDef.name}
              </div>
              {wb.tables.map((tb) => (
                <div key={tb.name} className={`rs-envrow ${envTable === tb.name ? 'active' : ''}`} onClick={() => setEnvTable((e) => (e === tb.name ? null : tb.name))}>
                  <span className="rs-envname">{tb.name}</span>
                  <span className="muted">
                    {wb.queryTable(tb.name, 100000)?.rows.length ?? '?'} obs. of {tb.columns.length} variables
                  </span>
                </div>
              ))}
              {envTable && (
                <div className="rs-envdetail">
                  {wb.fields
                    .filter((f) => f.table === envTable)
                    .map((f) => (
                      <div key={f.name}>
                        <span className="muted">$</span> {f.name} <span className="muted">{f.numeric ? '<dbl>' : f.date ? '<date>' : '<chr>'}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rs-recipe">
              <div className="rs-step">
                <label>
                  <code>geom</code>
                  <select value={t} onChange={(e) => wb.setType(e.target.value as VisualType)}>
                    {GEOMS.map((g) => (
                      <option key={g.type} value={g.type}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {t !== 'card' && t !== 'table' && (
                <div className="rs-step">
                  <label>
                    <code>aes(x = </code>
                    <select value={spec.axis ? fieldKey(spec.axis) : ''} onChange={(e) => wb.update((s) => ({ ...s, axis: e.target.value ? byKey(e.target.value) : undefined }))}>
                      <option value="">— choose a dimension —</option>
                      {dims.map(opt)}
                    </select>
                    <code>)</code>
                  </label>
                  {t !== 'pie' && t !== 'donut' && (
                    <label>
                      <code>{t === 'line' ? 'colour = ' : 'fill = '}</code>
                      <select value={spec.legend ? fieldKey(spec.legend) : ''} onChange={(e) => wb.update((s) => ({ ...s, legend: e.target.value ? byKey(e.target.value) : undefined }))}>
                        <option value="">— none —</option>
                        {dims.map(opt)}
                      </select>
                    </label>
                  )}
                </div>
              )}
              {t === 'table' && (
                <div className="rs-step">
                  <div className="muted">columns (dimensions)</div>
                  {dimsList.map((f) => (
                    <div key={fieldKey(f)} className="rs-item">
                      <code>{f.column}</code>
                      <span className="x" onClick={() => wb.removeField(f)}>
                        ✕
                      </span>
                    </div>
                  ))}
                  <select value="" onChange={(e) => e.target.value && wb.update((s) => ({ ...s, columns: [...(s.columns ?? []), { field: byKey(e.target.value)!, agg: 'none' }] }))}>
                    <option value="">+ add a column…</option>
                    {dims.filter((d) => !wb.isUsed(d.ref)).map(opt)}
                  </select>
                </div>
              )}
              <div className="rs-step">
                <div className="muted">{t === 'card' ? 'summarise() — the one number' : 'summarise() — y values'}</div>
                {measuresList.map((m) => {
                  const c = wb.info(m.field)?.calc
                  return (
                    <div key={fieldKey(m.field)} className="rs-item">
                      {c?.aggregate ? (
                        <code>
                          {c.name} = {c.expr}
                        </code>
                      ) : (
                        <>
                          <select value={m.agg} onChange={(e) => wb.setAgg(m.field, e.target.value as Aggregation)}>
                            {(['sum', 'avg', 'count', 'countDistinct', 'min', 'max'] as Aggregation[]).map((a) => (
                              <option key={a} value={a}>
                                {R_FUN[a]}()
                              </option>
                            ))}
                          </select>
                          <code>{m.field.column}</code>
                        </>
                      )}
                      <span className="x" onClick={() => wb.removeField(m.field)}>
                        ✕
                      </span>
                    </div>
                  )
                })}
                <select value="" onChange={(e) => e.target.value && wb.addField(byKey(e.target.value)!, t === 'table' ? 'columns' : 'values')}>
                  <option value="">+ add a measure…</option>
                  {meas.filter((m) => !wb.isUsed(m.ref)).map(opt)}
                </select>
              </div>
              <div className="rs-step">
                <div className="muted">filter()</div>
                {spec.filters.map((f, i) => (
                  <FilterCard key={fieldKey(f.field)} wb={wb} filter={f} onChange={(nf) => wb.setFilter(i, nf)} onRemove={() => wb.removeFilter(i)} />
                ))}
                <select value="" onChange={(e) => e.target.value && wb.addFilter(byKey(e.target.value)!)}>
                  <option value="">+ filter on…</option>
                  {wb.fields.map(opt)}
                </select>
              </div>
              <div className="rs-step">
                <div className="muted">mutate() / summarise() — new variables</div>
                {(spec.calcs ?? []).map((c) => (
                  <div key={c.name} className="rs-item">
                    <code>
                      {c.name} = {c.expr}
                    </code>
                    <span className="x" onClick={() => wb.removeCalc(c.name)}>
                      ✕
                    </span>
                  </div>
                ))}
                {mutate ? <CalcEditor wb={wb} variant="gg" onClose={() => setMutate(false)} /> : <button className="small" onClick={() => setMutate(true)}>+ mutate()</button>}
              </div>
              {t !== 'card' && (
                <div className="rs-step">
                  <label>
                    <code>order</code>
                    <select
                      value={wb.sort ? `${wb.sort.by}-${wb.sort.dir}` : ''}
                      onChange={(e) => {
                        const [by, dir] = e.target.value.split('-') as ['axis' | 'value', 'asc' | 'desc']
                        wb.setSort({ by, dir })
                      }}
                    >
                      <option value="axis-asc">arrange(x)</option>
                      <option value="axis-desc">arrange(desc(x))</option>
                      <option value="value-desc">fct_reorder(x, y, .desc = TRUE)</option>
                      <option value="value-asc">fct_reorder(x, y)</option>
                    </select>
                  </label>
                </div>
              )}
              <div className="rs-step">
                <label>
                  <code>labs(title = </code>
                  <input type="text" value={spec.title ?? ''} placeholder='"…"' onChange={(e) => wb.setTitle(e.target.value)} />
                  <code>)</code>
                </label>
              </div>
              <button className="small ghost" onClick={wb.clear}>
                rm(df) — start over
              </button>
            </div>
          )}
        </div>
        <div className="rs-pane rs-console">
          <div className="rs-tabs">
            <span className="active">Console</span>
            <span>Terminal</span>
            <span>Background Jobs</span>
          </div>
          <div className="rs-console-body">
            <div className="muted">R version 4.4.1 (pastiche) — "Shake and Throw"</div>
            {runs.map((r, i) => (
              <div key={i}>
                <div className="r-prompt">&gt; source("viz.R")</div>
                <pre>{r.out}</pre>
              </div>
            ))}
            {!runs.length && <div className="r-prompt">&gt; </div>}
          </div>
        </div>
        <div className="rs-pane rs-plots">
          <div className="rs-tabs">
            <span>Files</span>
            <span className={t === 'table' ? '' : 'active'}>Plots</span>
            <span>Packages</span>
            <span>Help</span>
            <span className={t === 'table' ? 'active' : ''}>Viewer</span>
            <span className="grow" />
            <span className="muted">🔍 Zoom · Export ▾</span>
          </div>
          <div className={`rs-plot gg-plot ${(wb.chart?.series.length ?? 1) <= 1 && !spec.legend ? 'gg-single' : ''}`}>
            {wb.data.error && <div className="pbi-placeholder">{wb.data.error}</div>}
            {!wb.data.error && !wb.data.rs && <div className="pbi-placeholder">Plots will appear here. Fill in the recipe on the right.</div>}
            {wb.data.rs && t === 'card' && <CardVisual rs={wb.data.rs} />}
            {wb.data.rs && t === 'table' && <TableVisual rs={wb.data.rs} />}
            {wb.data.rs && t !== 'card' && t !== 'table' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {spec.title && <div className="gg-title">{spec.title}</div>}
                <div style={{ flex: 1, minHeight: 0 }}>
                  <VisualBody wb={wb} panel />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
