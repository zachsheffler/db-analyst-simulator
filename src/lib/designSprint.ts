import type { DesignChallenge, ERAttributeRef, EREntityRef, ERRelationshipRef, SchemaTableRef } from '../types/content'
import type { ERDiagram } from '../modules/design/erModel'
import { sameName } from './names'
import { diagramFromReference, layoutDiagram } from './erRef'
import { DEFAULT_POINTS, shuffle } from './questionGen'

/**
 * Diagramming sprint: generated questions about SUBSETS of a design challenge's
 * reference model. A question is a mini-brief (rendered from the reference
 * structure) plus a subset challenge that the ordinary ER / schema graders can
 * score.
 */
export type DesignSprintKind = 'entity' | 'relationship' | 'cluster' | 'schema'

export const KIND_LABELS: Record<DesignSprintKind, string> = {
  entity: 'One entity and its attributes',
  relationship: 'One relationship (cardinality & participation)',
  cluster: 'An entity with all its relationships',
  schema: 'Map an ER fragment to tables',
}

export interface DesignSprintQuestion {
  id: string
  kind: DesignSprintKind
  title: string
  text: string
  difficulty: 1 | 2 | 3 | 4 | 5
  points: number
  /** Subset of the source challenge; graded with gradeER / gradeSchema. */
  challenge: DesignChallenge
  source: DesignChallenge
  /** For schema questions: the ER fragment to draw from (already laid out). */
  reference?: ERDiagram
}

// ---- text rendering ---------------------------------------------------------

