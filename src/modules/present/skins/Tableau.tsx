import { useState } from 'react'
import type { Aggregation, FieldRef, VisualType } from '../../../types/content'
import { AGG_LABELS, VISUAL_LABELS, fieldKey } from '../../../lib/vizQuery'
import { dragStart, dropProps, type FieldInfo } from '../workbench'
import { CalcEditor, FilterCard } from '../parts'
import { VisualBody } from './PowerBI'
import type { SkinProps } from './types'

const SHOW_ME: { type: VisualType; label: string; glyph: string }[] = [
  { type: 'table', label: 'text table', glyph: '▦' },
  { type: 'card', label: 'big number', glyph: '🔢' },
  { type: 'clusteredBar', label: 'horizontal bars', glyph: '▬' },
  { type: 'clusteredColumn', label: 'vertical bars', glyph: '▮' },
  { type: 'stackedColumn', label: 'stacked bars', glyph: '▤' },
  { type: 'line', label: 'lines (continuous)', glyph: '📈' },
  { type: 'pie', label: 'pie chart', glyph: '🥧' },
  { type: 'donut', label: 'donut (dual axis)', glyph: '🍩' },
]

const TAB_AGG: Record<Aggregation, string> = { sum: 'SUM', avg: 'AVG', count: 'CNT', countDistinct: 'CNTD', min: 'MIN', max: 'MAX', none: 'ATTR' }

