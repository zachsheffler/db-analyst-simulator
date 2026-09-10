import { useEffect, useState, type MutableRefObject } from 'react'
import type { DesignChallenge, Notation } from '../../types/content'
import { ERCanvas, autoPlaceAttribute } from './ERCanvas'
import type { ERDiagram, ERNode } from './erModel'
import { nid } from './erModel'
import { gradeER } from '../../lib/erGrade'
import type { Grade } from '../../lib/grade'

interface Props {
  challenge: DesignChallenge
  notation: Notation
  diagram: ERDiagram
  onChange: (d: ERDiagram) => void
  onGraded: (g: Grade) => void
  checkRef: MutableRefObject<(() => void | Promise<void>) | null>
}

export function ERStep({ challenge, notation, diagram, onChange, onGraded, checkRef }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [mode, setMode] = useState<'select' | 'link'>('select')
  const t = notation.er.terms
  const sel = diagram.nodes.find((n) => n.id === selected) ?? null
  const entities = diagram.nodes.filter((n) => n.kind === 'entity')

  useEffect(() => {
    checkRef.current = () => onGraded(gradeER(diagram, challenge, notation))
    return () => {
      checkRef.current = null
    }
  })

  const update = (id: string, patch: Partial<ERNode>) => onChange({ nodes: diagram.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) })

  const addEntity = () => {
    const n: ERNode = { id: nid('e'), kind: 'entity', name: '', x: 160 + (entities.length % 3) * 260, y: 120 + Math.floor(entities.length / 3) * 240 }
    onChange({ nodes: [...diagram.nodes, n] })
    setSelected(n.id)
  }
  const addAttribute = () => {
    const owner = sel && (sel.kind === 'entity' || sel.kind === 'relationship') ? sel : sel?.kind === 'attribute' ? diagram.nodes.find((n) => n.id === sel.owner) : null
    if (!owner) return
    const count = diagram.nodes.filter((n) => n.owner === owner.id).length
    const pos = autoPlaceAttribute(owner, count)
    const n: ERNode = { id: nid('a'), kind: 'attribute', name: '', owner: owner.id, ...pos }
    onChange({ nodes: [...diagram.nodes, n] })
    setSelected(n.id)
  }
  const remove = () => {
    if (!sel) return
    const ids = new Set([sel.id, ...diagram.nodes.filter((n) => n.owner === sel.id).map((n) => n.id)])
    for (const r of diagram.nodes) if (r.kind === 'relationship' && r.sides?.some((s) => ids.has(s.entity))) ids.add(r.id)
    for (const a of diagram.nodes) if (a.owner && ids.has(a.owner)) ids.add(a.id)
    onChange({ nodes: diagram.nodes.filter((n) => !ids.has(n.id)) })
    setSelected(null)
  }

  return (
    <div className="er-layout">
      <div className="panel er-panel">
        <div className="er-toolbar">
          <button onClick={addEntity}>+ {t.entity}</button>
          <button onClick={addAttribute} disabled={!sel} title={sel ? '' : `Select an ${t.entity} or ${t.relationship} first`}>
            + {t.attribute}
          </button>
          <button className={mode === 'link' ? 'active' : ''} onClick={() => setMode(mode === 'link' ? 'select' : 'link')} disabled={entities.length < 1}>
            + {t.relationship} {mode === 'link' ? '(click two entities…)' : ''}
          </button>
          <button className="danger" onClick={remove} disabled={!sel}>
            Delete
          </button>
        </div>
        <ERCanvas diagram={diagram} onChange={onChange} selected={selected} onSelect={setSelected} notation={notation} mode={mode} onModeDone={() => setMode('select')} />
      </div>
      <div className="panel props">
        <div className="panel-head">{sel ? `${sel.kind === 'entity' ? t.entity : sel.kind === 'relationship' ? t.relationship : t.attribute} properties` : 'Properties'}</div>
        <div className="panel-body">
          {!sel && <div className="muted">Select something on the canvas.</div>}
          {sel && (
            <>
              <label>
                <span className="lbl">Name</span>
                <input key={sel.id} type="text" value={sel.name} autoFocus onChange={(e) => update(sel.id, { name: e.target.value })} />
              </label>
              {sel.kind === 'entity' && (
                <label>
                  <input type="checkbox" checked={!!sel.weak} onChange={(e) => update(sel.id, { weak: e.target.checked })} /> {t.weakEntity}
                </label>
              )}
              {sel.kind === 'attribute' && (
                <>
                  <label>
                    <input type="checkbox" checked={!!sel.key} onChange={(e) => update(sel.id, { key: e.target.checked })} /> {t.uniqueAttribute}
                  </label>
                  <label>
                    <input type="checkbox" checked={!!sel.partialKey} onChange={(e) => update(sel.id, { partialKey: e.target.checked })} /> partial key (weak entity)
                  </label>
                  <label>
                    <input type="checkbox" checked={!!sel.multivalued} onChange={(e) => update(sel.id, { multivalued: e.target.checked })} /> {t.multivalued}
                  </label>
                  <label>
                    <input type="checkbox" checked={!!sel.derived} onChange={(e) => update(sel.id, { derived: e.target.checked })} /> {t.derived}
                  </label>
                  <label>
                    <input type="checkbox" checked={!!sel.optional} onChange={(e) => update(sel.id, { optional: e.target.checked })} /> {t.optional}
                  </label>
                  <label>
                    <span className="lbl">{t.composite} of</span>
                    <input
                      type="text"
                      placeholder="e.g. Street, City, Zip"
                      value={(sel.composite ?? []).join(', ')}
                      onChange={(e) =>
                        update(sel.id, {
                          composite: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </label>
                </>
              )}
              {sel.kind === 'relationship' && sel.sides && (
                <>
                  <label>
                    <input type="checkbox" checked={!!sel.identifying} onChange={(e) => update(sel.id, { identifying: e.target.checked })} /> identifying (weak entity)
                  </label>
                  {sel.sides.map((s, i) => {
                    const ent = diagram.nodes.find((n) => n.id === s.entity)
                    const other = diagram.nodes.find((n) => n.id === sel.sides![1 - i].entity)
                    const setSide = (patch: Partial<typeof s>) => {
                      const sides = [...sel.sides!] as [typeof s, typeof s]
                      sides[i] = { ...s, ...patch }
                      update(sel.id, { sides })
                    }
                    return (
                      <fieldset key={i}>
                        <legend>{ent?.name?.toUpperCase() || '?'} side</legend>
                        <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
                          Each {other?.name || '?'} relates to…
                        </div>
                        <label>
                          <span className="lbl">at most</span>
                          <select value={s.max} onChange={(e) => setSide({ max: e.target.value as '1' | 'M' })}>
                            <option value="1">one {ent?.name || ''} (1)</option>
                            <option value="M">many {ent?.name || ''} (M)</option>
                          </select>
                        </label>
                        <label>
                          <span className="lbl">at least</span>
                          <select value={s.min} onChange={(e) => setSide({ min: e.target.value as 'mandatory' | 'optional' })}>
                            <option value="optional">zero ({t.optional})</option>
                            <option value="mandatory">one ({t.mandatory})</option>
                          </select>
                        </label>
                        {sel.sides![0].entity === sel.sides![1].entity && (
                          <label>
                            <span className="lbl">role</span>
                            <input type="text" value={s.role ?? ''} onChange={(e) => setSide({ role: e.target.value })} />
                          </label>
                        )}
                      </fieldset>
                    )
                  })}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
