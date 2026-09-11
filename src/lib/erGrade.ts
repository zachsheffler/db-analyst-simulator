import type { DesignChallenge, ERAttributeRef, ERRelationshipRef, Notation } from '../types/content'
import type { ERDiagram, ERNode } from '../modules/design/erModel'
import { sameColumn, sameName } from './names'
import { detail, info, item, makeGrade, type Grade, type GradeItem } from './grade'

/**
 * ER grader.
 *
 * Names are used only to pair things up; when they do not match, entities and
 * attributes are paired by structure (attribute counts, attribute types, weak
 * flag, number of relationships). What is graded is the AMOUNT and NATURE of
 * the model: how many entities/attributes/relationships, which attribute types,
 * which cardinalities. Feedback is deliberately broad ("missing two attributes:
 * one derived, one multivalued"); the exact errors are attached as hidden
 * items for the professor chat.
 */

type Flag = 'key' | 'partialKey' | 'multivalued' | 'derived' | 'composite'
const FLAGS: Flag[] = ['key', 'partialKey', 'multivalued', 'derived', 'composite']

function refFlags(a: ERAttributeRef): Set<Flag> {
  const s = new Set<Flag>()
  if (a.key) s.add('key')
  if (a.partialKey) s.add('partialKey')
  if (a.multivalued) s.add('multivalued')
  if (a.derived) s.add('derived')
  if (a.composite?.length) s.add('composite')
  return s
}
function nodeFlags(a: ERNode): Set<Flag> {
  const s = new Set<Flag>()
  if (a.key) s.add('key')
  if (a.partialKey) s.add('partialKey')
  if (a.multivalued) s.add('multivalued')
  if (a.derived) s.add('derived')
  if (a.composite?.length) s.add('composite')
  return s
}
function flagSim(a: Set<Flag>, b: Set<Flag>): number {
  let same = 0
  for (const f of FLAGS) if (a.has(f) === b.has(f)) same++
  return same / FLAGS.length
}

function flagWord(n: Notation, f: Flag | 'plain'): string {
  const t = n.er.terms
  switch (f) {
    case 'key':
      return t.uniqueAttribute
    case 'partialKey':
      return 'partial key'
    case 'multivalued':
      return t.multivalued
    case 'derived':
      return t.derived
    case 'composite':
      return t.composite
    default:
      return 'plain'
  }
}
function natureOf(n: Notation, a: ERAttributeRef): string {
  const fs = [...refFlags(a)]
  return fs.length ? fs.map((f) => flagWord(n, f)).join(' ') : 'plain'
}

const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const num = (k: number) => NUM[k] ?? String(k)
const pluralize = (w: string) => (/[^aeiou]y$/.test(w) ? w.slice(0, -1) + 'ies' : w + 's')
const plural = (k: number, w: string) => `${num(k)} ${k === 1 ? w : pluralize(w)}`

/** Count phrases like "one multivalued, two derived". */
function countPhrase(kinds: string[]): string {
  const counts = new Map<string, number>()
  for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1)
  return [...counts].map(([k, c]) => `${num(c)} ${k}`).join(', ')
}

interface AttrPair {
  ref: ERAttributeRef
  student: ERNode
}

/** Pair reference and student attributes: by name first, then by type/structure. */
function pairAttributes(refAttrs: ERAttributeRef[], studentAttrs: ERNode[], scope: string): { pairs: AttrPair[]; missing: ERAttributeRef[]; extra: ERNode[] } {
  const usedS = new Set<number>()
  const usedR = new Set<number>()
  const pairs: AttrPair[] = []
  refAttrs.forEach((ra, ri) => {
    for (let i = 0; i < studentAttrs.length; i++) {
      if (usedS.has(i)) continue
      if (sameColumn(studentAttrs[i].name, ra.name, ra.aliases, scope)) {
        usedS.add(i)
        usedR.add(ri)
        pairs.push({ ref: ra, student: studentAttrs[i] })
        break
      }
    }
  })
  // structural pass: best flag similarity first
  const cands: { ri: number; si: number; sim: number }[] = []
  refAttrs.forEach((ra, ri) => {
    if (usedR.has(ri)) return
    studentAttrs.forEach((sa, si) => {
      if (usedS.has(si)) return
      cands.push({ ri, si, sim: flagSim(refFlags(ra), nodeFlags(sa)) })
    })
  })
  cands.sort((a, b) => b.sim - a.sim)
  for (const c of cands) {
    if (usedR.has(c.ri) || usedS.has(c.si)) continue
    usedR.add(c.ri)
    usedS.add(c.si)
    pairs.push({ ref: refAttrs[c.ri], student: studentAttrs[c.si] })
  }
  return {
    pairs,
    missing: refAttrs.filter((_, i) => !usedR.has(i)),
    extra: studentAttrs.filter((_, i) => !usedS.has(i)),
  }
}

