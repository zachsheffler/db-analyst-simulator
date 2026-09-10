import { useEffect, useMemo, useRef, useState } from 'react'
import { useContent } from '../../content'
import type { Aggregation, Company, FieldRef, PresentationChallenge, VisualSpec, VisualType, VizFilter } from '../../types/content'
import { DB, type ResultSet, type TableInfo } from '../../lib/sqlite'
import { AGG_LABELS, VISUAL_LABELS, buildSql, defaultSort, emptySpec, fieldKey, isNumericType, wellsFor } from '../../lib/vizQuery'
import { gradeViz } from '../../lib/vizGrade'
import type { Grade } from '../../lib/grade'
import { GradeReport, Stars } from '../../components/GradeReport'
import { loadProgress, updateProgress } from '../../lib/score'
import { notifyProgress } from '../../App'
import { BarChart, CardVisual, LineChart, Legend, PieChart, PieLegend, TableVisual, toChartData } from './charts'
import { Slot } from '../../components/Slots'
import { ControlBar, mmss, useStopwatch } from '../../components/Controls'

const VISUAL_ICONS: [VisualType, string][] = [
  ['clusteredColumn', '📊'],
  ['clusteredBar', '📶'],
  ['stackedColumn', '🏗'],
  ['line', '📈'],
  ['pie', '🥧'],
  ['donut', '🍩'],
  ['card', '🔢'],
  ['table', '▦'],
]

export function PresentModule({ company }: { company: Company }) {
  const content = useContent()
  const [challenge, setChallenge] = useState<PresentationChallenge | null>(null)
  const challenges = content.presentation.filter((c) => c.company === company.id)
  if (!challenge) {
    const progress = loadProgress()
    return (
      <div className="page">
        <h1>Viz · {company.name}</h1>
        <p className="muted">Each job asks a business question. Build the visual that answers it in the report canvas, then check it. Chart choice, fields, aggregation, filters, and sorting all count.</p>
        <div className="grid-2">
          {challenges.map((c) => {
            const s = progress.present[c.id]
            return (
              <div key={c.id} className="card clickable" onClick={() => setChallenge(c)}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h2 style={{ margin: 0 }}>{c.title}</h2>
                  <span className="badge">{'●'.repeat(c.difficulty)}{'○'.repeat(5 - c.difficulty)}</span>
                </div>
                <p className="muted" style={{ fontSize: 13 }}>
                  {c.brief.slice(0, 140)}…
                </p>
                <div>{s ? <Stars pct={(100 * s.score) / s.max} /> : <span className="muted">not attempted</span>}</div>
              </div>
            )
          })}
          {challenges.length === 0 && <div className="muted">No viz jobs for this employer yet.</div>}
        </div>
        <Slot name="help">
          <div className="help-block">
            <h3>{company.name}</h3>
            <p>{company.description}</p>
            <h3>How viz jobs work</h3>
            <p>
              The workbench imitates Power BI: pick a visual type, drag or tick fields into the wells, add filters, sort, and give the visual a title. Tables are
              joined automatically along their foreign keys (see the model view on the left rail).
            </p>
            <details>
              <summary>Visualization principles</summary>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>
                {content.notation.viz.principles.map((p) => (
                  <li key={p.id}>{p.text}</li>
                ))}
              </ul>
            </details>
          </div>
        </Slot>
      </div>
    )
  }
  return <Workbench challenge={challenge} company={company} onBack={() => setChallenge(null)} />
}

type DragPayload = { field: FieldRef; numeric: boolean }

