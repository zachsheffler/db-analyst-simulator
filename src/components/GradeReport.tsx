import type { Grade } from '../lib/grade'

export function GradeReport({ grade, title }: { grade: Grade; title?: string }) {
  const pct = grade.max ? Math.round((100 * grade.score) / grade.max) : 0
  const visible = grade.items.filter((it) => !it.hidden)
  return (
    <div className="grade">
      <div className="grade-head">
        {title && <span>{title}</span>}
        <span className="big">
          {grade.score} / {grade.max}
        </span>
        <div className="meter">
          <div style={{ width: `${pct}%`, background: pct >= 80 ? 'var(--good)' : pct >= 50 ? 'var(--warn)' : 'var(--bad)' }} />
        </div>
        <span className="muted">{pct}%</span>
      </div>
      <ul>
        {visible.map((it, i) => {
          const cls = it.max === 0 ? (it.level ?? 'info') : it.ok ? 'ok' : 'bad'
          return (
            <li key={i} className={cls}>
              <span className="mark">{it.max === 0 ? (it.level === 'warn' ? '!' : 'i') : it.ok ? '✓' : '✗'}</span>
              <span>{it.text}</span>
              {it.max > 0 && (
                <span className="pts">
                  {it.points}/{it.max}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function Stars({ pct }: { pct: number }) {
  const n = pct >= 95 ? 3 : pct >= 75 ? 2 : pct >= 50 ? 1 : 0
  return (
    <span className="stars" title={`${Math.round(pct)}%`}>
      {'★'.repeat(n)}
      {'☆'.repeat(3 - n)}
    </span>
  )
}