/** Grade the attributes of one owner (entity or relationship); pushes summary + hidden detail items. */
function gradeAttributes(refAttrs: ERAttributeRef[], studentAttrs: ERNode[], scope: string, ownerLabel: string, n: Notation, items: GradeItem[]): void {
  if (!refAttrs.length && !studentAttrs.length) return
  const t = n.er.terms
  const { pairs, missing, extra } = pairAttributes(refAttrs, studentAttrs, scope)
  const total = refAttrs.length
  const present = pairs.length

  // presence
  if (total) {
    const ok = missing.length === 0
    const text = ok
      ? `${ownerLabel}: all ${plural(total, t.attribute)} present.`
      : `${ownerLabel}: ${present} of ${total} ${pluralize(t.attribute)} present; missing ${num(missing.length)} (${countPhrase(missing.map((m) => natureOf(n, m)))}).`
    items.push(item(ok, 2 * total, text, 2 * present))
    for (const m of missing) items.push(detail(`${ownerLabel}: missing ${natureOf(n, m)} ${t.attribute} "${m.name}".`))
  }

  // types (flags) of paired attributes
  let flagMax = 0
  let flagPts = 0
  const wrong: string[] = []
  for (const { ref: ra, student: sa } of pairs) {
    const who = `${ownerLabel}: "${sa.name || '(unnamed)'}"`
    if (ra.key) {
      flagMax += 2
      if (sa.key) flagPts += 2
      else {
        wrong.push(`should be a ${t.uniqueAttribute}`)
        items.push(detail(`${who} (${ra.name}) should be marked as the ${t.uniqueAttribute} (underlined).`))
      }
    } else if (sa.key && !ra.partialKey) {
      flagMax += 1
      wrong.push(`should not be a ${t.uniqueAttribute}`)
      items.push(detail(`${who} (${ra.name}) should not be a ${t.uniqueAttribute}.`))
    }
    if (ra.partialKey) {
      flagMax += 2
      if (sa.partialKey) flagPts += 2
      else {
        wrong.push('should be a partial key')
        items.push(detail(`${who} (${ra.name}) should be marked as a partial key (dashed underline).`))
      }
    } else if (sa.partialKey) {
      flagMax += 1
      wrong.push('should not be a partial key')
      items.push(detail(`${who} (${ra.name}) is not a partial key.`))
    }
    if (ra.multivalued) {
      flagMax += 2
      if (sa.multivalued) flagPts += 2
      else {
        wrong.push(`should be ${t.multivalued}`)
        items.push(detail(`${who} (${ra.name}) should be ${t.multivalued} (double oval).`))
      }
    } else if (sa.multivalued) {
      flagMax += 1
      wrong.push(`should not be ${t.multivalued}`)
      items.push(detail(`${who} (${ra.name}) is not ${t.multivalued}.`))
    }
    if (ra.derived) {
      flagMax += 2
      if (sa.derived) flagPts += 2
      else {
        wrong.push(`should be ${t.derived}`)
        items.push(detail(`${who} (${ra.name}) should be ${t.derived} (dashed oval).`))
      }
    } else if (sa.derived) {
      flagMax += 1
      wrong.push(`should not be ${t.derived}`)
      items.push(detail(`${who} (${ra.name}) is not ${t.derived}.`))
    }
    if (ra.composite?.length) {
      flagMax += 2
      const want = ra.composite.length
      const have = sa.composite?.length ?? 0
      const hit = Math.min(want, have)
      if (hit === want && have === want) flagPts += 2
      else {
        flagPts += Math.floor((2 * hit) / want)
        wrong.push(have ? `${t.composite} with the wrong number of components` : `should be ${t.composite}`)
        items.push(detail(`${who} (${ra.name}) should be ${t.composite} with ${want} components: ${ra.composite.join(', ')}.`))
      }
    } else if (sa.composite?.length) {
      flagMax += 1
      wrong.push(`should not be ${t.composite}`)
      items.push(detail(`${who} (${ra.name}) is not ${t.composite}.`))
    }
  }
  if (flagMax > 0) {
    const ok = wrong.length === 0
    items.push(item(ok, flagMax, ok ? `${ownerLabel}: ${t.attribute} types all correct.` : `${ownerLabel}: ${plural(wrong.length, `${t.attribute} type`)} wrong (${countPhrase(wrong)}).`, flagPts))
  }
  if (extra.length) {
    items.push(info(`${ownerLabel}: ${plural(extra.length, `extra ${t.attribute}`)} not called for by the brief.`, 'warn'))
    items.push(detail(`${ownerLabel}: extra ${t.attribute}(s): ${extra.map((e) => `"${e.name || '(unnamed)'}"`).join(', ')}.`))
  }
}

