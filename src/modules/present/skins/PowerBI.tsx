import { useState } from 'react'
import type { Aggregation, FieldRef, VisualType } from '../../../types/content'
import { AGG_LABELS, VISUAL_LABELS, fieldKey, isNumericType } from '../../../lib/vizQuery'
import { BarChart, CardVisual, LineChart, Legend, PieChart, PieLegend, TableVisual } from '../charts'
import { dragStart, dropProps, type Workbench } from '../workbench'
import { CalcEditor, FilterCard } from '../parts'
import type { SkinProps } from './types'
import type { TableInfo } from '../../../lib/sqlite'

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

export function PowerBISkin({ wb, docTitle, onCheck, checkLabel, banner }: SkinProps) {
  const [view, setView] = useState<'report' | 'data' | 'model'>('report')
  const [dataTable, setDataTable] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ Filters: true })
  const [calc, setCalc] = useState<null | 'measure' | 'column'>(null)
  const spec = wb.spec
  const wells = wb.wells
  const chart = wb.chart
  const data = wb.data

  const chip = (label: string, onRemove: () => void, extra?: React.ReactNode) => (
    <div className="chip" key={label}>
      {extra ?? <span style={{ flex: 1 }}>{label}</span>}
      <span className="x" onClick={onRemove} title="Remove">
        ✕
      </span>
    </div>
  )
  const aggSelect = (agg: Aggregation, field: FieldRef, allowNone: boolean) => {
    const info = wb.info(field)
    if (info?.calc?.aggregate) return <span style={{ flex: 1 }}>{field.column}</span>
    return (
      <select value={agg} onChange={(e) => wb.setAgg(field, e.target.value as Aggregation)} title="Aggregation">
        {(Object.keys(AGG_LABELS) as Aggregation[])
          .filter((a) => allowNone || a !== 'none')
          .map((a) => (
            <option key={a} value={a}>
              {a === 'none' ? field.column : `${AGG_LABELS[a]} of ${field.column}`}
            </option>
          ))}
      </select>
    )
  }
  const sort = wb.sort

  return (
    <div className="pbi viz-skin">
      <div className="pbi-ribbon">
        <div className="tabs">
          <span>File</span>
          <span className="active">Home</span>
          <span>Insert</span>
          <span>Modeling</span>
          <span>View</span>
          <span>Help</span>
          <span style={{ marginLeft: 'auto', color: '#605e5c' }}>{docTitle} — Power Byte Desktop</span>
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
              <div className="icon" title={wb.dbDef.name}>
                🗄
              </div>
              <div className="icon">📥</div>
            </div>
            Data
          </div>
          <div className="group">
            <div className="icons">
              <button className="icon wide" onClick={() => setCalc('measure')} title="New measure: an aggregate expression, e.g. SUM(Gig[Earnings]) / SUM(Gig[Hours])">
                ∑ New measure
              </button>
              <button className="icon wide" onClick={() => setCalc('column')} title="New column: a row-level expression, e.g. Gig[Earnings] + Gig[Tips]">
                ▤ New column
              </button>
            </div>
            Calculations
          </div>
          <div className="group" style={{ borderRight: 0 }}>
            <div className="icons">
              <button className="icon check" onClick={onCheck} disabled={!wb.ready} title="Ctrl+Enter">
                ✓ {checkLabel}
              </button>
            </div>
            Simulator
          </div>
        </div>
        {calc && <CalcEditor wb={wb} variant="pbi" kind={calc} onClose={() => setCalc(null)} />}
      </div>
      {banner}
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
                  <button title="Sort options">
                    <select
                      value={sort ? `${sort.by}-${sort.dir}` : ''}
                      onChange={(e) => {
                        const [by, dir] = e.target.value.split('-') as ['axis' | 'value', 'asc' | 'desc']
                        wb.setSort({ by, dir })
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
                      onChange={(e) => wb.setTitle(e.target.value)}
                      onBlur={() => setEditingTitle(false)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && setEditingTitle(false)}
                    />
                  ) : (
                    spec.title || <span style={{ color: '#a19f9d', fontWeight: 400 }}>Click to add a title</span>
                  )}
                </div>
                <div className="vbody">
                  {data.error && <div className="pbi-placeholder">{data.error}</div>}
                  {!data.error && (!data.rs || !chart) && <div className="pbi-placeholder">Drag or tick fields in the Fields pane to build a {VISUAL_LABELS[spec.type].toLowerCase()}.</div>}
                  {data.rs && chart && <VisualBody wb={wb} />}
                </div>
              </div>
            </div>
          )}
          {view === 'data' && (
            <div className="pbi-page" style={{ aspectRatio: 'auto', minHeight: 300, overflow: 'auto' }}>
              <div className="row" style={{ marginBottom: 8 }}>
                <select value={dataTable ?? wb.tables[0]?.name ?? ''} onChange={(e) => setDataTable(e.target.value)}>
                  {wb.tables.map((t) => (
                    <option key={t.name}>{t.name}</option>
                  ))}
                </select>
                <span className="muted">first 100 rows</span>
              </div>
              {(() => {
                const rs = wb.tables.length ? wb.queryTable(dataTable ?? wb.tables[0].name) : null
                return rs ? <TableVisual rs={rs} /> : null
              })()}
            </div>
          )}
          {view === 'model' && (
            <div className="pbi-page" style={{ aspectRatio: 'auto', minHeight: 420 }}>
              <ModelView tables={wb.tables} />
            </div>
          )}
          {wb.built.sql && (
            <details className="pbi-task" style={{ fontSize: 12 }}>
              <summary style={{ cursor: 'pointer' }}>SQL behind this visual</summary>
              <pre style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{wb.built.sql}</pre>
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
                  <FilterCard key={fieldKey(f.field)} wb={wb} filter={f} onChange={(nf) => wb.setFilter(i, nf)} onRemove={() => wb.removeFilter(i)} />
                ))}
                <div className="well-box" {...dropProps((f) => wb.addFilter(f))}>
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
                {VISUAL_ICONS.map(([t, icon], i) => (
                  <button key={t} className={spec.type === t ? 'active' : ''} title={`${VISUAL_LABELS[t]} (${i + 1})`} onClick={() => wb.setType(t)}>
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
                  <div className="well-box" {...dropProps((f) => wb.addField(f, 'axis'))}>
                    {spec.axis ? chip(spec.axis.column, () => wb.update((s) => ({ ...s, axis: undefined }))) : <div className="empty">Add data fields here</div>}
                  </div>
                </div>
              )}
              {wells.legend && (
                <div className="well">
                  <div className="well-label">{wells.legend}</div>
                  <div className="well-box" {...dropProps((f) => wb.addField(f, 'legend'))}>
                    {spec.legend ? chip(spec.legend.column, () => wb.update((s) => ({ ...s, legend: undefined }))) : <div className="empty">Add data fields here</div>}
                  </div>
                </div>
              )}
              {wells.values && (
                <div className="well">
                  <div className="well-label">{wells.values}</div>
                  <div className="well-box" {...dropProps((f) => wb.addField(f, 'values'))}>
                    {spec.values.length === 0 && <div className="empty">Add data fields here</div>}
                    {spec.values.map((v) => chip(fieldKey(v.field), () => wb.update((s) => ({ ...s, values: s.values.filter((x) => fieldKey(x.field) !== fieldKey(v.field)) })), aggSelect(v.agg, v.field, false)))}
                  </div>
                </div>
              )}
              {wells.columns && (
                <div className="well">
                  <div className="well-label">{wells.columns}</div>
                  <div className="well-box" {...dropProps((f) => wb.addField(f, 'columns'))}>
                    {(spec.columns ?? []).length === 0 && <div className="empty">Add data fields here</div>}
                    {(spec.columns ?? []).map((v) => chip(fieldKey(v.field), () => wb.update((s) => ({ ...s, columns: (s.columns ?? []).filter((x) => fieldKey(x.field) !== fieldKey(v.field)) })), aggSelect(v.agg, v.field, true)))}
                  </div>
                </div>
              )}
              <button className="small" style={{ marginTop: 6 }} onClick={wb.clear}>
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
              {wb.calcFields.length > 0 && (
                <details open>
                  <summary>∑ Calculations</summary>
                  {wb.calcFields.map((f) => (
                    <div key={f.name} className="field" draggable onDragStart={(e) => dragStart(e, f.ref)} title={f.calc?.expr}>
                      <input type="checkbox" checked={wb.isUsed(f.ref)} onChange={(e) => (e.target.checked ? wb.addField(f.ref) : wb.removeField(f.ref))} />
                      <span className="sigma">{f.numeric ? '∑' : 'ƒ'}</span>
                      <span style={{ flex: 1 }}>{f.name}</span>
                      <span className="x" onClick={() => wb.removeCalc(f.name)} title="Delete calculation">
                        ✕
                      </span>
                    </div>
                  ))}
                </details>
              )}
              {wb.tables.map((t) => (
                <details key={t.name} open>
                  <summary>▤ {t.name}</summary>
                  {wb.fields
                    .filter((f) => f.table === t.name && (!search || f.name.toLowerCase().includes(search.toLowerCase())))
                    .map((f) => (
                      <div key={f.name} className="field" draggable onDragStart={(e) => dragStart(e, f.ref)}>
                        <input type="checkbox" checked={wb.isUsed(f.ref)} onChange={(e) => (e.target.checked ? wb.addField(f.ref) : wb.removeField(f.ref))} />
                        <span className="sigma">{f.numeric ? 'Σ' : f.pk ? '🔑' : f.date ? '📅' : ''}</span>
                        <span>{f.name}</span>
                      </div>
                    ))}
                </details>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** The chart itself, shared by all skins (theme via a wrapper class). */
export function VisualBody({ wb, panel }: { wb: Workbench; panel?: boolean }) {
  const { spec, chart, data } = wb
  if (!data.rs || !chart) return null
  if (spec.type === 'card') return <CardVisual rs={data.rs} />
  if (spec.type === 'table') return <TableVisual rs={data.rs} />
  if (spec.type === 'pie' || spec.type === 'donut')
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <PieLegend data={chart} />
        <div style={{ flex: 1, minHeight: 0 }}>
          <PieChart data={chart} donut={spec.type === 'donut'} />
        </div>
      </div>
    )
  if (spec.type === 'line')
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Legend data={chart} />
        <div style={{ flex: 1, minHeight: 0 }}>
          <LineChart data={chart} panel={panel} />
        </div>
      </div>
    )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Legend data={chart} />
      <div style={{ flex: 1, minHeight: 0 }}>
        <BarChart data={chart} type={spec.type} panel={panel} />
      </div>
    </div>
  )
}

export function ModelView({ tables }: { tables: TableInfo[] }) {
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
