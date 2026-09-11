import { createContext, useContext } from 'react'
import {
  PACK_FORMAT,
  type Company,
  type ContentPack,
  type DatabaseDef,
  type DesignChallenge,
  type Notation,
  type PresentationChallenge,
  type QuerySet,
  type VizSet,
} from '../types/content'
import { DEFAULT_NOTATION } from './defaultNotation'

export interface Content {
  packs: ContentPack[]
  notation: Notation
  companies: Company[]
  databases: Map<string, DatabaseDef>
  design: DesignChallenge[]
  queries: QuerySet[]
  presentation: PresentationChallenge[]
  vizSprints: VizSet[]
  errors: string[]
}

const USER_PACKS_KEY = 'dbsim.userPacks.v1'

export function loadUserPacks(): ContentPack[] {
  try {
    const raw = localStorage.getItem(USER_PACKS_KEY)
    return raw ? (JSON.parse(raw) as ContentPack[]) : []
  } catch {
    return []
  }
}

export function saveUserPacks(packs: ContentPack[]): void {
  localStorage.setItem(USER_PACKS_KEY, JSON.stringify(packs))
}

function deepMerge<T>(base: T, over: Partial<T> | undefined): T {
  if (!over) return base
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(over)) {
    const b = (base as Record<string, unknown>)[k]
    if (v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object' && !Array.isArray(b)) {
      out[k] = deepMerge(b, v as Partial<typeof b>)
    } else if (v !== undefined) out[k] = v
  }
  return out as T
}

/** Quick structural validation; returns a list of problems (empty if OK). */
export function validatePack(p: unknown): string[] {
  const errs: string[] = []
  if (!p || typeof p !== 'object') return ['Pack is not an object.']
  const pk = p as Partial<ContentPack>
  if (pk.format !== PACK_FORMAT) errs.push(`format must be "${PACK_FORMAT}".`)
  if (!pk.id) errs.push('Missing pack id.')
  if (!pk.title) errs.push('Missing pack title.')
  for (const d of pk.databases ?? []) {
    if (!d.id || !Array.isArray(d.ddl) || !Array.isArray(d.seed)) errs.push(`Database "${d.id ?? '?'}" needs id, ddl[], seed[].`)
  }
  for (const c of pk.companies ?? []) {
    if (!c.id || !c.name || !['easy', 'medium', 'hard'].includes(c.tier)) errs.push(`Company "${c.id ?? '?'}" needs id, name, tier (easy|medium|hard).`)
  }
  for (const c of pk.design ?? []) {
    if (!c.id || !c.company || !c.brief || !c.er?.entities || !c.schema?.tables) errs.push(`Design challenge "${c.id ?? '?'}" needs id, company, brief, er.entities, schema.tables.`)
    for (const r of c.er?.relationships ?? []) {
      if (!r.sides || r.sides.length !== 2) errs.push(`Relationship "${r.name}" in "${c.id}" must have exactly two sides.`)
      for (const s of r.sides ?? []) {
        if (!c.er.entities.some((e) => e.name === s.entity)) errs.push(`Relationship "${r.name}" in "${c.id}" references unknown entity "${s.entity}".`)
      }
    }
    for (const t of c.schema?.tables ?? []) {
      for (const f of t.fks ?? []) {
        if (!c.schema.tables.some((x) => x.name === f.refTable)) errs.push(`Table "${t.name}" in "${c.id}" has FK to unknown table "${f.refTable}".`)
      }
    }
  }
  for (const q of pk.queries ?? []) {
    if (!q.id || !q.company || !q.database || !Array.isArray(q.questions)) errs.push(`Query set "${q.id ?? '?'}" needs id, company, database, questions[].`)
    for (const t of q.questions ?? []) if (!t.id || !t.text || !t.sql) errs.push(`Question "${t.id ?? '?'}" in "${q.id}" needs id, text, sql.`)
  }
  for (const c of pk.presentation ?? []) {
    if (!c.id || !c.company || !c.database || !c.brief || !c.expected?.types?.length) errs.push(`Presentation challenge "${c.id ?? '?'}" needs id, company, database, brief, expected.types[].`)
  }
  for (const v of pk.vizSprints ?? []) {
    if (!v.id || !v.company || !v.database || !Array.isArray(v.questions)) errs.push(`Viz sprint set "${v.id ?? '?'}" needs id, company, database, questions[].`)
    for (const t of v.questions ?? []) if (!t.id || !t.text || !t.sql || !t.types?.length) errs.push(`Viz question "${t.id ?? '?'}" in "${v.id}" needs id, text, sql, types[].`)
  }
  return errs
}

export function assemble(packs: ContentPack[], errors: string[] = []): Content {
  let notation = DEFAULT_NOTATION
  const companies: Company[] = []
  const databases = new Map<string, DatabaseDef>()
  const design: DesignChallenge[] = []
  const queries: QuerySet[] = []
  const presentation: PresentationChallenge[] = []
  const vizSprints: VizSet[] = []
  for (const p of packs) {
    if (p.notation) notation = deepMerge(notation, p.notation)
    for (const c of p.companies ?? []) if (!companies.some((x) => x.id === c.id)) companies.push(c)
    for (const d of p.databases ?? []) databases.set(d.id, d)
    design.push(...(p.design ?? []))
    queries.push(...(p.queries ?? []))
    presentation.push(...(p.presentation ?? []))
    vizSprints.push(...(p.vizSprints ?? []))
  }
  for (const v of vizSprints) if (!databases.has(v.database)) errors.push(`Viz sprint set "${v.id}" references unknown database "${v.database}".`)
  for (const q of queries) if (!databases.has(q.database)) errors.push(`Query set "${q.id}" references unknown database "${q.database}".`)
  for (const c of presentation) if (!databases.has(c.database)) errors.push(`Presentation challenge "${c.id}" references unknown database "${c.database}".`)
  const known = new Set(companies.map((c) => c.id))
  for (const x of [...design, ...queries, ...presentation, ...vizSprints]) if (!known.has(x.company)) errors.push(`"${x.id}" references unknown company "${x.company}".`)
  const order: Record<string, number> = { easy: 0, medium: 1, hard: 2 }
  companies.sort((a, b) => order[a.tier] - order[b.tier])
  return { packs, notation, companies, databases, design, queries, presentation, vizSprints, errors }
}

/** Load packs listed in public/packs/manifest.json, plus any user-imported packs. */
export async function loadContent(): Promise<Content> {
  const errors: string[] = []
  const packs: ContentPack[] = []
  try {
    const base = import.meta.env.BASE_URL.replace(/\/?$/, '/')
    const res = await fetch(`${base}packs/manifest.json`)
    const manifest = (await res.json()) as { packs: string[] }
    for (const file of manifest.packs) {
      try {
        const r = await fetch(`${base}packs/${file}`)
        const json = await r.json()
        const errs = validatePack(json)
        if (errs.length) errors.push(`${file}: ${errs.join(' ')}`)
        else packs.push(json as ContentPack)
      } catch (e) {
        errors.push(`${file}: ${(e as Error).message}`)
      }
    }
  } catch (e) {
    errors.push(`Could not load packs/manifest.json: ${(e as Error).message}`)
  }
  for (const p of loadUserPacks()) {
    const errs = validatePack(p)
    if (errs.length) errors.push(`Imported pack ${p.id ?? '?'}: ${errs.join(' ')}`)
    else packs.push(p)
  }
  return assemble(packs, errors)
}

export const ContentContext = createContext<Content | null>(null)
export function useContent(): Content {
  const c = useContext(ContentContext)
  if (!c) throw new Error('Content not loaded')
  return c
}
