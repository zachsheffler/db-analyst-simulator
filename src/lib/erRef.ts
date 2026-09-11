import type { DesignChallenge } from '../types/content'
import type { ERDiagram, ERNode } from '../modules/design/erModel'

/** Build a student-model diagram from a challenge's reference solution (positions are all 0; run layoutDiagram). */
export function diagramFromReference(c: DesignChallenge): ERDiagram {
  const nodes: ERNode[] = []
  const ids = new Map<string, string>()
  c.er.entities.forEach((e, i) => {
    const id = `e${i}`
    ids.set(e.name, id)
    nodes.push({ id, kind: 'entity', name: e.name, x: 0, y: 0, weak: e.weak })
    e.attributes.forEach((a, j) =>
      nodes.push({ id: `${id}a${j}`, kind: 'attribute', name: a.name, owner: id, x: 0, y: 0, key: a.key, partialKey: a.partialKey, multivalued: a.multivalued, derived: a.derived, composite: a.composite, optional: a.optional }),
    )
  })
  c.er.relationships.forEach((r, i) => {
    const id = `r${i}`
    nodes.push({
      id,
      kind: 'relationship',
      name: r.name,
      x: 0,
      y: 0,
      identifying: r.identifying,
      sides: [
        { entity: ids.get(r.sides[0].entity)!, max: r.sides[0].max, min: r.sides[0].min, role: r.sides[0].role },
        { entity: ids.get(r.sides[1].entity)!, max: r.sides[1].max, min: r.sides[1].min, role: r.sides[1].role },
      ],
    })
    r.attributes?.forEach((a, j) => nodes.push({ id: `${id}a${j}`, kind: 'attribute', name: a.name, owner: id, x: 0, y: 0, key: a.key, multivalued: a.multivalued, derived: a.derived, composite: a.composite }))
  })
  return { nodes }
}

/** Place attributes in a fan around their owner. */
export function autoPlaceAttribute(owner: { x: number; y: number }, existing: number): { x: number; y: number } {
  const angles = [-90, -50, -130, -20, -160, 20, 200, 50, 230, 90]
  const a = ((angles[existing % angles.length] ?? -90) * Math.PI) / 180
  const r = existing >= 10 ? 150 : 105
  return { x: owner.x + Math.cos(a) * r, y: owner.y + Math.sin(a) * r }
}

/** Simple automatic layout: entities on a grid, relationships between their entities, attributes fanned out. */
export function layoutDiagram(d: ERDiagram): ERDiagram {
  const nodes = d.nodes.map((n) => ({ ...n }))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const entities = nodes.filter((n) => n.kind === 'entity')
  const cols = entities.length <= 2 ? entities.length : entities.length <= 4 ? 2 : 3
  entities.forEach((e, i) => {
    e.x = 200 + (i % Math.max(1, cols)) * 360
    e.y = 160 + Math.floor(i / Math.max(1, cols)) * 300
  })
  const rels = nodes.filter((n) => n.kind === 'relationship')
  const pairCount = new Map<string, number>()
  for (const r of rels) {
    if (!r.sides) continue
    const a = byId.get(r.sides[0].entity)
    const b = byId.get(r.sides[1].entity)
    if (!a || !b) continue
    const key = [a.id, b.id].sort().join('|')
    const k = pairCount.get(key) ?? 0
    pairCount.set(key, k + 1)
    if (a.id === b.id) {
      r.x = a.x + 190
      r.y = a.y - 90 - k * 90
    } else {
      // perpendicular offset for parallel relationships
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy) || 1
      const off = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 70
      r.x = (a.x + b.x) / 2 + (-dy / len) * off
      r.y = (a.y + b.y) / 2 + (dx / len) * off
    }
  }
  const counts = new Map<string, number>()
  for (const n of nodes) {
    if (n.kind !== 'attribute' || !n.owner) continue
    const owner = byId.get(n.owner)
    if (!owner) continue
    const k = counts.get(owner.id) ?? 0
    counts.set(owner.id, k + 1)
    const p = autoPlaceAttribute(owner, k)
    n.x = p.x
    n.y = p.y
  }
  return { nodes }
}
