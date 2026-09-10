/**
 * Content validator + grader self-test.
 *
 *   npm run validate                 # checks every pack listed in public/packs/manifest.json
 *   npm run validate -- path/to/pack.json ...
 *
 * For each pack it: validates the structure, builds every database, runs every
 * query template (with several random parameter draws), runs every presentation
 * reference query and confirms the "ideal" visual reproduces it, and feeds each
 * design challenge's reference solution through the ER, schema and DDL graders
 * to confirm the reference itself earns full marks.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import initSqlJs from 'sql.js'
import type { ContentPack, DesignChallenge, PresentationChallenge, VisualSpec } from '../src/types/content'
import { assemble, validatePack } from '../src/content/index'
import { generateQuestion } from '../src/lib/questionGen'
import { compareResults } from '../src/lib/resultCompare'
import { buildSql } from '../src/lib/vizQuery'
import { gradeViz } from '../src/lib/vizGrade'
import { gradeER } from '../src/lib/erGrade'
import { gradeSchema, rewriteNames, schemaFromDb } from '../src/lib/schemaGrade'
import type { Cell, ResultSet, TableInfo } from '../src/lib/sqlite'
import { splitStatements } from '../src/lib/sqlSplit'
import type { ERDiagram, ERNode, Schema } from '../src/modules/design/erModel'

const root = process.env.DBSIM_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
let warnings = 0
const fail = (msg: string) => {
  failures++
  console.log(`  ✗ ${msg}`)
}
const warn = (msg: string) => {
  warnings++
  console.log(`  ! ${msg}`)
}
const ok = (msg: string) => console.log(`  ✓ ${msg}`)

// Minimal Node-side stand-in for src/lib/sqlite.ts DB (which imports the wasm via Vite).
const SQL = await initSqlJs()
class NodeDB {
  db = new SQL.Database()
  constructor(statements: string[] = []) {
    this.db.run('PRAGMA foreign_keys = ON;')
    for (const s of statements) this.db.run(s)
  }
  query(sql: string, limit = 5000): ResultSet {
    const stmt = this.db.prepare(sql)
    try {
      const columns = stmt.getColumnNames()
      const rows: Cell[][] = []
      while (stmt.step()) {
        rows.push(stmt.get().map((v) => (v === null || v === undefined ? null : typeof v === 'number' ? v : String(v))))
        if (rows.length >= limit) break
      }
      return { columns, rows }
    } finally {
      stmt.free()
    }
  }
  run(sql: string) {
    this.db.run(sql)
  }
  describe(): TableInfo[] {
    const names = this.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").rows.map((r) => String(r[0]))
    return names.map((name) => {
      const cols = this.query(`PRAGMA table_info("${name}")`).rows.map((r) => ({ name: String(r[1]), type: String(r[2] ?? ''), notnull: Number(r[3]) === 1, pk: Number(r[5]), dflt: r[4] === null ? null : String(r[4]) }))
      const byId = new Map<number, { from: string[]; table: string; to: string[] }>()
      for (const r of this.query(`PRAGMA foreign_key_list("${name}")`).rows) {
        const id = Number(r[0])
        const e = byId.get(id) ?? { from: [], table: String(r[2]), to: [] }
        e.from.push(String(r[3]))
        e.to.push(r[4] === null ? '' : String(r[4]))
        byId.set(id, e)
      }
      const unique: string[] = []
      for (const idx of this.query(`PRAGMA index_list("${name}")`).rows) {
        if (Number(idx[2]) !== 1) continue
        const ic = this.query(`PRAGMA index_info("${String(idx[1])}")`).rows
        if (ic.length === 1) unique.push(String(ic[0][2]))
      }
      return { name, columns: cols, fks: [...byId.values()], unique }
    })
  }
  close() {
    this.db.close()
  }
}

// ---- load packs --------------------------------------------------------------
const args = process.argv.slice(2)
const files = args.length ? args.map((a) => resolve(a)) : (JSON.parse(readFileSync(join(root, 'public/packs/manifest.json'), 'utf8')).packs as string[]).map((f) => join(root, 'public/packs', f))
const packs: ContentPack[] = []
for (const f of files) {
  console.log(`\nPack ${f}`)
  let json: unknown
  try {
    json = JSON.parse(readFileSync(f, 'utf8'))
  } catch (e) {
    fail(`not valid JSON: ${(e as Error).message}`)
    continue
  }
  const errs = validatePack(json)
  if (errs.length) errs.forEach((e) => fail(e))
  else {
    ok('structure valid')
    packs.push(json as ContentPack)
  }
}
const content = assemble(packs)
content.errors.forEach((e) => fail(e))
const n = content.notation

// ---- databases ---------------------------------------------------------------
const dbs = new Map<string, NodeDB>()
for (const [id, d] of content.databases) {
  console.log(`\nDatabase ${id} (${d.name})`)
  try {
    const db = new NodeDB([...d.ddl, ...d.seed])
    dbs.set(id, db)
    for (const t of db.describe()) ok(`${t.name}: ${db.query(`SELECT COUNT(*) FROM "${t.name}"`).rows[0][0]} rows, ${t.columns.length} columns, ${t.fks.length} FK(s)`)
  } catch (e) {
    fail(`could not build: ${(e as Error).message}`)
  }
}

// ---- query sets --------------------------------------------------------------
for (const set of content.queries) {
  console.log(`\nQuery set ${set.id} (${set.questions.length} templates)`)
  const db = dbs.get(set.database)
  if (!db) {
    fail(`database ${set.database} missing`)
    continue
  }
  const topics = new Map<string, number>()
  for (const t of set.questions) {
    topics.set(t.topic, (topics.get(t.topic) ?? 0) + 1)
    let bad = 0
    let empty = 0
    for (let i = 0; i < 5; i++) {
      const g = generateQuestion(db as never, t)
      if (!g) {
        bad++
        continue
      }
      if (!g.expected.rows.length) empty++
      if (/\{\{/.test(g.text) || /\{\{/.test(g.sql)) fail(`${t.id}: unreplaced placeholder`)
    }
    if (bad) fail(`${t.id}: reference SQL failed to run ${bad}/5 draws`)
    else if (empty) warn(`${t.id}: produced an empty result on ${empty}/5 draws`)
  }
  ok(`topics: ${[...topics].map(([k, v]) => `${k}(${v})`).join(', ')}`)
}

// ---- presentation ------------------------------------------------------------
function idealSpec(c: PresentationChallenge): VisualSpec {
  const ex = c.expected
  const type = ex.types[0]
  return {
    type,
    title: 'Reference',
    axis: Array.isArray(ex.axis) ? ex.axis[0] : ex.axis,
    legend: ex.legend,
    values: (ex.values ?? []).map((v) => ({ field: v.field, agg: Array.isArray(v.agg) ? v.agg[0] : v.agg })),
    columns: type === 'table' ? [...(ex.columns ?? []).map((f) => ({ field: f, agg: 'none' as const })), ...(ex.values ?? []).map((v) => ({ field: v.field, agg: Array.isArray(v.agg) ? v.agg[0] : v.agg }))] : undefined,
    filters: ex.filters ?? [],
    sort: ex.sort,
  }
}
for (const c of content.presentation) {
  console.log(`\nPresentation ${c.id}`)
  const db = dbs.get(c.database)
  if (!db) {
    fail(`database ${c.database} missing`)
    continue
  }
  let reference: ResultSet | null = null
  if (c.referenceSql) {
    try {
      reference = db.query(c.referenceSql)
      ok(`referenceSql returns ${reference.rows.length} rows`)
    } catch (e) {
      fail(`referenceSql failed: ${(e as Error).message}`)
    }
  }
  const spec = idealSpec(c)
  // a table with a summed column: mark it as sum
  if (spec.type === 'table' && spec.columns) {
    const model = db.describe()
    spec.columns = spec.columns.map((col) => {
      const t = model.find((x) => x.name === col.field.table)
      const ci = t?.columns.find((x) => x.name === col.field.column)
      const numeric = ci && /int|real|num|dec/i.test(ci.type) && ci.pk === 0 && !t!.fks.some((f) => f.from.includes(ci.name))
      return numeric && col.agg === 'none' ? { ...col, agg: 'sum' } : col
    })
  }
  const built = buildSql(spec, db.describe())
  if (built.error) {
    fail(`ideal visual cannot be built: ${built.error}`)
    continue
  }
  let data: ResultSet | null = null
  try {
    data = db.query(built.sql)
  } catch (e) {
    fail(`ideal visual SQL failed: ${(e as Error).message}\n    ${built.sql}`)
    continue
  }
  if (reference) {
    const cmp = compareResults(data, reference, !!c.expected.sort)
    if (cmp.ok) ok('ideal visual reproduces referenceSql')
    else fail(`ideal visual differs from referenceSql: ${cmp.reason}\n    ${built.sql}`)
  }
  const g = gradeViz({ spec, data, reference, dims: built.dims }, c, n)
  if (g.score === g.max) ok(`ideal visual scores ${g.score}/${g.max}`)
  else fail(`ideal visual scores only ${g.score}/${g.max}: ${g.items.filter((i) => !i.ok).map((i) => i.text).join(' | ')}`)
}

// ---- design ------------------------------------------------------------------
function diagramFromReference(c: DesignChallenge): ERDiagram {
  const nodes: ERNode[] = []
  const ids = new Map<string, string>()
  c.er.entities.forEach((e, i) => {
    const id = `e${i}`
    ids.set(e.name, id)
    nodes.push({ id, kind: 'entity', name: e.name, x: 0, y: 0, weak: e.weak })
    e.attributes.forEach((a, j) => nodes.push({ id: `${id}a${j}`, kind: 'attribute', name: a.name, owner: id, x: 0, y: 0, key: a.key, partialKey: a.partialKey, multivalued: a.multivalued, derived: a.derived, composite: a.composite, optional: a.optional }))
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
function schemaFromReference(c: DesignChallenge): Schema {
  return {
    tables: c.schema.tables.map((t, i) => ({
      id: `t${i}`,
      name: t.name,
      columns: t.columns.map((col, j) => {
        const fk = t.fks.find((f) => f.columns.includes(col.name))
        const refTable = fk ? c.schema.tables.find((x) => x.name === fk.refTable) : undefined
        return { id: `t${i}c${j}`, name: col.name, type: col.type ?? (/id|no$|number|count|qty|rate|price|cost|capacity/i.test(col.name) ? 'INT' : 'VARCHAR(50)'), pk: t.pk.includes(col.name), nullable: !!col.nullable, unique: !!col.unique, fk: fk && refTable ? { table: fk.refTable, column: fk.refColumns?.[fk.columns.indexOf(col.name)] ?? refTable.pk[fk.columns.indexOf(col.name)] } : null }
      }),
    })),
  }
}
function ddlFromSchema(s: Schema): string[] {
  return s.tables.map((t) => {
    const cols = t.columns.map((c) => `${c.name} ${c.type}${c.nullable || c.pk ? '' : ' NOT NULL'}${c.unique && !c.pk ? ' UNIQUE' : ''}`)
    const pk = t.columns.filter((c) => c.pk).map((c) => c.name)
    if (pk.length) cols.push(`PRIMARY KEY (${pk.join(', ')})`)
    for (const c of t.columns) if (c.fk) cols.push(`FOREIGN KEY (${c.name}) REFERENCES ${c.fk.table} (${c.fk.column})`)
    return `CREATE TABLE ${t.name} (${cols.join(', ')})`
  })
}
for (const c of content.design) {
  console.log(`\nDesign ${c.id}`)
  const er = gradeER(diagramFromReference(c), c, n)
  if (er.score === er.max) ok(`reference ER scores ${er.score}/${er.max}`)
  else fail(`reference ER scores only ${er.score}/${er.max}: ${er.items.filter((i) => !i.ok).map((i) => i.text).join(' | ')}`)
  const schema = schemaFromReference(c)
  const sg = gradeSchema(schema, c, n)
  if (sg.grade.score === sg.grade.max) ok(`reference schema scores ${sg.grade.score}/${sg.grade.max}`)
  else fail(`reference schema scores only ${sg.grade.score}/${sg.grade.max}: ${sg.grade.items.filter((i) => !i.ok).map((i) => i.text).join(' | ')}`)
  // DDL: build from reference, introspect, grade, then run tests
  try {
    const db = new NodeDB(ddlFromSchema(schema))
    const introspected = schemaFromDb(db.describe())
    const dg = gradeSchema(introspected, c, n, 70)
    if (dg.grade.score === dg.grade.max) ok(`introspected reference DDL scores ${dg.grade.score}/${dg.grade.max}`)
    else fail(`introspected reference DDL scores only ${dg.grade.score}/${dg.grade.max}: ${dg.grade.items.filter((i) => !i.ok).map((i) => i.text).join(' | ')}`)
    for (const t of c.ddl?.tests ?? []) {
      const sql = rewriteNames(t.sql, dg.map)
      let outcome: 'ok' | 'error' = 'ok'
      let msg = ''
      try {
        for (const s of splitStatements(sql)) db.run(s)
      } catch (e) {
        outcome = 'error'
        msg = (e as Error).message
      }
      if (outcome === t.expect) ok(`test "${t.description}" behaves as expected`)
      else fail(`test "${t.description}" expected ${t.expect} but got ${outcome}${msg ? `: ${msg}` : ''}`)
    }
    db.close()
  } catch (e) {
    fail(`reference DDL failed: ${(e as Error).message}`)
  }
}

console.log(`\n${failures} failure(s), ${warnings} warning(s)`)
process.exit(failures ? 1 : 0)
