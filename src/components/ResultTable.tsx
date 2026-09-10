import type { ResultSet } from '../lib/sqlite'

export function ResultTable({ rs, maxRows = 200 }: { rs: ResultSet; maxRows?: number }) {
  if (!rs.columns.length) return <div className="muted">Statement executed (no result rows).</div>
  const rows = rs.rows.slice(0, maxRows)
  return (
    <div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              {rs.columns.map((c, i) => (
                <th key={i}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((v, j) => (
                  <td key={j} className={typeof v === 'number' ? 'num' : ''}>
                    {v === null ? <span className="muted">NULL</span> : typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : String(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        {rs.rows.length} row{rs.rows.length === 1 ? '' : 's'}
        {rs.rows.length > maxRows ? ` (showing first ${maxRows})` : ''}
      </div>
    </div>
  )
}
