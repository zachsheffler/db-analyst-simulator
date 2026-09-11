import { useState } from 'react'
import { useContent } from '../content'
import { loadProgress, resetProgress, totals, type SprintSession } from '../lib/score'
import { Stars } from '../components/GradeReport'
import { notifyProgress } from '../App'
import { Slot } from '../components/Slots'

export function ReportCard() {
  const content = useContent()
  const [, force] = useState(0)
  const p = loadProgress()
  const t = totals(p)

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...p, totals: t }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `dbsim-progress-${(p.studentName || 'student').replace(/\W+/g, '_')}.json`
    a.click()
  }

  const pct = (s: number | undefined, m: number) => (s === undefined ? null : (100 * s) / m)

  return (
    <div className="page">
      <h1>Report card{p.studentName ? ` · ${p.studentName}` : ''}</h1>
      <div className="row" style={{ gap: 16, marginBottom: 16 }}>
        <div className="card stat">
          <div className="v">
            {t.design}
            <span className="muted" style={{ fontSize: 13 }}>
              {' '}
              / {t.designMax}
            </span>
          </div>
          <div className="l">Design points</div>
        </div>
        <div className="card stat">
          <div className="v">{t.queryBest}</div>
          <div className="l">Best SQL sprint</div>
        </div>
        <div className="card stat">
          <div className="v">{t.vizSprintBest}</div>
          <div className="l">Best viz sprint</div>
        </div>
        <div className="card stat">
          <div className="v">{t.designSprintBest}</div>
          <div className="l">Best diagram sprint</div>
        </div>
        <div className="card stat">
          <div className="v">
            {t.present}
            <span className="muted" style={{ fontSize: 13 }}>
              {' '}
              / {t.presentMax}
            </span>
          </div>
          <div className="l">Presentation points</div>
        </div>
        <div className="spacer" style={{ flex: 1 }} />
        <button onClick={exportJson}>Export progress (.json)</button>
        <button
          className="danger"
          onClick={() => {
            if (confirm('Erase all saved progress in this browser?')) {
              resetProgress()
              notifyProgress()
              force((x) => x + 1)
            }
          }}
        >
          Reset
        </button>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">Design challenges</div>
          <div className="panel-body">
            <table className="data">
              <thead>
                <tr>
                  <th>Employer</th>
                  <th>Job</th>
                  <th>ER</th>
                  <th>Schema</th>
                  <th>DDL</th>
                </tr>
              </thead>
              <tbody>
                {content.design.map((c) => {
                  const d = p.design[c.id]
                  const m = d?.max ?? { er: c.points?.er ?? 100, schema: c.points?.schema ?? 100, ddl: c.points?.ddl ?? 100 }
                  const cell = (s: number | undefined, mx: number) => {
                    const v = pct(s, mx)
                    return v === null ? <span className="muted">—</span> : <Stars pct={v} />
                  }
                  return (
                    <tr key={c.id}>
                      <td className="muted">{content.companies.find((x) => x.id === c.company)?.name ?? c.company}</td>
                      <td>{c.title}</td>
                      <td>{cell(d?.er, m.er)}</td>
                      <td>{cell(d?.schema, m.schema)}</td>
                      <td>{cell(d?.ddl, m.ddl)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">Presentation challenges</div>
          <div className="panel-body">
            <table className="data">
              <thead>
                <tr>
                  <th>Employer</th>
                  <th>Job</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {content.presentation.map((c) => {
                  const s = p.present[c.id]
                  return (
                    <tr key={c.id}>
                      <td className="muted">{content.companies.find((x) => x.id === c.company)?.name ?? c.company}</td>
                      <td>{c.title}</td>
                      <td>{s ? <Stars pct={(100 * s.score) / s.max} /> : <span className="muted">—</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <SprintTable title="Query sprints" sessions={p.query.sessions} name={(id) => content.queries.find((q) => q.id === id)?.title ?? id} />
      <SprintTable title="Viz sprints" sessions={p.vizSprints.sessions} name={(id) => content.vizSprints.find((q) => q.id === id)?.title ?? id} />
      <SprintTable title="Diagramming sprints" sessions={p.designSprints.sessions} name={(id) => content.companies.find((c) => id.startsWith(c.id))?.name ?? id} />
      <Slot name="help">
        <div className="help-block">
          <h3>Report card</h3>
          <p>Best scores per job are kept. Stars: 3 at 95%+, 2 at 75%+, 1 at 50%+.</p>
          <p>Export the JSON to hand in; it includes your name, every score, and every sprint.</p>
        </div>
      </Slot>
    </div>
  )
}

function SprintTable({ title, sessions, name }: { title: string; sessions: SprintSession[]; name: (setId: string) => string }) {
  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="panel-head">{title}</div>
      <div className="panel-body">
        {sessions.length === 0 ? (
          <span className="muted">No sprints yet.</span>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Date</th>
                <th>Set</th>
                <th>Length</th>
                <th>Score</th>
                <th>Answered</th>
                <th>Correct</th>
                <th>Best streak</th>
              </tr>
            </thead>
            <tbody>
              {[...sessions].reverse().map((s, i) => (
                <tr key={i}>
                  <td>{new Date(s.date).toLocaleString()}</td>
                  <td>{name(s.setId)}</td>
                  <td>{s.durationSec ? `${Math.round(s.durationSec / 60)} min` : 'practice'}</td>
                  <td className="num">{s.score}</td>
                  <td className="num">{s.answered}</td>
                  <td className="num">{s.correct}</td>
                  <td className="num">{s.bestStreak}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
