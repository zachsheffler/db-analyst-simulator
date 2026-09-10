import type { DesignChallenge, ERAttributeRef, ERRelationshipRef, Notation } from '../types/content'
import type { ERDiagram, ERNode } from '../modules/design/erModel'
import { findMatch, sameColumn, sameName } from './names'
import { info, item, makeGrade, type Grade, type GradeItem } from './grade'

function cardText(n: Notation, rel: ERRelationshipRef): string {
  const t = n.er.cardinalityText
  const m = (x: string) => (x === '1' ? t.one : t.many)
  return `${m(rel.sides[0].max)}${t.sep}${m(rel.sides[1].max)}`
}

function gradeAttributes(
  refAttrs: ERAttributeRef[],
  studentAttrs: ERNode[],
  scope: string,
  ownerLabel: string,
  n: Notation,
  items: GradeItem[],
): void {
  const used = new Set<number>()
  for (const ra of refAttrs) {
    let idx = -1
    for (let i = 0; i < studentAttrs.length; i++) {
      if (used.has(i)) continue
      if (sameColumn(studentAttrs[i].name, ra.name, ra.aliases, scope)) {
        idx = i
        break
      }
    }
    if (idx === -1) {
      items.push(item(false, 2, `${ownerLabel}: missing ${n.er.terms.attribute} "${ra.name}".`))
      continue
    }
    used.add(idx)
    const sa = studentAttrs[idx]
    items.push(item(true, 2, `${ownerLabel}: ${n.er.terms.attribute} "${ra.name}" present.`))
    if (ra.key) {
      items.push(
        item(!!sa.key, 2, sa.key ? `${ownerLabel}: "${ra.name}" marked as ${n.er.terms.uniqueAttribute}.` : `${ownerLabel}: "${ra.name}" should be a ${n.er.terms.uniqueAttribute}.`),
      )
    } else if (sa.key && !ra.partialKey) {
      items.push(item(false, 1, `${ownerLabel}: "${sa.name}" should not be a ${n.er.terms.uniqueAttribute}.`))
    }
    if (ra.partialKey) {
      items.push(
        item(!!sa.partialKey, 2, sa.partialKey ? `${ownerLabel}: "${ra.name}" is a partial key.` : `${ownerLabel}: "${ra.name}" should be marked as a partial key (dashed underline).`),
      )
    }
    if (ra.multivalued) {
      items.push(
        item(!!sa.multivalued, 2, sa.multivalued ? `${ownerLabel}: "${ra.name}" is ${n.er.terms.multivalued}.` : `${ownerLabel}: "${ra.name}" should be ${n.er.terms.multivalued} (double oval).`),
      )
    } else if (sa.multivalued) {
      items.push(item(false, 1, `${ownerLabel}: "${sa.name}" is not ${n.er.terms.multivalued}.`))
    }
    if (ra.derived) {
      items.push(
        item(!!sa.derived, 2, sa.derived ? `${ownerLabel}: "${ra.name}" is ${n.er.terms.derived}.` : `${ownerLabel}: "${ra.name}" should be ${n.er.terms.derived} (dashed oval).`),
      )
    } else if (sa.derived) {
      items.push(item(false, 1, `${ownerLabel}: "${sa.name}" is not ${n.er.terms.derived}.`))
    }
    if (ra.composite?.length) {
      const comps = sa.composite ?? []
      const hit = ra.composite.filter((c) => comps.some((s) => sameName(s, c))).length
      items.push(
        item(
          hit === ra.composite.length,
          2,
          hit === ra.composite.length
            ? `${ownerLabel}: "${ra.name}" is ${n.er.terms.composite} with components ${ra.composite.join(', ')}.`
            : `${ownerLabel}: "${ra.name}" should be ${n.er.terms.composite} with components ${ra.composite.join(', ')}.`,
          (2 * hit) / ra.composite.length,
        ),
      )
    }
  }
  const extras = studentAttrs.filter((_, i) => !used.has(i))
  if (extras.length) {
    items.push(info(`${ownerLabel}: extra ${n.er.terms.attribute}(s) not in the requirements: ${extras.map((e) => `"${e.name}"`).join(', ')}.`, 'warn'))
  }
}