export function humanize(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(' ')
    .filter(Boolean)
    .map((w) => (/^ID$/i.test(w) ? 'ID' : /^[A-Z]{2,}$/.test(w) ? w : w.toLowerCase()))
    .join(' ')
}
const lower = (name: string) => humanize(name).toLowerCase().replace(/\bid\b/g, 'ID')
const article = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a')
function list(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

function attrPhrase(a: ERAttributeRef): string {
  const h = humanize(a.name)
  const quals: string[] = []
  if (a.key) quals.push('unique')
  if (a.partialKey) quals.push('unique only within its owner')
  if (a.multivalued) quals.push('there may be several')
  if (a.derived) quals.push('calculated from other data, not stored')
  if (a.optional) quals.push('optional')
  let s = `${article(h)} ${h}`
  if (a.composite?.length) s += ` made up of ${list(a.composite.map(humanize))}`
  if (quals.length) s += ` (${quals.join('; ')})`
  return s
}

export function describeEntity(e: EREntityRef): string {
  const attrs = e.attributes.length ? list(e.attributes.map(attrPhrase)) : 'no attributes'
  return `For each ${lower(e.name)}, record ${attrs}.`
}

function sideSentence(r: ERRelationshipRef, i: 0 | 1): string {
  const me = r.sides[i]
  const other = r.sides[1 - i]
  const unary = r.sides[0].entity === r.sides[1].entity
  const meName = unary && me.role ? `${lower(me.entity)} acting as ${me.role}` : lower(me.entity)
  const otherName = unary && other.role ? `${lower(other.entity)} (as ${other.role})` : lower(other.entity)
  const subj = `Each ${otherName}`
  if (me.max === '1' && me.min === 'mandatory') return `${subj} is linked to exactly one ${meName}.`
  if (me.max === '1') return `${subj} is linked to at most one ${meName}, possibly none.`
  if (me.min === 'mandatory') return `${subj} is linked to one or more ${meName}s.`
  return `${subj} may be linked to many ${meName}s, or none at all.`
}

export function describeRelationship(r: ERRelationshipRef, entities: EREntityRef[]): string {
  const parts = [sideSentence(r, 0), sideSentence(r, 1)]
  const unary = r.sides[0].entity === r.sides[1].entity
  if (unary) parts.unshift(`${r.sides[0].entity} relates to itself${r.sides[0].role && r.sides[1].role ? ` (roles: ${r.sides[0].role} and ${r.sides[1].role})` : ''}.`)
  if (r.attributes?.length) parts.push(`The relationship itself records ${list(r.attributes.map(attrPhrase))}.`)
  if (r.identifying) {
    const weak = entities.find((e) => e.weak && r.sides.some((s) => s.entity === e.name))
    const owner = r.sides.find((s) => s.entity !== weak?.name)?.entity ?? r.sides[0].entity
    if (weak) {
      const pk = weak.attributes.find((a) => a.partialKey)
      parts.push(`${weak.name} cannot exist on its own: ${article(lower(weak.name))} ${lower(weak.name)} is identified by its ${pk ? lower(pk.name) : 'number'} together with its ${lower(owner)}.`)
    }
  }
  return parts.join(' ')
}

// ---- subsets ---------------------------------------------------------------

const keyOnly = (e: EREntityRef): EREntityRef => ({ ...e, attributes: e.attributes.filter((a) => a.key || a.partialKey) })

function tableForEntity(tables: SchemaTableRef[], e: EREntityRef): SchemaTableRef | undefined {
  return tables.find((t) => sameName(t.name, e.name, e.aliases) || sameName(e.name, t.name, t.aliases))
}

/** Reference tables that belong to a subset of entities: their own tables (FKs to outside dropped) plus bridge/multivalued tables between them. */
function subsetTables(tables: SchemaTableRef[], all: EREntityRef[], subset: EREntityRef[]): SchemaTableRef[] | null {
  const own = new Map<string, SchemaTableRef>()
  for (const e of subset) {
    const t = tableForEntity(tables, e)
    if (!t) return null
    own.set(t.name, t)
  }
  const entityTables = new Set(all.map((e) => tableForEntity(tables, e)?.name).filter(Boolean) as string[])
  const aux = tables.filter((t) => !entityTables.has(t.name) && t.fks.length > 0 && t.fks.every((f) => own.has(f.refTable)))
  const keep = new Set([...own.keys(), ...aux.map((t) => t.name)])
  const out: SchemaTableRef[] = []
  for (const t of [...own.values(), ...aux]) {
    const fks = t.fks.filter((f) => keep.has(f.refTable))
    const dropped = new Set(t.fks.filter((f) => !keep.has(f.refTable)).flatMap((f) => f.columns))
    if (t.pk.some((p) => dropped.has(p))) return null
    out.push({ ...t, fks, columns: t.columns.filter((c) => !dropped.has(c.name)) })
  }
  return out
}

function subsetChallenge(src: DesignChallenge, id: string, title: string, text: string, entities: EREntityRef[], relationships: ERRelationshipRef[], withSchema: boolean): DesignChallenge | null {
  let tables: SchemaTableRef[] = []
  let alternates: { tables: SchemaTableRef[] }[] | undefined
  if (withSchema) {
    const t = subsetTables(src.schema.tables, src.er.entities, entities)
    if (!t) return null
    tables = t
    alternates = (src.schema.alternates ?? []).map((a) => subsetTables(a.tables, src.er.entities, entities)).filter((x): x is SchemaTableRef[] => !!x).map((tables) => ({ tables }))
  }
  return {
    id: `${src.id}:${id}`,
    company: src.company,
    title,
    difficulty: src.difficulty,
    brief: text,
    er: { entities, relationships },
    schema: { tables, alternates },
    points: { er: 100, schema: 100, ddl: 100 },
  }
}

// ---- generator -------------------------------------------------------------

function entityDifficulty(e: EREntityRef): 1 | 2 | 3 {
  const flags = e.attributes.filter((a) => a.multivalued || a.derived || a.composite?.length || a.partialKey).length
  if (e.weak || flags >= 2 || e.attributes.length > 7) return 3
  if (flags >= 1 || e.attributes.length > 4) return 2
  return 1
}
function relDifficulty(r: ERRelationshipRef): 2 | 3 | 4 {
  const mn = r.sides[0].max === 'M' && r.sides[1].max === 'M'
  const unary = r.sides[0].entity === r.sides[1].entity
  if ((mn && r.attributes?.length) || unary || r.identifying) return 4
  if (mn || (r.sides[0].max === '1' && r.sides[1].max === '1')) return 3
  return 2
}

export function generateDesignPool(challenges: DesignChallenge[], kinds: DesignSprintKind[]): DesignSprintQuestion[] {
  const out: DesignSprintQuestion[] = []
  for (const src of challenges) {
    const ents = src.er.entities
    const rels = src.er.relationships
    const byName = (n: string) => ents.find((e) => e.name === n)!
    if (kinds.includes('entity')) {
      for (const e of ents) {
        if (e.weak || !e.attributes.length) continue
        const text = `Draw the ${e.name} entity with its attributes, marking each attribute's type.\n\n${describeEntity(e)}`
        const ch = subsetChallenge(src, `e-${e.name}`, `Entity ${e.name}`, text, [e], [], false)
        if (!ch) continue
        const d = entityDifficulty(e)
        out.push({ id: ch.id, kind: 'entity', title: `Entity: ${e.name}`, text, difficulty: d, points: DEFAULT_POINTS[d], challenge: ch, source: src })
      }
    }
    if (kinds.includes('relationship')) {
      for (const r of rels) {
        const a = byName(r.sides[0].entity)
        const b = byName(r.sides[1].entity)
        const unary = a.name === b.name
        const subset = unary ? [keyOnly(a)] : [keyOnly(a), keyOnly(b)]
        const keys = subset.map((e) => `${e.name}: ${e.attributes.map((x) => x.name).join(', ') || '(none)'}`).join('; ')
        const text = `Model the relationship between ${a.name} and ${b.name}. Draw ${unary ? 'the entity' : 'both entities'} with only ${unary ? 'its' : 'their'} identifying attribute${subset.some((e) => e.attributes.length > 1) ? 's' : ''} (${keys}), connect them with a relationship, and set the cardinality and participation on both sides${r.attributes?.length ? ', with any attributes of the relationship' : ''}.\n\n${describeRelationship(r, ents)}`
        const ch = subsetChallenge(src, `r-${r.name}-${a.name}-${b.name}`, `Relationship ${a.name}–${b.name}`, text, subset, [r], false)
        if (!ch) continue
        const d = relDifficulty(r)
        out.push({ id: ch.id, kind: 'relationship', title: `Relationship: ${a.name} – ${b.name}`, text, difficulty: d, points: DEFAULT_POINTS[d], challenge: ch, source: src })
      }
    }
    if (kinds.includes('cluster')) {
      for (const e of ents) {
        const mine = rels.filter((r) => r.sides.some((s) => s.entity === e.name))
        if (mine.length < 2 || mine.length > 3) continue
        const neighbours = new Map<string, EREntityRef>()
        for (const r of mine) for (const s of r.sides) if (s.entity !== e.name) neighbours.set(s.entity, keyOnly(byName(s.entity)))
        // a weak entity needs its full attributes to be drawable
        const subset = [e, ...neighbours.values()].map((x) => (x.weak && x.name !== e.name ? byName(x.name) : x))
        const text = `Draw ${e.name} with all its attributes, plus ${mine.length === 1 ? 'its relationship' : `its ${mine.length} relationships`} with ${list([...neighbours.keys()])} (draw the other entities with just their identifying attributes).\n\n${describeEntity(e)}\n\n${mine.map((r) => describeRelationship(r, ents)).join('\n\n')}`
        const ch = subsetChallenge(src, `c-${e.name}`, `${e.name} and its relationships`, text, subset, mine, false)
        if (!ch) continue
        const d = (Math.min(5, 3 + (mine.length > 2 ? 1 : 0) + (mine.some((r) => relDifficulty(r) >= 4) ? 1 : 0)) as 3 | 4 | 5)
        out.push({ id: ch.id, kind: 'cluster', title: `Cluster: ${e.name}`, text, difficulty: d, points: DEFAULT_POINTS[d], challenge: ch, source: src })
      }
    }
    if (kinds.includes('schema')) {
      for (const r of rels) {
        const a = byName(r.sides[0].entity)
        const b = byName(r.sides[1].entity)
        const subset = a.name === b.name ? [a] : [a, b]
        const text = `Map this ER fragment to relational tables: one table per regular entity, the right primary keys, and foreign keys (or a bridge table) for the relationship. Derived attributes are not stored; multivalued attributes need their own table.`
        const ch = subsetChallenge(src, `s-${r.name}-${a.name}-${b.name}`, `Map ${a.name}–${b.name}`, text, subset, [r], true)
        if (!ch || !ch.schema.tables.length) continue
        const d = (Math.min(5, relDifficulty(r) + (subset.some((e) => e.attributes.some((x) => x.multivalued || x.composite?.length)) ? 1 : 0)) as 2 | 3 | 4 | 5)
        out.push({ id: ch.id, kind: 'schema', title: `Map: ${a.name} – ${b.name}`, text, difficulty: d, points: DEFAULT_POINTS[d], challenge: ch, source: src, reference: layoutDiagram(diagramFromReference(ch)) })
      }
      for (const e of ents) {
        if (!e.attributes.some((a) => a.multivalued) || e.weak) continue
        const text = `Map this entity to relational tables. Remember that a multivalued attribute cannot live in the entity's own table.`
        const ch = subsetChallenge(src, `s-${e.name}`, `Map ${e.name}`, text, [e], [], true)
        if (!ch || ch.schema.tables.length < 2) continue
        out.push({ id: ch.id, kind: 'schema', title: `Map: ${e.name}`, text, difficulty: 3, points: DEFAULT_POINTS[3], challenge: ch, source: src, reference: layoutDiagram(diagramFromReference(ch)) })
      }
    }
  }
  return out
}

/** Shuffle and ramp difficulty like the SQL sprint. */
export function orderPool(pool: DesignSprintQuestion[]): DesignSprintQuestion[] {
  return shuffle(pool).sort((a, b) => Math.floor((a.difficulty - 1) / 2) - Math.floor((b.difficulty - 1) / 2))
}
