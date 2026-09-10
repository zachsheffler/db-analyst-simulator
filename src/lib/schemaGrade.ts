import type { DesignChallenge, Notation, SchemaTableRef } from '../types/content'
import type { Schema, SchemaTable } from '../modules/design/erModel'
import { checkNamingCase, sameColumn, sameName } from './names'
import { info, item, makeGrade, type Grade, type GradeItem } from './grade'
import type { TableInfo } from './sqlite'

/** Mapping from reference names to the student's names, used to rewrite DDL tests. */
export interface NameMap {
  tables: Map<string, string>
  columns: Map<string, Map<string, string>> // refTable -> refCol -> studentCol
}

export interface SchemaGradeResult {
  grade: Grade
  map: NameMap
}

function matchTable(ref: SchemaTableRef, tables: SchemaTable[], used: Set<number>): number {
  for (let i = 0; i < tables.length; i++) {
    if (used.has(i)) continue
    if (sameName(tables[i].name, ref.name, ref.aliases)) return i
  }
  return -1
}

/** Grade against the reference schema and any alternates; the best score wins. */
export function gradeSchema(s: Schema, ch: DesignChallenge, n: Notation, scaleTo?: number): SchemaGradeResult {
  const variants = [ch.schema.tables, ...(ch.schema.alternates ?? []).map((a) => a.tables)]
  let best: SchemaGradeResult | null = null
  for (const tables of variants) {
    const r = gradeSchemaAgainst(s, { ...ch, schema: { ...ch.schema, tables } }, n, scaleTo)
    if (!best || r.grade.score > best.grade.score) best = r
  }
  return best!
}

