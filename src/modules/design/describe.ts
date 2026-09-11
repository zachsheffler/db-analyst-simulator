import type { ERDiagram, Schema } from './erModel'

/** Plain-text summary of a student's ER diagram (for the professor chat). */
export function describeDiagram(d: ERDiagram): string {
  const ents = d.nodes.filter((n) => n.kind === 'entity')
  const rels = d.nodes.filter((n) => n.kind === 'relationship')
  if (!d.nodes.length) return '(empty diagram)'
  const attr = (ownerId: string) =>
    d.nodes
      .filter((a) => a.kind === 'attribute' && a.owner === ownerId)
      .map((a) => {
        const f = [a.key && 'key', a.partialKey && 'partial key', a.multivalued && 'multivalued', a.derived && 'derived', a.optional && 'optional', a.composite?.length && `composite(${a.composite.join(',')})`].filter(Boolean)
        return `${a.name || '?'}${f.length ? ` [${f.join(', ')}]` : ''}`
      })
      .join(', ')
  const lines = ents.map((e) => `Entity ${e.name || '?'}${e.weak ? ' (weak)' : ''}: ${attr(e.id) || 'no attributes'}`)
  for (const r of rels) {
    if (!r.sides) continue
    const nm = (id: string) => ents.find((e) => e.id === id)?.name || '?'
    const s = r.sides.map((x) => `${nm(x.entity)} max ${x.max} ${x.min}${x.role ? ` role ${x.role}` : ''}`).join(' — ')
    lines.push(`Relationship ${r.name || '(unnamed)'}${r.identifying ? ' (identifying)' : ''}: ${s}${attr(r.id) ? `; attributes ${attr(r.id)}` : ''}`)
  }
  return lines.join('\n')
}

/** Plain-text summary of a student's relational schema. */
export function describeSchema(s: Schema): string {
  if (!s.tables.length) return '(no tables yet)'
  return s.tables
    .map((t) => {
      const cols = t.columns.map((c) => `${c.name || '?'} ${c.type}${c.pk ? ' PK' : ''}${c.fk ? ` FK→${c.fk.table}.${c.fk.column}` : ''}${c.unique ? ' UNIQUE' : ''}${c.nullable ? ' NULL' : ''}`).join(', ')
      return `${t.name || '?'} (${cols})`
    })
    .join('\n')
}