export function TableauSkin({ wb, docTitle, onCheck, checkLabel, banner }: SkinProps) {
  const [showMe, setShowMe] = useState(true)
  const [calc, setCalc] = useState(false)
  const [menu, setMenu] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [search, setSearch] = useState('')
  const spec = wb.spec
  const t = spec.type

  // ---- shelves derived from the spec --------------------------------------
  const vertical = t === 'clusteredColumn' || t === 'stackedColumn' || t === 'line'
  const dims: FieldRef[] = t === 'table' ? (spec.columns ?? []).filter((c) => c.agg === 'none').map((c) => c.field) : [spec.axis, spec.legend].filter((x): x is FieldRef => !!x && t !== 'pie' && t !== 'donut')
  const measures = t === 'table' ? (spec.columns ?? []).filter((c) => c.agg !== 'none') : spec.values
  const columnsShelf = t === 'clusteredBar' ? measures.map((m) => m.field) : vertical ? (spec.axis ? [spec.axis] : []) : []
  const rowsShelf = t === 'clusteredBar' ? (spec.axis ? [spec.axis] : []) : vertical ? measures.map((m) => m.field) : t === 'table' ? dims : []
  const markType = t === 'line' ? 'Line' : t === 'pie' || t === 'donut' ? 'Pie' : t === 'card' || t === 'table' ? 'Text' : 'Bar'
  const colorField = t === 'pie' || t === 'donut' ? spec.axis : spec.legend
  const angleField = t === 'pie' || t === 'donut' ? measures[0]?.field : undefined
  const textFields = t === 'card' || t === 'table' ? measures.map((m) => m.field) : []

  const dropOnShelf = (shelf: 'columns' | 'rows') => (f: FieldRef) => {
    const isNum = wb.numeric(f)
    if (t === 'card' || t === 'table') {
      wb.addField(f, t === 'table' ? 'columns' : 'values')
      return
    }
    if (isNum) {
      wb.addField(f, 'values')
      // a measure dropped where the dimension lives flips the orientation
      if (shelf === 'columns' && vertical && !spec.axis) wb.setType('clusteredBar')
      return
    }
    if (t === 'pie' || t === 'donut') {
      wb.addField(f, 'axis')
      return
    }
    const target = spec.axis && !spec.legend ? 'legend' : 'axis'
    wb.addField(f, target)
    if (target === 'axis') {
      if (shelf === 'rows' && (t === 'clusteredColumn' || t === 'stackedColumn')) wb.setType('clusteredBar')
      if (shelf === 'columns' && t === 'clusteredBar') wb.setType('clusteredColumn')
    }
  }
  const swap = () => {
    if (t === 'clusteredColumn' || t === 'stackedColumn') wb.setType('clusteredBar')
    else if (t === 'clusteredBar') wb.setType('clusteredColumn')
  }
  const setMark = (m: string) => {
    if (m === 'Bar') wb.setType(t === 'clusteredBar' ? 'clusteredBar' : spec.legend ? 'stackedColumn' : 'clusteredColumn')
    else if (m === 'Line') wb.setType('line')
    else if (m === 'Pie') wb.setType('pie')
    else if (m === 'Text') wb.setType(dims.length || spec.axis ? 'table' : 'card')
  }

  const pill = (f: FieldRef, kind: 'dim' | 'meas', extra?: React.ReactNode, onRemove?: () => void) => {
    const info = wb.info(f)
    const agg = measures.find((m) => fieldKey(m.field) === fieldKey(f))?.agg
    const label = kind === 'meas' && agg && !info?.calc?.aggregate ? `${TAB_AGG[agg]}(${f.column})` : f.column
    return (
      <div key={fieldKey(f)} className={`tab-pill ${kind}`} draggable onDragStart={(e) => dragStart(e, f)}>
        {kind === 'meas' && agg && !info?.calc?.aggregate ? (
          <select value={agg} onChange={(e) => wb.setAgg(f, e.target.value as Aggregation)} title="Measure aggregation">
            {(Object.keys(AGG_LABELS) as Aggregation[])
              .filter((a) => a !== 'none')
              .map((a) => (
                <option key={a} value={a}>
                  {TAB_AGG[a]}({f.column})
                </option>
              ))}
          </select>
        ) : (
          <span>{label}</span>
        )}
        {extra}
        <span className="x" onClick={onRemove ?? (() => wb.removeField(f))} title="Remove from shelf">
          ✕
        </span>
      </div>
    )
  }
  const pillFor = (f: FieldRef) => pill(f, wb.numeric(f) ? 'meas' : 'dim')

  const fieldRow = (f: FieldInfo) => (
    <div key={fieldKey(f.ref)} className={`tab-field ${f.numeric ? 'meas' : 'dim'} ${wb.isUsed(f.ref) ? 'used' : ''}`} draggable onDragStart={(e) => dragStart(e, f.ref)} onDoubleClick={() => wb.addField(f.ref)} title={f.calc ? f.calc.expr : 'Drag to a shelf, or double-click to add'}>
      <span className="ticon">{f.calc ? (f.numeric ? '=#' : '=Abc') : f.numeric ? '#' : f.date ? '📅' : f.pk || f.fk ? '#' : 'Abc'}</span>
      <span style={{ flex: 1 }}>{f.name}</span>
      {f.calc && (
        <span className="x" onClick={() => wb.removeCalc(f.name)} title="Delete calculated field">
          ✕
        </span>
      )}
    </div>
  )
  const matches = (f: FieldInfo) => !search || f.name.toLowerCase().includes(search.toLowerCase())

  return (
    <div className="tab viz-skin">
      <div className="tab-menubar">
        {['File', 'Data', 'Worksheet', 'Dashboard', 'Story', 'Analysis', 'Map', 'Format', 'Server', 'Window', 'Help'].map((m) => (
          <span key={m}>{m}</span>
        ))}
        <span className="doc">{docTitle} — Tablow Desktop</span>
      </div>
      <div className="tab-toolbar">
        <button title="Undo">↶</button>
        <button title="Redo">↷</button>
        <span className="sep" />
        <button title="Swap Rows and Columns" onClick={swap}>
          ⇄ Swap
        </button>
        <button title="Sort ascending by value" onClick={() => wb.setSort({ by: 'value', dir: 'asc' })} className={wb.sort?.by === 'value' && wb.sort.dir === 'asc' ? 'active' : ''}>
          ↑ Sort
        </button>
        <button title="Sort descending by value" onClick={() => wb.setSort({ by: 'value', dir: 'desc' })} className={wb.sort?.by === 'value' && wb.sort.dir === 'desc' ? 'active' : ''}>
          ↓ Sort
        </button>
        <button title="Sort by the axis (A→Z / oldest first)" onClick={() => wb.setSort({ by: 'axis', dir: 'asc' })} className={wb.sort?.by === 'axis' && wb.sort.dir === 'asc' ? 'active' : ''}>
          A→Z
        </button>
        <button title="Sort by the axis descending" onClick={() => wb.setSort({ by: 'axis', dir: 'desc' })} className={wb.sort?.by === 'axis' && wb.sort.dir === 'desc' ? 'active' : ''}>
          Z→A
        </button>
        <span className="sep" />
        <button onClick={wb.clear} title="Clear sheet">
          🧹 Clear
        </button>
        <span className="grow" />
        <button className="check" onClick={onCheck} disabled={!wb.ready} title="Ctrl+Enter">
          ✓ {checkLabel}
        </button>
        <button className={showMe ? 'active' : ''} onClick={() => setShowMe((s) => !s)}>
          Show Me
        </button>
      </div>
      {banner}
      <div className="tab-body">
        <div className="tab-data">
          <div className="tab-data-tabs">
            <span className="active">Data</span>
            <span>Analytics</span>
          </div>
          <div className="tab-source">
            <span className="src-icon">🗄</span> {wb.dbDef.name}
          </div>
          <div className="tab-search">
            <input placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button onClick={() => setMenu((m) => !m)} title="Data pane menu">
              ▾
            </button>
            {menu && (
              <div className="tab-menu" onMouseLeave={() => setMenu(false)}>
                <div
                  onClick={() => {
                    setMenu(false)
                    setCalc(true)
                  }}
                >
                  Create Calculated Field…
                </div>
                <div className="muted">Create Parameter…</div>
                <div className="muted">Group by Folder</div>
              </div>
            )}
          </div>
          <div className="tab-fields">
            {wb.tables.map((tbl) => {
              const mine = wb.fields.filter((f) => f.table === tbl.name && matches(f))
              return (
                <div key={tbl.name} className="tab-table">
                  <div className="tname">▤ {tbl.name}</div>
                  {mine.filter((f) => !f.numeric).map(fieldRow)}
                  {mine.some((f) => f.numeric) && <div className="tsep" />}
                  {mine.filter((f) => f.numeric).map(fieldRow)}
                </div>
              )
            })}
            {wb.calcFields.length > 0 && (
              <div className="tab-table">
                <div className="tname">= Calculated fields</div>
                {wb.calcFields.filter(matches).map(fieldRow)}
              </div>
            )}
          </div>
        </div>
        <div className="tab-mid">
          <div className="tab-left">
            <div className="tab-shelf small">
              <div className="shelf-label">Pages</div>
              <div className="shelf-box" />
            </div>
            <div className="tab-shelf small">
              <div className="shelf-label">Filters</div>
              <div className="shelf-box" {...dropProps((f) => wb.addFilter(f))}>
                {spec.filters.map((f, i) => (
                  <div key={fieldKey(f.field)} className="tab-pill dim filter" title="Edit filter below">
                    <span>{f.field.column}</span>
                    <span className="x" onClick={() => wb.removeFilter(i)}>
                      ✕
                    </span>
                  </div>
                ))}
              </div>
              {spec.filters.map((f, i) => (
                <div key={`e${fieldKey(f.field)}`} className="tab-filter-edit">
                  <FilterCard wb={wb} filter={f} onChange={(nf) => wb.setFilter(i, nf)} onRemove={() => wb.removeFilter(i)} />
                </div>
              ))}
            </div>
            <div className="tab-marks">
              <div className="shelf-label">Marks</div>
              <select value={markType} onChange={(e) => setMark(e.target.value)} className="mark-type">
                {['Bar', 'Line', 'Pie', 'Text'].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
              <div className="mark-buttons">
                <div className="mb" {...dropProps((f) => wb.addField(f, t === 'pie' || t === 'donut' ? 'axis' : 'legend'))}>
                  🎨 Color
                </div>
                <div className="mb">◯ Size</div>
                <div className="mb" {...dropProps((f) => wb.addField(f, 'values'))}>
                  T Label
                </div>
                <div className="mb">⋯ Detail</div>
                <div className="mb">▭ Tooltip</div>
                {(t === 'pie' || t === 'donut') && (
                  <div className="mb" {...dropProps((f) => wb.addField(f, 'values'))}>
                    ◔ Angle
                  </div>
                )}
                {(t === 'card' || t === 'table') && (
                  <div className="mb" {...dropProps((f) => wb.addField(f, t === 'table' ? 'columns' : 'values'))}>
                    T Text
                  </div>
                )}
              </div>
              <div className="mark-pills">
                {colorField && <div className="mp">🎨 {pill(colorField, 'dim', undefined, () => wb.removeField(colorField))}</div>}
                {angleField && <div className="mp">◔ {pillFor(angleField)}</div>}
                {textFields.map((f) => (
                  <div className="mp" key={fieldKey(f)}>
                    T {pillFor(f)}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="tab-sheet">
            <div className="tab-shelf row-shelf">
              <div className="shelf-label">Columns</div>
              <div className="shelf-box" {...dropProps(dropOnShelf('columns'))}>
                {columnsShelf.map(pillFor)}
              </div>
            </div>
            <div className="tab-shelf row-shelf">
              <div className="shelf-label">Rows</div>
              <div className="shelf-box" {...dropProps(dropOnShelf('rows'))}>
                {rowsShelf.map(pillFor)}
              </div>
            </div>
            <div className="tab-viz">
              <div className="tab-title" onClick={() => setEditingTitle(true)} title="Click to edit the sheet title">
                {editingTitle ? (
                  <input autoFocus type="text" value={spec.title ?? ''} placeholder="Sheet 1" onChange={(e) => wb.setTitle(e.target.value)} onBlur={() => setEditingTitle(false)} onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && setEditingTitle(false)} />
                ) : (
                  spec.title || <span className="muted">Sheet 1</span>
                )}
              </div>
              <div className="tab-plot">
                {wb.data.error && <div className="pbi-placeholder">{wb.data.error}</div>}
                {!wb.data.error && (!wb.data.rs || !wb.chart) && <div className="pbi-placeholder">Drag fields to Columns and Rows, or double-click a field. {VISUAL_LABELS[t]} selected.</div>}
                <VisualBody wb={wb} />
              </div>
            </div>
            {wb.built.sql && (
              <details className="tab-sql">
                <summary>Query behind this sheet</summary>
                <pre style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{wb.built.sql}</pre>
              </details>
            )}
          </div>
          {showMe && (
            <div className="tab-showme">
              <div className="shelf-label">Show Me</div>
              <div className="showme-grid">
                {SHOW_ME.map((s) => (
                  <button key={s.type} className={t === s.type ? 'active' : ''} onClick={() => wb.setType(s.type)} title={s.label}>
                    <span className="glyph">{s.glyph}</span>
                    <span className="lbl">{s.label}</span>
                  </button>
                ))}
              </div>
              <div className="muted" style={{ fontSize: 11, padding: '6px 8px' }}>
                {VISUAL_LABELS[t]}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="tab-bottom">
        <span>Data Source</span>
        <span className="active">Sheet 1</span>
        <span>⊞</span>
        <span>⊟</span>
        <span>⊡</span>
      </div>
      {calc && <CalcEditor wb={wb} variant="tab" onClose={() => setCalc(false)} />}
    </div>
  )
}
