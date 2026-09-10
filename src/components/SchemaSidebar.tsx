import type { TableInfo } from '../lib/sqlite'

export function SchemaSidebar({ tables, notes }: { tables: TableInfo[]; notes?: Record<string, string> }) {
  return (
    <div className="schema-sidebar">
      {tables.map((t) => (
        <details key={t.name} open>
          <summary>{t.name}</summary>
          {notes?.[t.name] && (
            <div className="muted" style={{ fontSize: 12, paddingLeft: 14 }}>
              {notes[t.name]}
            </div>
          )}
          <div className="cols">
            {t.columns.map((c) => {
              const isFk = t.fks.some((f) => f.from.includes(c.name))
              return (
                <div key={c.name}>
                  <span className={`${c.pk ? 'pk' : ''} ${isFk ? 'fk' : ''}`}>{c.name}</span>{' '}
                  <span style={{ opacity: 0.7 }}>{c.type.toLowerCase()}</span>
                  {isFk && <span style={{ opacity: 0.7 }}> → {t.fks.find((f) => f.from.includes(c.name))!.table}</span>}
                </div>
              )
            })}
          </div>
        </details>
      ))}
    </div>
  )
}
