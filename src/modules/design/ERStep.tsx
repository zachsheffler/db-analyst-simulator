import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { DesignChallenge, Notation } from '../../types/content'
import { ERCanvas, autoPlaceAttribute } from './ERCanvas'
import type { ERDiagram, ERNode } from './erModel'
import { nid } from './erModel'
import { gradeER } from '../../lib/erGrade'
import type { Grade } from '../../lib/grade'
import { useHotkeys } from '../../lib/hotkeys'

interface Props {
  challenge: DesignChallenge
  notation: Notation
  diagram: ERDiagram
  onChange: (d: ERDiagram) => void
  onGraded: (g: Grade) => void
  checkRef: MutableRefObject<(() => void | Promise<void>) | null>
}

const SIDE_CYCLE: { max: '1' | 'M'; min: 'mandatory' | 'optional' }[] = [
  { max: '1', min: 'mandatory' },
  { max: '1', min: 'optional' },
  { max: 'M', min: 'mandatory' },
  { max: 'M', min: 'optional' },
]

export function ERStep({ challenge, notation, diagram, onChange, onGraded, checkRef }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [mode, setMode] = useState<'select' | 'link'>('select')
  const nameRef = useRef<HTMLInputElement>(null)
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
  const toggle = (flag: keyof ERNode) => sel && update(sel.id, { [flag]: !sel[flag] })

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
  const nudge = (dx: number, dy: number) => {
    if (!sel) return
    onChange({ nodes: diagram.nodes.map((n) => (n.id === sel.id || n.owner === sel.id ? { ...n, x: n.x + dx, y: n.y + dy } : n)) })
  }
  const cycleSide = (i: 0 | 1) => {
    if (!sel?.sides) return
    const s = sel.sides[i]
    const k = SIDE_CYCLE.findIndex((c) => c.max === s.max && c.min === s.min)
    const next = SIDE_CYCLE[(k + 1) % SIDE_CYCLE.length]
    const sides = [...sel.sides] as [typeof s, typeof s]
    sides[i] = { ...s, ...next }
    update(sel.id, { sides })
  }
  const selectNext = (dir: 1 | -1) => {
    const order = [...diagram.nodes].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'entity' ? -1 : b.kind === 'entity' ? 1 : a.kind === 'relationship' ? -1 : 1))
    if (!order.length) return
    const i = order.findIndex((n) => n.id === selected)
    const j = i === -1 ? (dir === 1 ? 0 : order.length - 1) : (i + dir + order.length) % order.length
    setSelected(order[j].id)
  }
  const focusName = () => {
    nameRef.current?.focus()
    nameRef.current?.select()
  }

  useHotkeys('ER diagram', [
    { keys: 'e', label: `Add ${t.entity}`, handler: addEntity },
    { keys: 'a', label: `Add ${t.attribute} to the selected ${t.entity} / ${t.relationship}`, handler: addAttribute, when: () => !!sel },
    { keys: 'r', label: `Add ${t.relationship} (then click two ${/[^aeiou]y$/.test(t.entity) ? t.entity.slice(0, -1) + 'ies' : t.entity + 's'})`, handler: () => setMode((m) => (m === 'link' ? 'select' : 'link')), when: () => entities.length > 0 },
    { keys: 'delete', label: 'Delete selected', handler: remove, when: () => !!sel },
    { keys: 'backspace', label: 'Delete selected', handler: remove, when: () => !!sel },
    { keys: 'enter', label: 'Rename selected (Enter / Esc leaves the box)', handler: focusName, when: () => !!sel },
    { keys: 'f2', label: 'Rename selected', handler: focusName, when: () => !!sel },
    {
      keys: 'escape',
      label: 'Cancel / deselect',
      handler: () => {
        if (mode === 'link') setMode('select')
        else setSelected(null)
      },
    },
    { keys: 'k', label: `Toggle ${t.uniqueAttribute}`, handler: () => toggle('key'), when: () => sel?.kind === 'attribute' },
    { keys: 'p', label: 'Toggle partial key', handler: () => toggle('partialKey'), when: () => sel?.kind === 'attribute' },
    { keys: 'm', label: `Toggle ${t.multivalued}`, handler: () => toggle('multivalued'), when: () => sel?.kind === 'attribute' },
    { keys: 'd', label: `Toggle ${t.derived}`, handler: () => toggle('derived'), when: () => sel?.kind === 'attribute' },
    { keys: 'o', label: `Toggle ${t.optional}`, handler: () => toggle('optional'), when: () => sel?.kind === 'attribute' },
    { keys: 'w', label: `Toggle ${t.weakEntity}`, handler: () => toggle('weak'), when: () => sel?.kind === 'entity' },
    { keys: 'i', label: 'Toggle identifying relationship', handler: () => toggle('identifying'), when: () => sel?.kind === 'relationship' },
    { keys: '1', label: 'Cycle cardinality of side 1 (1·mandatory → 1·optional → M·mandatory → M·optional)', handler: () => cycleSide(0), when: () => sel?.kind === 'relationship' },
    { keys: '2', label: 'Cycle cardinality of side 2', handler: () => cycleSide(1), when: () => sel?.kind === 'relationship' },
    { keys: 'arrowup', label: 'Nudge selected (Shift = 20 px)', handler: () => nudge(0, -5), when: () => !!sel },
    { keys: 'arrowdown', label: 'Nudge selected', handler: () => nudge(0, 5), when: () => !!sel },
    { keys: 'arrowleft', label: 'Nudge selected', handler: () => nudge(-5, 0), when: () => !!sel },
    { keys: 'arrowright', label: 'Nudge selected', handler: () => nudge(5, 0), when: () => !!sel },
    { keys: 'shift+arrowup', label: '', handler: () => nudge(0, -20), when: () => !!sel },
    { keys: 'shift+arrowdown', label: '', handler: () => nudge(0, 20), when: () => !!sel },
    { keys: 'shift+arrowleft', label: '', handler: () => nudge(-20, 0), when: () => !!sel },
    { keys: 'shift+arrowright', label: '', handler: () => nudge(20, 0), when: () => !!sel },
    { keys: 'tab', label: 'Select next / previous (Shift)', handler: () => selectNext(1), when: () => diagram.nodes.length > 0 },
    { keys: 'shift+tab', label: '', handler: () => selectNext(-1), when: () => diagram.nodes.length > 0 },
  ])

  const leaveBox = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      ;(e.target as HTMLInputElement).blur()
    }
  }

  return (
    <div className="er-layout">
      <div className="panel er-panel">
        <div className="er-toolbar">
          <button onClick={addEntity} title="E">
            + {t.entity} <kbd>E</kbd>
          </button>
          <button onClick={addAttribute} disabled={!sel} title={sel ? 'A' : `Select an ${t.entity} or ${t.relationship} first`}>
            + {t.attribute} <kbd>A</kbd>
          </button>
          <button className={mode === 'link' ? 'active' : ''} onClick={() => setMode(mode === 'link' ? 'select' : 'link')} disabled={entities.length < 1} title="R">
            + {t.relationship} <kbd>R</kbd> {mode === 'link' ? '(click two entities…)' : ''}
          </button>
          <button className="danger" onClick={remove} disabled={!sel} title="Delete">
            Delete <kbd>Del</kbd>
          </button>
        </div>
        <ERCanvas diagram={diagram} onChange={onChange} selected={selected} onSelect={setSelected} notation={notation} mode={mode} onModeDone={() => setMode('select')} />
      </div>
      <div className="panel props">
        <div className="panel-head">{sel ? `${sel.kind === 'entity' ? t.entity : sel.kind === 'relationship' ? t.relationship : t.attribute} properties` : 'Properties'}</div>
        <div className="panel-body">
          {!sel && (
            <div className="muted">
              Select something on the canvas, or press <kbd>E</kbd> to add an {t.entity}. Press <kbd>?</kbd> for all shortcuts.
            </div>
          )}
          {sel && (
            <>
              <label>
                <span className="lbl">Name</span>
                <input key={sel.id} ref={nameRef} type="text" value={sel.name} autoFocus onKeyDown={leaveBox} onChange={(e) => update(sel.id, { name: e.target.value })} />
              </label>
              {sel.kind === 'entity' && (
                <label>
                  <input type="checkbox" checked={!!sel.weak} onChange={(e) => update(sel.id, { weak: e.target.checked })} /> {t.weakEntity} <kbd>W</kbd>
                </label>
              )}
              {sel.kind === 'attribute' && (
                <>
                  <label>
                    <input type="checkbox" checked={!!sel.key} onChange={(e) => update(sel.id, { key: e.target.checked })} /> {t.uniqueAttribute} <kbd>K</kbd>
                  </label>
                  <label>
                    <input type="checkbox" checked={!!sel.partialKey} onChange={(e) => update(sel.id, { partialKey: e.target.checked })} /> partial key (weak entity) <kbd>P</kbd>
                  </label>
                  <label>
                    <input type="checkbox" checked={!!sel.multivalued} onChange={(e) => update(sel.id, { multivalued: e.target.checked })} /> {t.multivalued} <kbd>M</kbd>
                  </label>
                  <label>
                    <input type="checkbox" checked={!!sel.derived} onChange={(e) => update(sel.id, { derived: e.target.checked })} /> {t.derived} <kbd>D</kbd>
                  </label>
                  <label>
                    <input type="checkbox" checked={!!sel.optional} onChange={(e) => update(sel.id, { optional: e.target.checked })} /> {t.optional} <kbd>O</kbd>
                  </label>
                  <label>
                    <span className="lbl">{t.composite} of</span>
                    <input
                      type="text"
                      placeholder="e.g. Street, City, Zip"
                      value={(sel.composite ?? []).join(', ')}
                      onKeyDown={leaveBox}
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
                    <input type="checkbox" checked={!!sel.identifying} onChange={(e) => update(sel.id, { identifying: e.target.checked })} /> identifying (weak entity) <kbd>I</kbd>
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
                        <legend>
                          {ent?.name?.toUpperCase() || '?'} side <kbd>{i + 1}</kbd>
                        </legend>
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
                            <input type="text" value={s.role ?? ''} onKeyDown={leaveBox} onChange={(e) => setSide({ role: e.target.value })} />
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
