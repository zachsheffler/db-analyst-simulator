import { useRef, useState } from 'react'
import type { Notation } from '../../types/content'
import type { ERDiagram, ERNode, ERSide } from './erModel'
import { nid } from './erModel'
export { autoPlaceAttribute } from '../../lib/erRef'

const ENT_W = 120
const ENT_H = 44
const ATTR_RX = 44
const ATTR_RY = 18
const REL_W = 120
const REL_H = 56

interface Props {
  diagram: ERDiagram
  onChange: (d: ERDiagram) => void
  selected: string | null
  onSelect: (id: string | null) => void
  notation: Notation
  /** 'link' mode: clicking two entities creates a relationship. */
  mode: 'select' | 'link'
  onModeDone: () => void
  /** Display only: no selection, dragging or linking (panning still works). */
  readOnly?: boolean
  /** Size the drawing to its content instead of filling the panel. */
  fit?: boolean
}

/** Cardinality symbols at the entity end of a line, per notation. */
function CardSymbols({ x, y, angle, side, n }: { x: number; y: number; angle: number; side: ERSide; n: Notation }) {
  // angle: direction pointing from entity edge toward the relationship (radians)
  const outer = n.er.symbolOrder === 'min-inner' ? side.max : side.min // symbol closest to entity
  const inner = n.er.symbolOrder === 'min-inner' ? side.min : side.max
  const draw = (sym: string, dist: number) => {
    const cx = x + Math.cos(angle) * dist
    const cy = y + Math.sin(angle) * dist
    const px = -Math.sin(angle)
    const py = Math.cos(angle)
    if (sym === 'bar') {
      return <line className="card-sym" x1={cx + px * 8} y1={cy + py * 8} x2={cx - px * 8} y2={cy - py * 8} />
    }
    if (sym === 'circle') return <circle className="card-sym" cx={cx} cy={cy} r={5} />
    if (sym === 'crowfoot') {
      // crow's foot opens toward the entity (at x,y)
      const tipX = x + Math.cos(angle) * (dist - 10)
      const tipY = y + Math.sin(angle) * (dist - 10)
      return (
        <g className="card-sym" fill="none">
          <line x1={cx} y1={cy} x2={tipX + px * 9} y2={tipY + py * 9} />
          <line x1={cx} y1={cy} x2={tipX - px * 9} y2={tipY - py * 9} />
          <line x1={cx} y1={cy} x2={tipX} y2={tipY} />
        </g>
      )
    }
    if (sym === 'arrow') {
      const tipX = x + Math.cos(angle) * (dist - 10)
      const tipY = y + Math.sin(angle) * (dist - 10)
      return (
        <g className="card-sym" fill="none">
          <line x1={tipX + px * 6} y1={tipY + py * 6} x2={cx} y2={cy} />
          <line x1={tipX - px * 6} y1={tipY - py * 6} x2={cx} y2={cy} />
        </g>
      )
    }
    if (sym === 'letterM') {
      return (
        <text x={cx + px * 10} y={cy + py * 10 + 4} textAnchor="middle" fontWeight={700}>
          M
        </text>
      )
    }
    return null
  }
  const symFor = (which: 'max' | 'min', v: string) => {
    if (which === 'max') return v === '1' ? (n.er.maxOne === 'none' ? null : 'bar') : n.er.maxMany
    return v === 'optional' ? (n.er.minZero === 'none' ? null : 'circle') : 'bar'
  }
  const outerSym = n.er.symbolOrder === 'min-inner' ? symFor('max', outer) : symFor('min', outer)
  const innerSym = n.er.symbolOrder === 'min-inner' ? symFor('min', inner) : symFor('max', inner)
  return (
    <g>
      {outerSym && draw(outerSym, 12)}
      {innerSym && draw(innerSym, 26)}
    </g>
  )
}

/** Point on the boundary of a node's shape along direction to (tx,ty). */
function edgePoint(node: ERNode, tx: number, ty: number): { x: number; y: number } {
  const dx = tx - node.x
  const dy = ty - node.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  if (node.kind === 'entity') {
    const hw = ENT_W / 2 + (node.weak ? 4 : 0)
    const hh = ENT_H / 2 + (node.weak ? 4 : 0)
    const t = Math.min(hw / Math.abs(ux || 1e-9), hh / Math.abs(uy || 1e-9))
    return { x: node.x + ux * t, y: node.y + uy * t }
  }
  if (node.kind === 'relationship') {
    // diamond |x|/hw + |y|/hh = 1
    const hw = REL_W / 2
    const hh = REL_H / 2
    const t = 1 / (Math.abs(ux) / hw + Math.abs(uy) / hh)
    return { x: node.x + ux * t, y: node.y + uy * t }
  }
  const t = 1 / Math.sqrt((ux * ux) / (ATTR_RX * ATTR_RX) + (uy * uy) / (ATTR_RY * ATTR_RY))
  return { x: node.x + ux * t, y: node.y + uy * t }
}