function Workbench({ challenge, company, onBack }: { challenge: PresentationChallenge; company: Company; onBack: () => void }) {
  const content = useContent()
  const dbDef = content.databases.get(challenge.database)!
  const dbRef = useRef<DB | null>(null)
  const [tables, setTables] = useState<TableInfo[]>([])
  const [spec, setSpec] = useState<VisualSpec>(emptySpec())
  const [view, setView] = useState<'report' | 'data' | 'model'>('report')
  const [dataTable, setDataTable] = useState<string | null>(null)
  const [grade, setGrade] = useState<Grade | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [search, setSearch] = useState('')
  const [, bump] = useState(0)
  const [paused, setPaused] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ Filters: true })
  const elapsed = useStopwatch(!paused, challenge.id)

  useEffect(() => {
    let alive = true
    DB.create([...dbDef.ddl, ...dbDef.seed]).then((db) => {
      if (!alive) return db.close()
      dbRef.current = db
      setTables(db.describe())
      bump((x) => x + 1)
    })
    return () => {
      alive = false
      dbRef.current?.close()
      dbRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge.id])

  const built = useMemo(() => buildSql(spec, tables), [spec, tables])
  const data: { rs: ResultSet | null; error: string | null } = useMemo(() => {
    const db = dbRef.current
    if (!db || !built.sql) return { rs: null, error: built.error ?? null }
    try {
      return { rs: db.query(built.sql, 2000), error: null }
    } catch (e) {
      return { rs: null, error: (e as Error).message }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built, tables])

  const numeric = (f: FieldRef) => {
    const t = tables.find((x) => x.name === f.table)
    const c = t?.columns.find((x) => x.name === f.column)
    return !!c && isNumericType(c.type) && c.pk === 0 && !t!.fks.some((fk) => fk.from.includes(c.name))
  }
  const wells = wellsFor(spec.type)

  /** Add a field to the most sensible well (Power BI's click-to-add behavior). */
  const addField = (f: FieldRef, well?: 'axis' | 'legend' | 'values' | 'columns') => {
    setGrade(null)
    setSpec((s) => {
      const isNum = numeric(f)
      const defaultAgg: Aggregation = isNum ? 'sum' : 'count'
      const target = well ?? (wells.columns ? 'columns' : isNum && wells.values ? 'values' : !s.axis && wells.axis ? 'axis' : wells.legend && !s.legend && s.axis ? 'legend' : 'values')
      if (target === 'columns') {
        if ((s.columns ?? []).some((c) => fieldKey(c.field) === fieldKey(f))) return s
        return { ...s, columns: [...(s.columns ?? []), { field: f, agg: isNum ? 'sum' : 'none' }] }
      }
      if (target === 'axis') return { ...s, axis: f }
      if (target === 'legend') return { ...s, legend: f }
      if (s.values.some((v) => fieldKey(v.field) === fieldKey(f))) return s
      const values = s.type === 'card' ? [{ field: f, agg: defaultAgg }] : [...s.values, { field: f, agg: defaultAgg }]
      return { ...s, values }
    })
  }

  const setType = (type: VisualType) => {
    setGrade(null)
    setSpec((s) => {
      const w = wellsFor(type)
      const next: VisualSpec = { ...s, type, sort: undefined }
      if (w.columns) {
        // moving to table: flatten fields into columns
        const cols = [...(s.columns ?? [])]
        const push = (f: FieldRef, agg: Aggregation) => !cols.some((c) => fieldKey(c.field) === fieldKey(f)) && cols.push({ field: f, agg })
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
  }

  const addFilter = (f: FieldRef) => {
    setGrade(null)
    setSpec((s) => {
      if (s.filters.some((x) => fieldKey(x.field) === fieldKey(f))) return s
      const filt: VizFilter = numeric(f) ? { field: f, op: 'between', values: [] } : { field: f, op: 'in', values: [] }
      return { ...s, filters: [...s.filters, filt] }
    })
  }

  const check = () => {
    const db = dbRef.current
    if (!db) return
    let reference: ResultSet | null = null
    if (challenge.referenceSql) {
      try {
        reference = db.query(challenge.referenceSql)
      } catch (e) {
        console.error('referenceSql failed', e)
      }
    }
    // grade the effective sort (Power BI applies a default sort even when the user never opened the menu)
    const effective: VisualSpec = { ...spec, sort: spec.sort ?? defaultSort(spec) }
    const g = gradeViz({ spec: effective, data: data.rs, reference, dims: built.dims }, challenge, content.notation)
    setGrade(g)
    updateProgress((p) => {
      const prev = p.present[challenge.id]
      if (!prev || g.score > prev.score) p.present[challenge.id] = { score: g.score, max: g.max }
    })
    notifyProgress()
  }

  const onDrop = (e: React.DragEvent, well: 'axis' | 'legend' | 'values' | 'columns' | 'filter') => {
    e.preventDefault()
    try {
      const p = JSON.parse(e.dataTransfer.getData('text/plain')) as DragPayload
      if (well === 'filter') addFilter(p.field)
      else addField(p.field, well)
    } catch {
      /* ignore */
    }
    ;(e.currentTarget as HTMLElement).classList.remove('over')
  }
  const dropProps = (well: 'axis' | 'legend' | 'values' | 'columns' | 'filter') => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).classList.add('over')
    },
    onDragLeave: (e: React.DragEvent) => (e.currentTarget as HTMLElement).classList.remove('over'),
    onDrop: (e: React.DragEvent) => onDrop(e, well),
  })

  const chip = (label: string, onRemove: () => void, extra?: React.ReactNode) => (
    <div className="chip" key={label}>
      {extra ?? <span style={{ flex: 1 }}>{label}</span>}
      <span className="x" onClick={onRemove} title="Remove">
        ✕
      </span>
    </div>
  )
  const aggSelect = (agg: Aggregation, field: FieldRef, onChange: (a: Aggregation) => void, allowNone: boolean) => (
    <select value={agg} onChange={(e) => onChange(e.target.value as Aggregation)} title="Aggregation">
      {(Object.keys(AGG_LABELS) as Aggregation[])
        .filter((a) => allowNone || a !== 'none')
        .map((a) => (
          <option key={a} value={a}>
            {a === 'none' ? field.column : `${AGG_LABELS[a]} of ${field.column}`}
          </option>
        ))}
    </select>
  )

  const chart = data.rs ? toChartData(data.rs, built.dims) : null
  const sort = spec.sort ?? defaultSort(spec)

  return (
    <div className="pbi">
      <div className="pbi-ribbon">
        <div className="tabs">
          <span>File</span>
          <span className="active">Home</span>
          <span>Insert</span>
          <span>Modeling</span>
          <span>View</span>
          <span>Help</span>
          <span style={{ marginLeft: 'auto', color: '#605e5c' }}>
            {challenge.title} — DB Analyst Simulator
          </span>
        </div>
        <div className="groups">
          <div className="group">
            <div className="icons">
              <div className="icon">📋</div>
              <div className="icon">✂</div>
            </div>
            Clipboard
          </div>
          <div className="group">
            <div className="icons">
              <div className="icon" title={dbDef.name}>
                🗄
              </div>
              <div className="icon">📥</div>
            </div>
            Data
          </div>
          <div className="group">
            <div className="icons">
              <div className="icon">🔄</div>
            </div>
            Queries
          </div>
          <div className="group" style={{ borderRight: 0 }}>
            <div className="icons">
              <button className="icon" style={{ width: 'auto', padding: '0 10px', background: '#f2c811', border: 0, fontWeight: 600 }} onClick={check} disabled={!tables.length}>
                ✓ Check visual
              </button>
            </div>
            Simulator
          </div>
        </div>
      </div>
      <div className="pbi-body">
        <div className="pbi-rail">
          <button className={view === 'report' ? 'active' : ''} title="Report view" onClick={() => setView('report')}>
            📄
          </button>
          <button className={view === 'data' ? 'active' : ''} title="Data view" onClick={() => setView('data')}>
            ▦
          </button>
          <button className={view === 'model' ? 'active' : ''} title="Model view" onClick={() => setView('model')}>
            🔗
          </button>
        </div>
        <div className="pbi-canvas-wrap">
          {view === 'report' && (
            <div className="pbi-page">
              <div className="pbi-visual selected">
                <div className="vheader">
                  <button title="Sort options" onClick={() => setGrade(null)}>
                    <select
                      value={sort ? `${sort.by}-${sort.dir}` : ''}
                      onChange={(e) => {
                        const [by, dir] = e.target.value.split('-') as ['axis' | 'value', 'asc' | 'desc']
                        setSpec((s) => ({ ...s, sort: { by, dir } }))
                      }}
                      style={{ fontSize: 11 }}
                    >
                      <option value="axis-asc">Sort axis ascending</option>
                      <option value="axis-desc">Sort axis descending</option>
                      <option value="value-asc">Sort value ascending</option>
                      <option value="value-desc">Sort value descending</option>
                    </select>
                  </button>
                  <button title="Focus mode">⤢</button>
                  <button title="More options">…</button>
                </div>
                <div className="vtitle" onClick={() => setEditingTitle(true)} title="Click to edit title">
                  {editingTitle ? (
                    <input
                      type="text"
                      autoFocus
                      value={spec.title ?? ''}
                      placeholder="Title"
                      style={{ width: '60%' }}
                      onChange={(e) => setSpec((s) => ({ ...s, title: e.target.value }))}
                      onBlur={() => setEditingTitle(false)}
                      onKeyDown={(e) => e.key === 'Enter' && setEditingTitle(false)}
                    />
                  ) : (
                    spec.title || <span style={{ color: '#a19f9d', fontWeight: 400 }}>Click to add a title</span>
                  )}
                </div>
                <div className="vbody">
                  {data.error && <div className="pbi-placeholder">{data.error}</div>}
                  {!data.error && (!data.rs || !chart) && <div className="pbi-placeholder">Drag or tick fields in the Fields pane to build a {VISUAL_LABELS[spec.type].toLowerCase()}.</div>}
                  {data.rs && chart && spec.type === 'card' && <CardVisual rs={data.rs} />}
                  {data.rs && chart && spec.type === 'table' && <TableVisual rs={data.rs} />}
                  {data.rs && chart && (spec.type === 'pie' || spec.type === 'donut') && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                      <PieLegend data={chart} />
                      <div style={{ flex: 1, minHeight: 0 }}>
                        <PieChart data={chart} donut={spec.type === 'donut'} />
                      </div>
                    </div>
                  )}
                  {data.rs && chart && (spec.type === 'clusteredColumn' || spec.type === 'clusteredBar' || spec.type === 'stackedColumn') && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                      <Legend data={chart} />
                      <div style={{ flex: 1, minHeight: 0 }}>
                        <BarChart data={chart} type={spec.type} />
                      </div>
                    </div>
                  )}
                  {data.rs && chart && spec.type === 'line' && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                      <Legend data={chart} />
                      <div style={{ flex: 1, minHeight: 0 }}>
                        <LineChart data={chart} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {view === 'data' && (
            <div className="pbi-page" style={{ aspectRatio: 'auto', minHeight: 300, overflow: 'auto' }}>
              <div className="row" style={{ marginBottom: 8 }}>
                <select value={dataTable ?? tables[0]?.name ?? ''} onChange={(e) => setDataTable(e.target.value)}>
                  {tables.map((t) => (
                    <option key={t.name}>{t.name}</option>
                  ))}
                </select>
                <span className="muted">first 100 rows</span>
              </div>
              {dbRef.current && tables.length > 0 && (
                <TableVisual rs={dbRef.current.query(`SELECT * FROM "${(dataTable ?? tables[0].name).replace(/"/g, '""')}"`, 100)} />
              )}
            </div>
          )}
          {view === 'model' && (
            <div className="pbi-page" style={{ aspectRatio: 'auto', minHeight: 420 }}>
              <ModelView tables={tables} />
            </div>
          )}
          {built.sql && (
            <details className="pbi-task" style={{ fontSize: 12 }}>
              <summary style={{ cursor: 'pointer' }}>SQL behind this visual</summary>
              <pre style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{built.sql}</pre>
            </details>
          )}
        </div>
        <div className="pbi-panes">
          <div className={`pbi-pane ${collapsed.Filters ? 'collapsed' : ''}`}>
            <div className="pane-title" onClick={() => setCollapsed((c) => ({ ...c, Filters: !c.Filters }))}>
              <span className="chev">{collapsed.Filters ? '›' : '‹'}</span>
              <span className="pane-title-text">Filters</span>
            </div>
            <div className="pane-body">
              <div className="well">
                <div className="well-label">Filters on this visual</div>
                {spec.filters.map((f, i) => (
                  <FilterCard
                    key={fieldKey(f.field)}
                    filter={f}
                    db={dbRef.current}
                    onChange={(nf) => {
                      setGrade(null)
                      setSpec((s) => ({ ...s, filters: s.filters.map((x, j) => (j === i ? nf : x)) }))
                    }}
                    onRemove={() => {
                      setGrade(null)
                      setSpec((s) => ({ ...s, filters: s.filters.filter((_, j) => j !== i) }))
                    }}
                  />
                ))}
                <div className="well-box" {...dropProps('filter')}>
                  <div className="empty">Add data fields here</div>
                </div>
              </div>
            </div>
          </div>
          <div className={`pbi-pane ${collapsed.Visualizations ? 'collapsed' : ''}`}>
            <div className="pane-title" onClick={() => setCollapsed((c) => ({ ...c, Visualizations: !c.Visualizations }))}>
              <span className="chev">{collapsed.Visualizations ? '›' : '‹'}</span>
              <span className="pane-title-text">Visualizations</span>
            </div>
            <div className="pane-body">
              <div className="viz-grid">
                {VISUAL_ICONS.map(([t, icon]) => (
                  <button key={t} className={spec.type === t ? 'active' : ''} title={VISUAL_LABELS[t]} onClick={() => setType(t)}>
                    {icon}
                  </button>
                ))}
              </div>
              <div className="muted" style={{ marginBottom: 6 }}>
                {VISUAL_LABELS[spec.type]}
              </div>
              {wells.axis && (
                <div className="well">
                  <div className="well-label">{wells.axis}</div>
                  <div className="well-box" {...dropProps('axis')}>
                    {spec.axis ? chip(spec.axis.column, () => setSpec((s) => ({ ...s, axis: undefined }))) : <div className="empty">Add data fields here</div>}
                  </div>
                </div>
              )}
              {wells.legend && (
                <div className="well">
                  <div className="well-label">{wells.legend}</div>
                  <div className="well-box" {...dropProps('legend')}>
                    {spec.legend ? chip(spec.legend.column, () => setSpec((s) => ({ ...s, legend: undefined }))) : <div className="empty">Add data fields here</div>}
                  </div>
                </div>
              )}
              {wells.values && (
                <div className="well">
                  <div className="well-label">{wells.values}</div>
                  <div className="well-box" {...dropProps('values')}>
                    {spec.values.length === 0 && <div className="empty">Add data fields here</div>}
                    {spec.values.map((v, i) =>
                      chip(
                        fieldKey(v.field),
                        () => setSpec((s) => ({ ...s, values: s.values.filter((_, j) => j !== i) })),
                        aggSelect(v.agg, v.field, (a) => setSpec((s) => ({ ...s, values: s.values.map((x, j) => (j === i ? { ...x, agg: a } : x)) })), false),
                      ),
                    )}
                  </div>
                </div>
              )}
              {wells.columns && (
                <div className="well">
                  <div className="well-label">{wells.columns}</div>
                  <div className="well-box" {...dropProps('columns')}>
                    {(spec.columns ?? []).length === 0 && <div className="empty">Add data fields here</div>}
                    {(spec.columns ?? []).map((v, i) =>
                      chip(
                        fieldKey(v.field),
                        () => setSpec((s) => ({ ...s, columns: (s.columns ?? []).filter((_, j) => j !== i) })),
                        aggSelect(v.agg, v.field, (a) => setSpec((s) => ({ ...s, columns: (s.columns ?? []).map((x, j) => (j === i ? { ...x, agg: a } : x)) })), true),
                      ),
                    )}
                  </div>
                </div>
              )}
              <button className="small" style={{ marginTop: 6 }} onClick={() => setSpec(emptySpec(spec.type))}>
                Clear all fields
              </button>
            </div>
          </div>
          <div className={`pbi-pane fields-pane ${collapsed.Fields ? 'collapsed' : ''}`}>
            <div className="pane-title" onClick={() => setCollapsed((c) => ({ ...c, Fields: !c.Fields }))}>
              <span className="chev">{collapsed.Fields ? '›' : '‹'}</span>
              <span className="pane-title-text">Fields</span>
            </div>
            <div className="pane-body">
              <input className="pbi-search" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
              {tables.map((t) => (
                <details key={t.name} open>
                  <summary>▤ {t.name}</summary>
                  {t.columns
                    .filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()))
                    .map((c) => {
                      const f: FieldRef = { table: t.name, column: c.name }
                      const isNum = numeric(f)
                      const used =
                        fieldKey(f) === (spec.axis && fieldKey(spec.axis)) ||
                        fieldKey(f) === (spec.legend && fieldKey(spec.legend)) ||
                        spec.values.some((v) => fieldKey(v.field) === fieldKey(f)) ||
                        (spec.columns ?? []).some((v) => fieldKey(v.field) === fieldKey(f))
                      return (
                        <div
                          key={c.name}
                          className="field"
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData('text/plain', JSON.stringify({ field: f, numeric: isNum } satisfies DragPayload))}
                        >
                          <input
                            type="checkbox"
                            checked={used}
                            onChange={(e) => {
                              if (e.target.checked) addField(f)
                              else {
                                setGrade(null)
                                setSpec((s) => ({
                                  ...s,
                                  axis: s.axis && fieldKey(s.axis) === fieldKey(f) ? undefined : s.axis,
                                  legend: s.legend && fieldKey(s.legend) === fieldKey(f) ? undefined : s.legend,
                                  values: s.values.filter((v) => fieldKey(v.field) !== fieldKey(f)),
                                  columns: (s.columns ?? []).filter((v) => fieldKey(v.field) !== fieldKey(f)),
                                }))
                              }
                            }}
                          />
                          <span className="sigma">{isNum ? 'Σ' : c.pk ? '🔑' : ''}</span>
                          <span>{c.name}</span>
                        </div>
                      )
                    })}
                </details>
              ))}
            </div>
          </div>
        </div>
      </div>
      <Slot name="help">
        <div className="help-block">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>Request from {company.contact ?? company.name}</b>
            <span className="badge">{'●'.repeat(challenge.difficulty)}{'○'.repeat(5 - challenge.difficulty)}</span>
          </div>
          <div className="brief" style={{ marginTop: 4 }}>
            {challenge.brief}
          </div>
          {challenge.hints?.length ? (
            <details style={{ marginTop: 6, fontSize: 12 }}>
              <summary style={{ cursor: 'pointer' }}>Hints</summary>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {challenge.hints.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <details style={{ marginTop: 6, fontSize: 12 }}>
            <summary style={{ cursor: 'pointer' }}>Visualization principles</summary>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {content.notation.viz.principles.map((p) => (
                <li key={p.id}>{p.text}</li>
              ))}
            </ul>
          </details>
          {grade && (
            <div style={{ marginTop: 10 }}>
              <GradeReport grade={grade} title="Visual check" />
            </div>
          )}
        </div>
      </Slot>
      <Slot name="controls">
        <ControlBar clock={mmss(elapsed)} clockLabel={paused ? 'paused' : 'elapsed on this job'} stats={[{ label: 'Best', value: loadProgress().present[challenge.id]?.score ?? '—' }, { label: 'Last check', value: grade ? grade.score : '—' }]}>
          <button className="primary" onClick={check} disabled={!tables.length}>
            ✓ Check visual
          </button>
          <button onClick={() => setPaused((p) => !p)}>{paused ? 'Resume' : 'Pause'}</button>
          <button className="ghost" onClick={onBack}>
            ■ Leave job
          </button>
        </ControlBar>
      </Slot>
    </div>
  )
}

function FilterCard({ filter, db, onChange, onRemove }: { filter: VizFilter; db: DB | null; onChange: (f: VizFilter) => void; onRemove: () => void }) {
  const values = useMemo(() => {
    if (!db) return [] as (string | number)[]
    try {
      const rs = db.query(`SELECT DISTINCT "${filter.field.column}" FROM "${filter.field.table}" ORDER BY 1`, 60)
      return rs.rows.map((r) => r[0]).filter((v): v is string | number => v !== null)
    } catch {
      return []
    }
  }, [db, filter.field.column, filter.field.table])
  const isRange = filter.op === 'between'
  return (
    <div className="filter-card">
      <div className="fhead">
        <span>{filter.field.column}</span>
        <span className="x" onClick={onRemove}>
          ✕
        </span>
      </div>
      <div className="muted" style={{ marginBottom: 4 }}>
        {filter.op === 'in' ? (filter.values.length ? `is ${filter.values.slice(0, 3).join(', ')}${filter.values.length > 3 ? '…' : ''}` : 'is (All)') : filter.values.length === 2 ? `between ${filter.values[0]} and ${filter.values[1]}` : 'is (All)'}
      </div>
      {isRange ? (
        <div className="row" style={{ gap: 4 }}>
          <input
            type="number"
            placeholder="min"
            style={{ width: 70 }}
            value={filter.values[0] ?? ''}
            onChange={(e) => onChange({ ...filter, values: [Number(e.target.value), filter.values[1] ?? Number(e.target.value)] })}
          />
          <span>–</span>
          <input
            type="number"
            placeholder="max"
            style={{ width: 70 }}
            value={filter.values[1] ?? ''}
            onChange={(e) => onChange({ ...filter, values: [filter.values[0] ?? Number(e.target.value), Number(e.target.value)] })}
          />
        </div>
      ) : (
        <div className="vals">
          <label>
            <input type="checkbox" checked={filter.values.length === 0} onChange={() => onChange({ ...filter, values: [] })} /> Select all
          </label>
          {values.map((v) => (
            <label key={String(v)}>
              <input
                type="checkbox"
                checked={filter.values.includes(v)}
                onChange={(e) => onChange({ ...filter, values: e.target.checked ? [...filter.values, v] : filter.values.filter((x) => x !== v) })}
              />{' '}
              {String(v)}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function ModelView({ tables }: { tables: TableInfo[] }) {
  const cols = 3
  const W = 200
  const pos = (i: number) => ({ x: 30 + (i % cols) * (W + 80), y: 30 + Math.floor(i / cols) * 200 })
  const idx = new Map(tables.map((t, i) => [t.name, i]))
  const heights = tables.map((t) => 26 + t.columns.length * 16 + 8)
  const height = Math.max(400, ...tables.map((_, i) => pos(i).y + heights[i] + 30))
  return (
    <svg className="model-view" viewBox={`0 0 ${cols * (W + 80) + 30} ${height}`}>
      {tables.map((t, i) =>
        t.fks.map((fk, j) => {
          const k = idx.get(fk.table)
          if (k === undefined) return null
          const a = pos(i)
          const b = pos(k)
          const ax = a.x + W / 2
          const ay = a.y + 13
          const bx = b.x + W / 2
          const by = b.y + 13
          return (
            <g key={`${i}-${j}`}>
              <path d={`M${ax},${ay} C${ax},${(ay + by) / 2} ${bx},${(ay + by) / 2} ${bx},${by}`} fill="none" stroke="#605e5c" strokeWidth={1.2} />
              <text x={(ax + bx) / 2} y={(ay + by) / 2 - 4} textAnchor="middle" fill="#605e5c" fontSize={10}>
                * — 1
              </text>
            </g>
          )
        }),
      )}
      {tables.map((t, i) => {
        const p = pos(i)
        return (
          <g key={t.name} transform={`translate(${p.x},${p.y})`}>
            <rect width={W} height={heights[i]} rx={4} fill="#fff" stroke="#c8c6c4" />
            <rect width={W} height={26} rx={4} fill="#f3f2f1" />
            <text x={8} y={17} fontWeight={600}>
              {t.name}
            </text>
            {t.columns.map((c, j) => (
              <text key={c.name} x={10} y={26 + 14 + j * 16} fill={c.pk ? '#252423' : '#605e5c'} fontWeight={c.pk ? 600 : 400}>
                {c.pk ? '🔑 ' : t.fks.some((f) => f.from.includes(c.name)) ? '🔗 ' : isNumericType(c.type) ? 'Σ ' : '   '}
                {c.name}
              </text>
            ))}
          </g>
        )
      })}
    </svg>
  )
}