/** Structural similarity between a reference entity and a student entity (0..1). */
function entitySim(re: { weak?: boolean; attributes: ERAttributeRef[]; degree: number }, se: { weak?: boolean; attrs: ERNode[]; degree: number }): number {
  const nr = re.attributes.length
  const ns = se.attrs.length
  const countSim = 1 - Math.abs(nr - ns) / Math.max(nr, ns, 1)
  const profile = (flags: Set<Flag>[]) => FLAGS.map((f) => flags.filter((s) => s.has(f)).length)
  const pr = profile(re.attributes.map(refFlags))
  const ps = profile(se.attrs.map(nodeFlags))
  const profSim = pr.reduce((a, v, i) => a + (Math.max(v, ps[i]) === 0 ? 1 : Math.min(v, ps[i]) / Math.max(v, ps[i])), 0) / FLAGS.length
  const weakSim = !!re.weak === !!se.weak ? 1 : 0
  const degSim = 1 - Math.abs(re.degree - se.degree) / Math.max(re.degree, se.degree, 1)
  return (2 * countSim + profSim + weakSim + degSim) / 5
}

export function gradeER(d: ERDiagram, ch: DesignChallenge, n: Notation): Grade {
  const items: GradeItem[] = []
  const t = n.er.terms
  const entities = d.nodes.filter((x) => x.kind === 'entity')
  const rels = d.nodes.filter((x) => x.kind === 'relationship')
  const attrsOf = (id: string) => d.nodes.filter((x) => x.kind === 'attribute' && x.owner === id)
  const degreeOf = (id: string) => rels.filter((r) => r.sides?.some((s) => s.entity === id)).length
  const refDegree = (name: string) => ch.er.relationships.filter((r) => r.sides.some((s) => s.entity === name)).length

  // ---- entities: name pass, then structural pass -------------------------
  const entityMap = new Map<string, ERNode>() // ref entity name -> student node
  const usedEnt = new Set<number>()
  for (const re of ch.er.entities) {
    for (let i = 0; i < entities.length; i++) {
      if (usedEnt.has(i)) continue
      if (sameName(entities[i].name, re.name, re.aliases)) {
        usedEnt.add(i)
        entityMap.set(re.name, entities[i])
        break
      }
    }
  }
  const cands: { re: string; si: number; sim: number }[] = []
  for (const re of ch.er.entities) {
    if (entityMap.has(re.name)) continue
    entities.forEach((se, si) => {
      if (usedEnt.has(si)) return
      cands.push({ re: re.name, si, sim: entitySim({ weak: re.weak, attributes: re.attributes, degree: refDegree(re.name) }, { weak: se.weak, attrs: attrsOf(se.id), degree: degreeOf(se.id) }) })
    })
  }
  cands.sort((a, b) => b.sim - a.sim)
  for (const c of cands) {
    if (entityMap.has(c.re) || usedEnt.has(c.si)) continue
    if (c.sim < 0.45) continue
    usedEnt.add(c.si)
    entityMap.set(c.re, entities[c.si])
    items.push(detail(`${t.entity} "${c.re}" was matched to your "${entities[c.si].name || '(unnamed)'}" by structure (names differ).`))
  }

  const missingEnts = ch.er.entities.filter((e) => !entityMap.has(e.name))
  const presentEnts = ch.er.entities.length - missingEnts.length
  items.push(
    item(
      missingEnts.length === 0,
      6 * ch.er.entities.length,
      missingEnts.length === 0 ? `All ${plural(ch.er.entities.length, t.entity)} present.` : `${presentEnts} of ${ch.er.entities.length} ${pluralize(t.entity)} present; missing ${num(missingEnts.length)}.`,
      6 * presentEnts,
    ),
  )
  for (const m of missingEnts) items.push(detail(`Missing ${t.entity} "${m.name}"${m.weak ? ` (a ${t.weakEntity})` : ''}.`))

  // weak flags
  const weakRefs = ch.er.entities.filter((e) => e.weak && entityMap.has(e.name))
  const weakWrong: string[] = []
  let weakMax = 0
  let weakPts = 0
  for (const e of ch.er.entities) {
    const se = entityMap.get(e.name)
    if (!se) continue
    if (e.weak) {
      weakMax += 3
      if (se.weak) weakPts += 3
      else {
        weakWrong.push(`"${e.name}" should be a ${t.weakEntity}`)
        items.push(detail(`"${e.name}" should be a ${t.weakEntity} (double rectangle).`))
      }
    } else if (se.weak) {
      weakMax += 1
      weakWrong.push(`"${e.name}" should not be a ${t.weakEntity}`)
      items.push(detail(`"${e.name}" is not a ${t.weakEntity}.`))
    }
  }
  if (weakMax > 0) {
    items.push(item(weakWrong.length === 0, weakMax, weakWrong.length === 0 ? `${t.weakEntity} marking correct${weakRefs.length ? '' : ' (none needed)'}.` : `${plural(weakWrong.length, t.entity)} marked wrong as weak/regular.`, weakPts))
  }

  // attributes per entity
  for (const e of ch.er.entities) {
    const se = entityMap.get(e.name)
    if (!se) continue
    gradeAttributes(e.attributes, attrsOf(se.id), e.name, e.name, n, items)
  }
  const extraEnts = entities.filter((_, i) => !usedEnt.has(i))
  if (extraEnts.length) {
    items.push(info(`${plural(extraEnts.length, `extra ${t.entity}`)} not called for. Ask: does the business track this independently, or is it an ${t.attribute} or ${t.relationship}?`, 'warn'))
    items.push(detail(`Extra ${t.entity}(s): ${extraEnts.map((e) => `"${e.name || '(unnamed)'}"`).join(', ')}.`))
    if (extraEnts.length > 2) items.push(item(false, 3, `Too many extra ${pluralize(t.entity)}.`))
  }

  // ---- relationships -----------------------------------------------------
  const usedRel = new Set<number>()
  const cardWord = (r: ERRelationshipRef) => {
    const c = n.er.cardinalityText
    const m = (x: string) => (x === '1' ? c.one : c.many)
    return `${m(r.sides[0].max)}${c.sep}${m(r.sides[1].max)}`
  }
  for (const rr of ch.er.relationships) {
    const a = entityMap.get(rr.sides[0].entity)
    const b = entityMap.get(rr.sides[1].entity)
    const pair = `${rr.sides[0].entity}–${rr.sides[1].entity}`
    const label = `${t.relationship} ${pair}`
    if (!a || !b) {
      items.push(item(false, 8, `${label}: cannot be checked because an ${t.entity} is missing.`))
      continue
    }
    const candidates: number[] = []
    rels.forEach((r, i) => {
      if (usedRel.has(i) || !r.sides) return
      const ids = [r.sides[0].entity, r.sides[1].entity]
      if ((ids[0] === a.id && ids[1] === b.id) || (ids[0] === b.id && ids[1] === a.id)) candidates.push(i)
    })
    if (!candidates.length) {
      items.push(item(false, 8, `Missing a ${t.relationship} between ${rr.sides[0].entity} and ${rr.sides[1].entity}.`))
      items.push(detail(`Missing ${t.relationship} "${rr.name}" (${pair}), ${cardWord(rr)}.${rr.rationale ? ' ' + rr.rationale : ''}`))
      continue
    }
    // prefer a candidate whose cardinality matches best (name-agnostic); fall back to name
    const unary = a.id === b.id
    const orient = (r: ERNode) => {
      const s = r.sides!
      let sA = s[0].entity === a.id ? s[0] : s[1]
      let sB = s[0].entity === a.id ? s[1] : s[0]
      if (unary) {
        const score = (x: typeof sA, y: typeof sB) =>
          (x.max === rr.sides[0].max ? 1 : 0) + (y.max === rr.sides[1].max ? 1 : 0) + (x.min === rr.sides[0].min ? 1 : 0) + (y.min === rr.sides[1].min ? 1 : 0)
        if (score(s[1], s[0]) > score(s[0], s[1])) {
          sA = s[1]
          sB = s[0]
        }
      }
      return { sA, sB }
    }
    const fit = (i: number) => {
      const { sA, sB } = orient(rels[i])
      return (sA.max === rr.sides[0].max ? 1 : 0) + (sB.max === rr.sides[1].max ? 1 : 0) + (sA.min === rr.sides[0].min ? 1 : 0) + (sB.min === rr.sides[1].min ? 1 : 0) + (sameName(rels[i].name, rr.name, rr.aliases) ? 0.5 : 0)
    }
    const pick = candidates.sort((x, y) => fit(y) - fit(x))[0]
    usedRel.add(pick)
    const sr = rels[pick]
    items.push(item(true, 4, `${label} present.`))
    const { sA, sB } = orient(sr)
    const maxA = sA.max === rr.sides[0].max
    const maxB = sB.max === rr.sides[1].max
    items.push(
      item(
        maxA && maxB,
        6,
        maxA && maxB ? `${label}: cardinality correct.` : maxA || maxB ? `${label}: cardinality wrong on one side.` : `${label}: cardinality wrong on both sides.`,
        maxA || maxB ? 3 : 0,
      ),
    )
    if (!(maxA && maxB)) items.push(detail(`${label}: cardinality should be ${cardWord(rr)}.${rr.rationale ? ' ' + rr.rationale : ''}`))
    const minA = sA.min === rr.sides[0].min
    const minB = sB.min === rr.sides[1].min
    items.push(
      item(
        minA && minB,
        4,
        minA && minB ? `${label}: participation correct.` : minA || minB ? `${label}: participation wrong on one side.` : `${label}: participation wrong on both sides.`,
        minA || minB ? 2 : 0,
      ),
    )
    if (!(minA && minB)) {
      const pt = (s: string) => (s === 'mandatory' ? t.mandatory : t.optional)
      items.push(detail(`${label}: participation should be ${pt(rr.sides[0].min)} for ${rr.sides[0].entity} and ${pt(rr.sides[1].min)} for ${rr.sides[1].entity}.${rr.rationale ? ' ' + rr.rationale : ''}`))
    }
    if (rr.identifying) {
      items.push(item(!!sr.identifying, 2, sr.identifying ? `${label}: identifying ${t.relationship} marked.` : `${label}: identifying marking wrong.`))
      if (!sr.identifying) items.push(detail(`${label}: should be an identifying ${t.relationship} (double diamond) because ${rr.sides[1].entity} is a ${t.weakEntity}.`))
    } else if (sr.identifying) {
      items.push(item(false, 1, `${label}: identifying marking wrong.`))
      items.push(detail(`${label}: is not an identifying ${t.relationship}.`))
    }
    if (rr.attributes?.length || attrsOf(sr.id).length) {
      gradeAttributes(rr.attributes ?? [], attrsOf(sr.id), rr.name, label, n, items)
    }
  }
  const extraRels = rels.filter((_, i) => !usedRel.has(i))
  if (extraRels.length) {
    items.push(info(`${plural(extraRels.length, `extra ${t.relationship}`)} not called for.`, 'warn'))
    items.push(detail(`Extra ${t.relationship}(s): ${extraRels.map((r) => `"${r.name || '(unnamed)'}"`).join(', ')}.`))
  }
  // orphan attributes
  const orphans = d.nodes.filter((x) => x.kind === 'attribute' && !d.nodes.some((o) => o.id === x.owner))
  if (orphans.length) items.push(item(false, 2, `${plural(orphans.length, t.attribute)} not attached to anything.`))

  return makeGrade(items, ch.points?.er ?? 100)
}
