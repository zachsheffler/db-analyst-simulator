import { useMemo, useState } from 'react'
import type { CalcField, VizFilter } from '../../types/content'
import { validateCalc } from '../../lib/calcFields'
import type { Workbench } from './workbench'

/** Filter editor (Power BI filter card look; restyled per skin via CSS). */
export function FilterCard({ wb, filter, onChange, onRemove }: { wb: Workbench; filter: VizFilter; onChange: (f: VizFilter) => void; onRemove: () => void }) {
  const values = useMemo(() => wb.distinctValues(filter.field), [wb, filter.field])
  const isRange = filter.op === 'between'
  return (
    <div className="filter-card">
      <div className="fhead">
        <span>{filter.field.column}</span>
        <span className="x" onClick={onRemove} title="Remove filter">
          ✕
        </span>
      </div>
      <div className="muted" style={{ marginBottom: 4 }}>
        {filter.op === 'in' ? (filter.values.length ? `is ${filter.values.slice(0, 3).join(', ')}${filter.values.length > 3 ? '…' : ''}` : 'is (All)') : filter.values.length === 2 ? `between ${filter.values[0]} and ${filter.values[1]}` : 'is (All)'}
      </div>
      {isRange ? (
        <div className="row" style={{ gap: 4 }}>
          <input type="number" placeholder="min" style={{ width: 70 }} value={filter.values[0] ?? ''} onChange={(e) => onChange({ ...filter, values: [Number(e.target.value), filter.values[1] ?? Number(e.target.value)] })} />
          <span>–</span>
          <input type="number" placeholder="max" style={{ width: 70 }} value={filter.values[1] ?? ''} onChange={(e) => onChange({ ...filter, values: [filter.values[0] ?? Number(e.target.value), Number(e.target.value)] })} />
        </div>
      ) : (
        <div className="vals">
          <label>
            <input type="checkbox" checked={filter.values.length === 0} onChange={() => onChange({ ...filter, values: [] })} /> Select all
          </label>
          {values.map((v) => (
            <label key={String(v)}>
              <input type="checkbox" checked={filter.values.includes(v)} onChange={(e) => onChange({ ...filter, values: e.target.checked ? [...filter.values, v] : filter.values.filter((x) => x !== v) })} /> {String(v)}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export type CalcVariant = 'pbi' | 'tab' | 'gg'

/**
 * Calculated-field editor. Same logic in three costumes: a Power BI formula bar,
 * a Tableau "Create Calculated Field" dialog, or a dplyr mutate()/summarise() row.
 */
export function CalcEditor({ wb, variant, initial, kind, onClose }: { wb: Workbench; variant: CalcVariant; initial?: CalcField; kind?: 'measure' | 'column'; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? (variant === 'tab' ? `Calculation${(wb.spec.calcs?.length ?? 0) + 1}` : ''))
  const [expr, setExpr] = useState(initial?.expr ?? '')
  const [numeric, setNumeric] = useState(initial?.numeric ?? true)
  const check = useMemo(() => validateCalc(expr, wb.tables, (wb.spec.calcs ?? []).filter((c) => c.name !== initial?.name), wb.probe), [expr, wb, initial?.name])
  const nameOk = !!name.trim() && !wb.fields.some((f) => f.name.toLowerCase() === name.trim().toLowerCase())
  const save = () => {
    if (!nameOk || !check.ok) return
    wb.addCalc({ name: name.trim(), expr: expr.trim(), aggregate: check.aggregate, numeric })
    onClose()
  }
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || variant === 'pbi')) {
      e.preventDefault()
      save()
    }
    if (e.key === 'Escape') onClose()
  }
  const status = !expr.trim() ? null : check.ok ? (
    <span className="calc-ok">✓ {check.message}</span>
  ) : (
    <span className="calc-err">✗ {check.message}</span>
  )
  const nameWarn = name.trim() && !nameOk ? <span className="calc-err">A column with that name already exists.</span> : null

  if (variant === 'pbi') {
    // Power BI formula bar: "Name = expression"
    return (
      <div className="pbi-formula">
        <span className="fx">fx</span>
        <input type="text" className="fname" placeholder={kind === 'measure' ? 'Measure name' : 'Column name'} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={keys} autoFocus />
        <span>=</span>
        <input type="text" className="fexpr" placeholder={kind === 'measure' ? 'SUM(Gig[Earnings]) / SUM(Gig[Hours])' : "Gig[Earnings] + Gig[Tips]   or   CASE WHEN Hours > 4 THEN 'long' ELSE 'short' END"} value={expr} onChange={(e) => setExpr(e.target.value)} onKeyDown={keys} />
        <label title="Numeric fields go to the values well; text fields to the axis/legend">
          <input type="checkbox" checked={numeric} onChange={(e) => setNumeric(e.target.checked)} /> Σ
        </label>
        <button className="small primary" onClick={save} disabled={!nameOk || !check.ok}>
          ✓ Commit
        </button>
        <button className="small ghost" onClick={onClose}>
          ✕
        </button>
        <div className="fstatus">
          {nameWarn} {status}
        </div>
      </div>
    )
  }
  if (variant === 'tab') {
    return (
      <div className="tab-dialog-backdrop" onClick={onClose}>
        <div className="tab-dialog" onClick={(e) => e.stopPropagation()}>
          <div className="tab-dialog-title">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={keys} autoFocus />
            <span className="muted">Create Calculated Field</span>
          </div>
          <textarea className="tab-formula" value={expr} placeholder={'[Earnings] + [Tips]\n\nor an aggregate: SUM([Earnings]) / SUM([Hours])'} onChange={(e) => setExpr(e.target.value)} onKeyDown={keys} spellCheck={false} />
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              {nameWarn} {status ?? <span className="muted">Type a formula using [Field] references.</span>}
            </div>
            <label className="muted" style={{ fontSize: 12 }}>
              <input type="checkbox" checked={numeric} onChange={(e) => setNumeric(e.target.checked)} /> measure (green)
            </label>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={onClose}>Cancel</button>
            <button className="primary" onClick={save} disabled={!nameOk || !check.ok}>
              OK
            </button>
          </div>
        </div>
      </div>
    )
  }
  // dplyr
  return (
    <div className="gg-mutate">
      <code>{check.aggregate ? 'summarise(' : 'mutate('}</code>
      <input type="text" className="gname" placeholder="new_column" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={keys} autoFocus />
      <code>=</code>
      <input type="text" className="gexpr" placeholder="Earnings + Tips" value={expr} onChange={(e) => setExpr(e.target.value)} onKeyDown={keys} />
      <code>)</code>
      <label title="numeric?">
        <input type="checkbox" checked={numeric} onChange={(e) => setNumeric(e.target.checked)} /> num
      </label>
      <button className="small primary" onClick={save} disabled={!nameOk || !check.ok}>
        Add
      </button>
      <button className="small ghost" onClick={onClose}>
        ✕
      </button>
      <div className="fstatus">
        {nameWarn} {status}
      </div>
    </div>
  )
}
