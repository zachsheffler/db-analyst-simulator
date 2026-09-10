import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { DesignChallenge, Notation } from '../../types/content'
import type { ERDiagram, Schema, SchemaColumn, SchemaTable } from './erModel'
import { nid } from './erModel'
import { gradeSchema } from '../../lib/schemaGrade'
import type { Grade } from '../../lib/grade'

const TYPES = ['INT', 'DECIMAL(10,2)', 'VARCHAR(50)', 'VARCHAR(200)', 'CHAR(10)', 'DATE', 'BOOLEAN']

interface Props {
  challenge: DesignChallenge
  notation: Notation
  schema: Schema
  onChange: (s: Schema) => void
  er: ERDiagram
  onGraded: (g: Grade) => void
  checkRef: MutableRefObject<(() => void | Promise<void>) | null>
}

export function SchemaStep({ challenge, notation, schema, onChange, er, onGraded, checkRef }: Props) {
  useEffect(() => {
    checkRef.current = () => onGraded(gradeSchema(schema, challenge, notation).grade)
    return () => {
      checkRef.current = null
    }
  })
  const setTable = (id: string, patch: Partial<SchemaTable>) => onChange({ tables: schema.tables.map((t) => (t.id === id ? { ...t, ...patch } : t)) })
  const setCol = (tid: string, cid: string, patch: Partial<SchemaColumn>) =>
    onChange({
      tables: schema.tables.map((t) => (t.id === tid ? { ...t, columns: t.columns.map((c) => (c.id === cid ? { ...c, ...patch } : c)) } : t)),
    })
  const addTable = (name = '', columns: SchemaColumn[] = []) => {
    const t: SchemaTable = { id: nid('t'), name, columns }
    onChange({ tables: [...schema.tables, t] })
  }
  const addCol = (tid: string) => {
    const c: SchemaColumn = { id: nid('c'), name: '', type: 'VARCHAR(50)', pk: false, nullable: false, fk: null }
    onChange({ tables: schema.tables.map((t) => (t.id === tid ? { ...t, columns: [...t.columns, c] } : t)) })
  }
  const seedFromER = () => {
    const ents = er.nodes.filter((n) => n.kind === 'entity')
    const tables: SchemaTable[] = ents.map((e) => ({
      id: nid('t'),
      name: e.name,
      columns: er.nodes
        .filter((a) => a.kind === 'attribute' && a.owner === e.id && !a.derived && !a.multivalued)
        .flatMap((a) =>
          a.composite?.length
            ? a.composite.map((c) => ({ id: nid('c'), name: c, type: 'VARCHAR(50)', pk: false, nullable: false, fk: null }))
            : [{ id: nid('c'), name: a.name, type: /id|number|no$/i.test(a.name) ? 'INT' : 'VARCHAR(50)', pk: !!a.key, nullable: !!a.optional, fk: null }],
        ),
    }))
    onChange({ tables })
  }

  const allColumns = schema.tables.flatMap((t) => t.columns.map((c) => ({ table: t.name, column: c.name, pk: c.pk })))

  return (
    <div className="schema-layout">
      <div>
        <div className="row" style={{ marginBottom: 8 }}>
          <button onClick={() => addTable()}>+ Table</button>
          <button onClick={seedFromER} disabled={!er.nodes.some((n) => n.kind === 'entity')} title="Creates one table per entity with its simple attributes. Relationships, multivalued attributes and keys are up to you.">
            Start from my ER entities
          </button>
        </div>
        {schema.tables.map((t) => (
          <div className="schema-table" key={t.id}>
            <div className="head">
              <input type="text" placeholder="TABLE_NAME" value={t.name} onChange={(e) => setTable(t.id, { name: e.target.value })} />
              <button className="small" onClick={() => addCol(t.id)}>
                + column
              </button>
              <button className="small danger" onClick={() => onChange({ tables: schema.tables.filter((x) => x.id !== t.id) })}>
                ✕
              </button>
            </div>
            <div className="col hdr">
              <span>Column</span>
              <span>Type</span>
              <span title="Primary key">PK</span>
              <span title="Allows NULL">Null</span>
              <span title="Unique (for 1:1)">Uniq</span>
              <span>Foreign key →</span>
              <span />
            </div>
            {t.columns.map((c) => (
              <div className="col" key={c.id}>
                <input type="text" placeholder="column" value={c.name} onChange={(e) => setCol(t.id, c.id, { name: e.target.value })} />
                <select value={TYPES.includes(c.type) ? c.type : 'custom'} onChange={(e) => setCol(t.id, c.id, { type: e.target.value })}>
                  {TYPES.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                  {!TYPES.includes(c.type) && <option value="custom">{c.type}</option>}
                </select>
                <input type="checkbox" checked={c.pk} onChange={(e) => setCol(t.id, c.id, { pk: e.target.checked, nullable: e.target.checked ? false : c.nullable })} />
                <input type="checkbox" checked={c.nullable} disabled={c.pk} onChange={(e) => setCol(t.id, c.id, { nullable: e.target.checked })} />
                <input type="checkbox" checked={!!c.unique} disabled={c.pk} onChange={(e) => setCol(t.id, c.id, { unique: e.target.checked })} />
                <select
                  value={c.fk ? `${c.fk.table}.${c.fk.column}` : ''}
                  onChange={(e) => {
                    const v = e.target.value
                    if (!v) return setCol(t.id, c.id, { fk: null })
                    const [table, column] = v.split('.')
                    setCol(t.id, c.id, { fk: { table, column } })
                  }}
                >
                  <option value="">—</option>
                  {allColumns
                    .filter((x) => x.pk && x.table && x.column)
                    .map((x) => (
                      <option key={`${x.table}.${x.column}`} value={`${x.table}.${x.column}`}>
                        {x.table}.{x.column}
                      </option>
                    ))}
                </select>
                <button className="small ghost danger" onClick={() => setTable(t.id, { columns: t.columns.filter((x) => x.id !== c.id) })}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div>
        <div className="panel">
          <div className="panel-head">Relational schema diagram</div>
          <SchemaDiagram schema={schema} notation={notation} />
        </div>
      </div>
    </div>
  )
}

/** Jukic-style relational schema: tables as boxes of column names, PK underlined, FK italic, FK lines to referenced PKs. */
export function SchemaDiagram({ schema, notation }: { schema: Schema; notation: Notation }) {
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({})
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const ROWH = 20
  const layout = schema.tables.map((t, i) => {
    const w = Math.max(120, 30 + t.columns.reduce((a, c) => a + Math.max(4, c.name.length) * 7.2 + 10, 0))
    const p = pos[t.id] ?? { x: 20 + (i % 2) * 320, y: 30 + Math.floor(i / 2) * 120 }
    return { t, x: p.x, y: p.y, w, h: ROWH * 2 }
  })
  const byName = new Map(layout.map((l) => [l.t.name, l]))
  const colX = (l: (typeof layout)[number], colName: string) => {
    let x = l.x + 8
    for (const c of l.t.columns) {
      const w = Math.max(4, c.name.length) * 7.2 + 10
      if (c.name === colName) return x + w / 2
      x += w
    }
    return l.x + l.w / 2
  }
  const height = Math.max(500, ...layout.map((l) => l.y + l.h + 60))
  const width = Math.max(600, ...layout.map((l) => l.x + l.w + 40))

  const onDown = (e: React.MouseEvent, id: string, x: number, y: number) => {
    const r = svgRef.current!.getBoundingClientRect()
    drag.current = { id, dx: x - (e.clientX - r.left), dy: y - (e.clientY - r.top) }
  }
  const onMove = (e: React.MouseEvent) => {
    if (!drag.current) return
    const r = svgRef.current!.getBoundingClientRect()
    const { id, dx, dy } = drag.current
    setPos((p) => ({ ...p, [id]: { x: e.clientX - r.left + dx, y: e.clientY - r.top + dy } }))
  }
  return (
    <svg ref={svgRef} className="schema-diagram" viewBox={`0 0 ${width} ${height}`} style={{ height }} onMouseMove={onMove} onMouseUp={() => (drag.current = null)} onMouseLeave={() => (drag.current = null)}>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#1a1d23" />
        </marker>
      </defs>
      {layout.map((l) =>
        l.t.columns
          .filter((c) => c.fk)
          .map((c) => {
            const target = byName.get(c.fk!.table)
            if (!target) return null
            const x1 = colX(l, c.name)
            const y1 = l.y + l.h
            const x2 = colX(target, c.fk!.column)
            const y2 = target.y
            const below = y2 > y1
            const my = below ? (y1 + y2) / 2 : Math.max(y1, target.y + target.h) + 24
            const d = below ? `M${x1},${y1} V${my} H${x2} V${y2}` : `M${x1},${y1} V${my} H${x2} V${target.y + target.h}`
            return <path key={`${l.t.id}-${c.id}`} className="fk-line" d={d} markerEnd="url(#arrow)" />
          }),
      )}
      {layout.map((l) => (
        <g key={l.t.id} className="tbl" transform={`translate(${l.x},${l.y})`} onMouseDown={(e) => onDown(e, l.t.id, l.x, l.y)}>
          <text y={-6} fontWeight={700}>
            {l.t.name || '(unnamed)'}
          </text>
          <rect width={l.w} height={l.h} fill="#fff" stroke="#1a1d23" />
          {(() => {
            let x = 8
            return l.t.columns.map((c) => {
              const w = Math.max(4, c.name.length) * 7.2 + 10
              const cx = x + w / 2
              x += w
              return (
                <g key={c.id}>
                  <line x1={x} x2={x} y1={0} y2={l.h} stroke="#1a1d23" strokeWidth={0.6} />
                  <text
                    x={cx}
                    y={l.h / 2 + 4}
                    textAnchor="middle"
                    className={`${c.pk ? 'pk' : ''} ${c.fk ? 'fk' : ''}`}
                    fontWeight={c.pk && notation.relational.pkMark === 'bold' ? 700 : undefined}
                  >
                    {c.name || '?'}
                  </text>
                </g>
              )
            })
          })()}
        </g>
      ))}
      {schema.tables.length === 0 && (
        <text x={20} y={30} fill="var(--muted)">
          Add tables on the left; the diagram updates live.
        </text>
      )}
    </svg>
  )
}