export function ERCanvas({ diagram, onChange, selected, onSelect, notation, mode, onModeDone, readOnly, fit }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const [linkFrom, setLinkFrom] = useState<string | null>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const panRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)

  const byId = new Map(diagram.nodes.map((n) => [n.id, n]))
  const toSvg = (e: React.MouseEvent) => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left - pan.x, y: e.clientY - r.top - pan.y }
  }

  const onNodeDown = (e: React.MouseEvent, n: ERNode) => {
    e.stopPropagation()
    if (readOnly) return
    if (mode === 'link' && n.kind === 'entity') {
      if (!linkFrom) {
        setLinkFrom(n.id)
        onSelect(n.id)
        return
      }
      const a = byId.get(linkFrom)!
      const rel: ERNode = {
        id: nid('r'),
        kind: 'relationship',
        name: '',
        x: (a.x + n.x) / 2 + (a.id === n.id ? 160 : 0),
        y: (a.y + n.y) / 2 + (a.id === n.id ? 0 : 0),
        sides: [
          { entity: a.id, max: '1', min: 'mandatory' },
          { entity: n.id, max: 'M', min: 'optional' },
        ],
      }
      onChange({ nodes: [...diagram.nodes, rel] })
      setLinkFrom(null)
      onSelect(rel.id)
      onModeDone()
      return
    }
    onSelect(n.id)
    const p = toSvg(e)
    drag.current = { id: n.id, dx: n.x - p.x, dy: n.y - p.y }
  }
  const onMove = (e: React.MouseEvent) => {
    if (panRef.current) {
      setPan({ x: panRef.current.ox + e.clientX - panRef.current.sx, y: panRef.current.oy + e.clientY - panRef.current.sy })
      return
    }
    if (!drag.current) return
    const p = toSvg(e)
    const { id, dx, dy } = drag.current
    const node = byId.get(id)!
    const nx = p.x + dx
    const ny = p.y + dy
    const mx = nx - node.x
    const my = ny - node.y
    // move node and, if entity/relationship, its attributes along
    onChange({
      nodes: diagram.nodes.map((n) => (n.id === id || n.owner === id ? { ...n, x: n.x + mx, y: n.y + my } : n)),
    })
  }
  const onUp = () => {
    drag.current = null
    panRef.current = null
  }
  const onBgDown = (e: React.MouseEvent) => {
    if (!readOnly) {
      onSelect(null)
      setLinkFrom(null)
    }
    panRef.current = { sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y }
  }

  // Lines: attribute -> owner; relationship -> entities
  const links: React.ReactNode[] = []
  for (const n of diagram.nodes) {
    if (n.kind === 'attribute' && n.owner && byId.has(n.owner)) {
      const o = byId.get(n.owner)!
      const a = edgePoint(n, o.x, o.y)
      const b = edgePoint(o, n.x, n.y)
      links.push(<line key={`l${n.id}`} className="link" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />)
    }
    if (n.kind === 'relationship' && n.sides) {
      n.sides.forEach((s, i) => {
        const ent = byId.get(s.entity)
        if (!ent) return
        const unary = n.sides![0].entity === n.sides![1].entity
        // for unary, bend the two lines apart
        const off = unary ? (i === 0 ? -40 : 40) : 0
        const a = edgePoint(n, ent.x, ent.y + off)
        const b = edgePoint(ent, n.x, n.y + off)
        const ang = Math.atan2(a.y - b.y, a.x - b.x)
        links.push(
          <g key={`r${n.id}${i}`}>
            <line className="link" x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={n.identifying ? 3 : undefined} />
            <CardSymbols x={b.x} y={b.y} angle={ang} side={s} n={notation} />
            {s.role && (
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} textAnchor="middle" className="hint">
                {s.role}
              </text>
            )}
          </g>,
        )
      })
    }
  }

  const label = (n: ERNode) => {
    const t = n.name || (n.kind === 'entity' ? 'ENTITY' : n.kind === 'relationship' ? 'Relates' : 'Attribute')
    return n.kind === 'entity' ? t.toUpperCase() : t
  }

  // viewBox to fit content (read-only reference drawings)
  let viewBox: string | undefined
  let fitStyle: React.CSSProperties | undefined
  if (fit && diagram.nodes.length) {
    const xs = diagram.nodes.map((n) => n.x)
    const ys = diagram.nodes.map((n) => n.y)
    const minX = Math.min(...xs) - 90
    const maxX = Math.max(...xs) + 90
    const minY = Math.min(...ys) - 60
    const maxY = Math.max(...ys) + 60
    viewBox = `${minX} ${minY} ${maxX - minX} ${maxY - minY}`
    fitStyle = { height: Math.min(520, Math.max(220, ((maxY - minY) / (maxX - minX)) * 800)), minHeight: 0 }
  }

  return (
    <svg
      ref={svgRef}
      className={`er-canvas ${readOnly ? 'readonly' : ''}`}
      viewBox={viewBox}
      onMouseMove={onMove}
      onMouseUp={onUp}
      onMouseLeave={onUp}
      onMouseDown={onBgDown}
      style={{ cursor: mode === 'link' ? 'crosshair' : undefined, ...fitStyle }}
    >
      <g transform={`translate(${pan.x},${pan.y})`}>
        {diagram.nodes.length === 0 && !readOnly && (
          <text x={30} y={40} className="hint">
            Add an {notation.er.terms.entity} from the toolbar (or press E), then attributes (A) and relationships (R). Drag to move; drag the background to pan.
          </text>
        )}
        {links}
        {diagram.nodes.map((n) => {
          const sel = selected === n.id
          const cls = `node ${sel ? 'selected' : ''}`
          if (n.kind === 'entity') {
            return (
              <g key={n.id} className={cls} transform={`translate(${n.x},${n.y})`} onMouseDown={(e) => onNodeDown(e, n)}>
                {n.weak && <rect className="shape weak-outer" x={-ENT_W / 2 - 4} y={-ENT_H / 2 - 4} width={ENT_W + 8} height={ENT_H + 8} />}
                <rect className="shape" x={-ENT_W / 2} y={-ENT_H / 2} width={ENT_W} height={ENT_H} />
                <text textAnchor="middle" y={4} fontWeight={700}>
                  {label(n)}
                </text>
                {linkFrom === n.id && <circle r={6} cx={ENT_W / 2} cy={-ENT_H / 2} fill="var(--accent)" />}
              </g>
            )
          }
          if (n.kind === 'relationship') {
            const d = `M0,${-REL_H / 2} L${REL_W / 2},0 L0,${REL_H / 2} L${-REL_W / 2},0 Z`
            const d2 = `M0,${-REL_H / 2 - 5} L${REL_W / 2 + 9},0 L0,${REL_H / 2 + 5} L${-REL_W / 2 - 9},0 Z`
            return (
              <g key={n.id} className={cls} transform={`translate(${n.x},${n.y})`} onMouseDown={(e) => onNodeDown(e, n)}>
                {n.identifying && <path className="shape ident-outer" d={d2} />}
                <path className="shape" d={d} />
                <text textAnchor="middle" y={4}>
                  {label(n)}
                </text>
              </g>
            )
          }
          const text = label(n)
          return (
            <g key={n.id} className={cls} transform={`translate(${n.x},${n.y})`} onMouseDown={(e) => onNodeDown(e, n)}>
              {n.multivalued && <ellipse className="shape" rx={ATTR_RX + 4} ry={ATTR_RY + 4} fill="none" />}
              <ellipse className="shape" rx={ATTR_RX} ry={ATTR_RY} strokeDasharray={n.derived ? '4 3' : undefined} />
              <text textAnchor="middle" y={4} textDecoration={n.key ? 'underline' : undefined} fontStyle={n.optional ? 'italic' : undefined}>
                {text}
              </text>
              {n.partialKey && <line x1={-text.length * 3.2} x2={text.length * 3.2} y1={7} y2={7} stroke="#1a1d23" strokeDasharray="3 2" />}
              {n.composite?.length ? (
                <text y={ATTR_RY + 12} textAnchor="middle" className="hint" fontSize={10}>
                  ({n.composite.join(', ')})
                </text>
              ) : null}
            </g>
          )
        })}
      </g>
    </svg>
  )
}