function gradeSchemaAgainst(s: Schema, ch: DesignChallenge, n: Notation, scaleTo?: number): SchemaGradeResult {
  const items: GradeItem[] = []
  const map: NameMap = { tables: new Map(), columns: new Map() }
  const usedT = new Set<number>()
  const tableMatch = new Map<string, SchemaTable>()

  for (const rt of ch.schema.tables) {
    const idx = matchTable(rt, s.tables, usedT)
    if (idx === -1) {
      items.push(item(false, 6, `Missing table ${rt.name}.${rt.note ? ' ' + rt.note : ''}`))
      continue
    }
    usedT.add(idx)
    tableMatch.set(rt.name, s.tables[idx])
    map.tables.set(rt.name, s.tables[idx].name)
  }

  for (const rt of ch.schema.tables) {
    const st = tableMatch.get(rt.name)
    if (!st) continue
    items.push(item(true, 6, `Table ${rt.name} present.`))
    const colMap = new Map<string, string>()
    map.columns.set(rt.name, colMap)
    const usedC = new Set<number>()
    for (const rc of rt.columns) {
      let found = -1
      for (let i = 0; i < st.columns.length; i++) {
        if (usedC.has(i)) continue
        if (sameColumn(st.columns[i].name, rc.name, rc.aliases, rt.name)) {
          found = i
          break
        }
      }
      if (found === -1) {
        items.push(item(false, 2, `${rt.name}: missing column ${rc.name}.`))
        continue
      }
      usedC.add(found)
      colMap.set(rc.name, st.columns[found].name)
      items.push(item(true, 2, `${rt.name}: column ${rc.name} present.`))
      if (rc.unique) {
        const u = !!st.columns[found].unique || st.columns[found].pk
        items.push(item(u, 2, u ? `${rt.name}: ${rc.name} is UNIQUE.` : `${rt.name}: ${rc.name} should be UNIQUE so that the 1:1 relationship is enforced.`))
      }
    }
    const extras = st.columns.filter((_, i) => !usedC.has(i))
    if (extras.length) items.push(info(`${rt.name}: extra column(s) ${extras.map((c) => c.name).join(', ')}.`, 'warn'))

    // Primary key
    const studentPk = st.columns.filter((c) => c.pk).map((c) => c.name)
    const refPkMapped = rt.pk.map((p) => colMap.get(p)).filter((x): x is string => !!x)
    const pkOk =
      refPkMapped.length === rt.pk.length &&
      studentPk.length === rt.pk.length &&
      refPkMapped.every((p) => studentPk.some((sp) => sp === p))
    items.push(
      item(
        pkOk,
        4,
        pkOk
          ? `${rt.name}: primary key (${rt.pk.join(', ')}) correct.`
          : `${rt.name}: primary key should be (${rt.pk.join(', ')})${studentPk.length ? `, you have (${studentPk.join(', ')})` : ', none declared'}.`,
        refPkMapped.some((p) => studentPk.includes(p)) ? 2 : 0,
      ),
    )

    // Foreign keys
    for (const rf of rt.fks) {
      const targetStudent = tableMatch.get(rf.refTable)
      const mappedCols = rf.columns.map((c) => colMap.get(c))
      const has = mappedCols.every((mc) => {
        if (!mc) return false
        const col = st.columns.find((c) => c.name === mc)
        if (!col?.fk) return false
        return targetStudent ? sameName(col.fk.table, targetStudent.name) : sameName(col.fk.table, rf.refTable)
      })
      items.push(
        item(
          has,
          4,
          has
            ? `${rt.name}: foreign key (${rf.columns.join(', ')}) → ${rf.refTable} correct.`
            : `${rt.name}: (${rf.columns.join(', ')}) should be a foreign key referencing ${rf.refTable}.`,
        ),
      )
    }
    // FK columns that shouldn't be FKs
    const wrongFks = st.columns.filter(
      (c) => c.fk && !rt.fks.some((rf) => rf.columns.some((rc) => colMap.get(rc) === c.name)),
    )
    if (wrongFks.length) items.push(item(false, 1, `${rt.name}: ${wrongFks.map((c) => c.name).join(', ')} should not be foreign key(s).`))
  }

  const extraTables = s.tables.filter((_, i) => !usedT.has(i))
  if (extraTables.length) {
    items.push(info(`Extra table(s): ${extraTables.map((t) => t.name).join(', ')}. Check the mapping rules: each 1:M relationship becomes a foreign key, not a table.`, 'warn'))
    if (extraTables.length > 1) items.push(item(false, 3, 'Too many extra tables.'))
  }
  if (n.relational.namingCase !== 'free') {
    const bad = s.tables.flatMap((t) => [t.name, ...t.columns.map((c) => c.name)]).filter((x) => !checkNamingCase(x, n.relational.namingCase))
    if (bad.length) items.push(info(`Naming style (${n.relational.namingCase}): ${bad.slice(0, 5).join(', ')}${bad.length > 5 ? ', …' : ''}`, 'warn'))
  }
  if (ch.schema.notes?.length) for (const note of ch.schema.notes) items.push(info(note))

  return { grade: makeGrade(items, scaleTo ?? ch.points?.schema ?? 100), map }
}

/** Convert an introspected SQLite database into the student Schema model. */
export function schemaFromDb(tables: TableInfo[]): Schema {
  return {
    tables: tables.map((t) => ({
      id: t.name,
      name: t.name,
      columns: t.columns.map((c) => {
        const fk = t.fks.find((f) => f.from.includes(c.name))
        return {
          id: `${t.name}.${c.name}`,
          name: c.name,
          type: c.type,
          pk: c.pk > 0,
          nullable: !c.notnull && c.pk === 0,
          unique: t.unique.includes(c.name),
          fk: fk ? { table: fk.table, column: fk.to[fk.from.indexOf(c.name)] || '' } : null,
        }
      }),
    })),
  }
}

/** Rewrite a DDL test's canonical names into the student's names. */
export function rewriteNames(sql: string, map: NameMap): string {
  let out = sql
  const pairs: [string, string][] = []
  for (const [ref, st] of map.tables) pairs.push([ref, st])
  for (const [, cols] of map.columns) for (const [ref, st] of cols) pairs.push([ref, st])
  pairs.sort((a, b) => b[0].length - a[0].length)
  for (const [ref, st] of pairs) {
    if (ref === st) continue
    out = out.replace(new RegExp(`\\b${ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), st)
  }
  return out
}
