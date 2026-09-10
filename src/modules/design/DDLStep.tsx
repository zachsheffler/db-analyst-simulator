import { useEffect, useState, type MutableRefObject } from 'react'
import type { DesignChallenge, Notation } from '../../types/content'
import type { Schema } from './erModel'
import { DB, splitStatements, type TableInfo } from '../../lib/sqlite'
import { gradeSchema, rewriteNames, schemaFromDb } from '../../lib/schemaGrade'
import { item, makeGrade, type Grade } from '../../lib/grade'
import { SchemaSidebar } from '../../components/SchemaSidebar'

interface Props {
  challenge: DesignChallenge
  notation: Notation
  schema: Schema
  sql: string
  onChange: (sql: string) => void
  onGraded: (g: Grade) => void
  checkRef: MutableRefObject<(() => void | Promise<void>) | null>
}

function skeletonFromSchema(s: Schema): string {
  if (!s.tables.length) return ''
  return s.tables
    .map((t) => {
      const cols = t.columns.map((c) => `  ${c.name} ${c.type}${c.nullable ? '' : ' NOT NULL'}${c.unique && !c.pk ? ' UNIQUE' : ''}`)
      const pk = t.columns.filter((c) => c.pk).map((c) => c.name)
      if (pk.length) cols.push(`  PRIMARY KEY (${pk.join(', ')})`)
      for (const c of t.columns) if (c.fk) cols.push(`  FOREIGN KEY (${c.name}) REFERENCES ${c.fk.table} (${c.fk.column})`)
      return `CREATE TABLE ${t.name} (\n${cols.join(',\n')}\n);`
    })
    .join('\n\n')
}

export function DDLStep({ challenge, notation, schema, sql, onChange, onGraded, checkRef }: Props) {
  const [log, setLog] = useState<{ ok: boolean; text: string }[]>([])
  const [tables, setTables] = useState<TableInfo[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    checkRef.current = () => run(true)
    return () => {
      checkRef.current = null
    }
  })

  const run = async (andGrade: boolean) => {
    setBusy(true)
    const out: { ok: boolean; text: string }[] = []
    let db: DB | null = null
    try {
      db = await DB.create()
      const stmts = splitStatements(sql)
      let errors = 0
      for (const s of stmts) {
        try {
          db.run(s)
          out.push({ ok: true, text: s.split('\n')[0].slice(0, 80) })
        } catch (e) {
          errors++
          out.push({ ok: false, text: `${s.split('\n')[0].slice(0, 60)} → ${(e as Error).message}` })
        }
      }
      const info = db.describe()
      setTables(info)
      if (andGrade) {
        const studentSchema = schemaFromDb(info)
        const { grade: g, map } = gradeSchema(studentSchema, challenge, notation, 70)
        const items = [...g.items.map((i) => ({ ...i, text: i.text }))]
        items.unshift(item(errors === 0, 10, errors === 0 ? 'All statements executed without errors.' : `${errors} statement(s) failed. See the log.`))
        // NOT NULL on PK columns is implicit; check FK columns and required columns loosely
        const tests = challenge.ddl?.tests ?? []
        for (const t of tests) {
          const rewritten = rewriteNames(t.sql, map)
          let ok: boolean
          let detail = ''
          try {
            db.run(rewritten)
            ok = t.expect === 'ok'
            if (!ok) detail = ' (the statement succeeded but should have been rejected)'
          } catch (e) {
            ok = t.expect === 'error'
            if (!ok) detail = ` (${(e as Error).message})`
          }
          items.push(item(ok, 20 / Math.max(1, tests.length), `${t.description}${ok ? '' : detail}`))
        }
        onGraded(makeGrade(items, challenge.points?.ddl ?? 100))
      }
    } catch (e) {
      out.push({ ok: false, text: (e as Error).message })
    } finally {
      db?.close()
      setBusy(false)
      setLog(out)
    }
  }

  return (
    <div className="query-layout">
      <div>
        <div className="panel">
          <div className="panel-head">Tables created</div>
          <div className="panel-body">
            {tables.length ? <SchemaSidebar tables={tables} /> : <span className="muted">Run your script to see the resulting tables.</span>}
          </div>
        </div>
      </div>
      <div>
        <div className="row" style={{ marginBottom: 8 }}>
          <button onClick={() => onChange(skeletonFromSchema(schema))} disabled={!schema.tables.length} title="Generate CREATE TABLE statements from your schema step as a starting point">
            Draft from my schema
          </button>
          <span style={{ flex: 1 }} />
          <button onClick={() => run(false)} disabled={busy || !sql.trim()}>
            Run script
          </button>
        </div>
        <textarea className="code" style={{ minHeight: 260 }} value={sql} onChange={(e) => onChange(e.target.value)} placeholder={'CREATE TABLE ... (\n  ...\n);'} spellCheck={false} />
        {log.length > 0 && (
          <div className="panel" style={{ marginTop: 8 }}>
            <div className="panel-head">Execution log</div>
            <div className="panel-body" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
              {log.map((l, i) => (
                <div key={i} style={{ color: l.ok ? 'var(--good)' : 'var(--bad)' }}>
                  {l.ok ? '✓' : '✗'} {l.text}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