export function gradeER(d: ERDiagram, ch: DesignChallenge, n: Notation): Grade {
  const items: GradeItem[] = []
  const entities = d.nodes.filter((x) => x.kind === 'entity')
  const rels = d.nodes.filter((x) => x.kind === 'relationship')
  const attrsOf = (id: string) => d.nodes.filter((x) => x.kind === 'attribute' && x.owner === id)

  // Entities
  const entityMap = new Map<string, ERNode>() // ref entity name -> student node
  const usedEnt = new Set<number>()
  for (const re of ch.er.entities) {
    const idx = findMatch(re.name, entities, (e) => ({ name: e.name }), usedEnt)
    let found = idx
    if (found === -1) {
      // try aliases the other way round
      for (let i = 0; i < entities.length; i++) {
        if (usedEnt.has(i)) continue
        if (sameName(entities[i].name, re.name, re.aliases)) {
          found = i
          break
        }
      }
    }
    if (found === -1) {
      items.push(item(false, 6, `Missing ${n.er.terms.entity} "${re.name}".`))
      continue
    }
    usedEnt.add(found)
    const se = entities[found]
    entityMap.set(re.name, se)
    items.push(item(true, 6, `${n.er.terms.entity} "${re.name}" present.`))
    if (re.weak) {
      items.push(item(!!se.weak, 3, se.weak ? `"${re.name}" is a ${n.er.terms.weakEntity}.` : `"${re.name}" should be a ${n.er.terms.weakEntity} (double rectangle).`))
    } else if (se.weak) {
      items.push(item(false, 1, `"${se.name}" is not a ${n.er.terms.weakEntity}.`))
    }
    gradeAttributes(re.attributes, attrsOf(se.id), re.name, `${n.er.terms.entity} "${re.name}"`, n, items)
  }
  const extraEnts = entities.filter((_, i) => !usedEnt.has(i))
  if (extraEnts.length) {
    items.push(
      info(
        `Extra ${n.er.terms.entity}(s) not called for: ${extraEnts.map((e) => `"${e.name}"`).join(', ')}. Ask: does the business track this independently, or is it an ${n.er.terms.attribute} or ${n.er.terms.relationship}?`,
        'warn',
      ),
    )
    if (extraEnts.length > 2) items.push(item(false, 3, 'Too many extra entities.'))
  }

  // Relationships
  const usedRel = new Set<number>()
  for (const rr of ch.er.relationships) {
    const a = entityMap.get(rr.sides[0].entity)
    const b = entityMap.get(rr.sides[1].entity)
    const label = `${n.er.terms.relationship} "${rr.name}" (${rr.sides[0].entity}–${rr.sides[1].entity})`
    if (!a || !b) {
      items.push(item(false, 8, `${label}: cannot be checked because an ${n.er.terms.entity} is missing.`))
      continue
    }
    const candidates: number[] = []
    rels.forEach((r, i) => {
      if (usedRel.has(i) || !r.sides) return
      const ids = [r.sides[0].entity, r.sides[1].entity]
      if ((ids[0] === a.id && ids[1] === b.id) || (ids[0] === b.id && ids[1] === a.id)) candidates.push(i)
    })
    if (!candidates.length) {
      items.push(item(false, 8, `Missing ${label}.`))
      continue
    }
    let pick = candidates.find((i) => sameName(rels[i].name, rr.name, rr.aliases)) ?? candidates[0]
    usedRel.add(pick)
    const sr = rels[pick]
    items.push(item(true, 4, `${label} present.`))
    // orient student sides to reference order
    const sides = sr.sides!
    const unary = a.id === b.id
    let sA = sides[0].entity === a.id ? sides[0] : sides[1]
    let sB = sides[0].entity === a.id ? sides[1] : sides[0]
    if (unary) {
      // best orientation: choose the one with more matches
      const score = (x: typeof sA, y: typeof sB) =>
        (x.max === rr.sides[0].max ? 1 : 0) + (y.max === rr.sides[1].max ? 1 : 0) + (x.min === rr.sides[0].min ? 1 : 0) + (y.min === rr.sides[1].min ? 1 : 0)
      if (score(sides[1], sides[0]) > score(sides[0], sides[1])) {
        sA = sides[1]
        sB = sides[0]
      }
    }
    const maxOk = sA.max === rr.sides[0].max && sB.max === rr.sides[1].max
    items.push(
      item(
        maxOk,
        6,
        maxOk
          ? `${label}: cardinality ${cardText(n, rr)} correct.`
          : `${label}: cardinality should be ${cardText(n, rr)}.${rr.rationale ? ' ' + rr.rationale : ''}`,
        sA.max === rr.sides[0].max || sB.max === rr.sides[1].max ? 3 : 0,
      ),
    )
    const minA = sA.min === rr.sides[0].min
    const minB = sB.min === rr.sides[1].min
    const pt = (s: string) => (s === 'mandatory' ? n.er.terms.mandatory : n.er.terms.optional)
    items.push(
      item(
        minA && minB,
        4,
        minA && minB
          ? `${label}: participation correct.`
          : `${label}: participation should be ${pt(rr.sides[0].min)} for ${rr.sides[0].entity} and ${pt(rr.sides[1].min)} for ${rr.sides[1].entity}.`,
        minA || minB ? 2 : 0,
      ),
    )
    if (rr.identifying) {
      items.push(item(!!sr.identifying, 2, sr.identifying ? `${label}: identifying relationship.` : `${label}: should be an identifying relationship (double diamond).`))
    }
    if (rr.attributes?.length) {
      gradeAttributes(rr.attributes, attrsOf(sr.id), rr.name, label, n, items)
    }
  }
  const extraRels = rels.filter((_, i) => !usedRel.has(i))
  if (extraRels.length) {
    items.push(info(`Extra ${n.er.terms.relationship}(s): ${extraRels.map((r) => `"${r.name || '(unnamed)'}"`).join(', ')}.`, 'warn'))
  }
  // orphan attributes
  const orphans = d.nodes.filter((x) => x.kind === 'attribute' && !d.nodes.some((o) => o.id === x.owner))
  if (orphans.length) items.push(item(false, 2, `${orphans.length} ${n.er.terms.attribute}(s) are not attached to anything.`))

  return makeGrade(items, ch.points?.er ?? 100)
}
