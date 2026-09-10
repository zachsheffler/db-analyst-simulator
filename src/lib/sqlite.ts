import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

let sqlPromise: Promise<SqlJsStatic> | null = null

export function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) sqlPromise = initSqlJs({ locateFile: () => wasmUrl })
  return sqlPromise
}

export type Cell = string | number | null
export interface ResultSet {
  columns: string[]
  rows: Cell[][]
}

export interface ColumnInfo {
  name: string
  type: string
  notnull: boolean
  pk: number // 0 = not pk, else 1-based position in pk
  dflt: string | null
}
export interface FKInfo {
  from: string[]
  table: string
  to: string[]
}
export interface TableInfo {
  name: string
  columns: ColumnInfo[]
  fks: FKInfo[]
  /** Columns covered by a single-column UNIQUE constraint. */
  unique: string[]
}

function toCell(v: unknown): Cell {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return v
  if (typeof v === 'bigint') return Number(v)
  if (v instanceof Uint8Array) return `<blob ${v.length}b>`
  return String(v)
}

export class DB {
  private db: Database
  private constructor(db: Database) {
    this.db = db
  }

  static async create(statements: string[] = []): Promise<DB> {
    const SQL = await getSql()
    const db = new DB(new SQL.Database())
    db.db.run('PRAGMA foreign_keys = ON;')
    for (const s of statements) db.db.run(s)
    return db
  }

  /** Execute one or more statements; returns all result sets produced. */
  exec(sql: string): ResultSet[] {
    const out = this.db.exec(sql)
    return out.map((r) => ({ columns: r.columns, rows: r.values.map((row) => row.map(toCell)) }))
  }

  /** Execute a single SELECT, returning at most `limit` rows. */
  query(sql: string, limit = 5000): ResultSet {
    const stmt = this.db.prepare(sql)
    try {
      const columns = stmt.getColumnNames()
      const rows: Cell[][] = []
      while (stmt.step()) {
        rows.push(stmt.get().map(toCell))
        if (rows.length >= limit) break
      }
      return { columns, rows }
    } finally {
      stmt.free()
    }
  }

  run(sql: string): void {
    this.db.run(sql)
  }

  tables(): string[] {
    return this.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ).rows.map((r) => String(r[0]))
  }

  describe(): TableInfo[] {
    return this.tables().map((name) => this.describeTable(name))
  }

  describeTable(name: string): TableInfo {
    const quoted = `"${name.replace(/"/g, '""')}"`
    const cols = this.query(`PRAGMA table_info(${quoted})`).rows.map((r) => ({
      name: String(r[1]),
      type: String(r[2] ?? ''),
      notnull: Number(r[3]) === 1,
      pk: Number(r[5]),
      dflt: r[4] === null ? null : String(r[4]),
    }))
    const fkRows = this.query(`PRAGMA foreign_key_list(${quoted})`).rows
    // columns: id, seq, table, from, to, ...
    const byId = new Map<number, FKInfo>()
    for (const r of fkRows) {
      const id = Number(r[0])
      const entry = byId.get(id) ?? { from: [], table: String(r[2]), to: [] }
      entry.from.push(String(r[3]))
      entry.to.push(r[4] === null ? '' : String(r[4]))
      byId.set(id, entry)
    }
    const unique: string[] = []
    for (const idx of this.query(`PRAGMA index_list(${quoted})`).rows) {
      // columns: seq, name, unique, origin, partial
      if (Number(idx[2]) !== 1) continue
      const cols = this.query(`PRAGMA index_info("${String(idx[1]).replace(/"/g, '""')}")`).rows
      if (cols.length === 1) unique.push(String(cols[0][2]))
    }
    return { name, columns: cols, fks: [...byId.values()], unique }
  }

  close(): void {
    this.db.close()
  }
}

export { splitStatements } from './sqlSplit'
