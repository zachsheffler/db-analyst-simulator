import { useContent } from '../content'
import type { Company } from '../types/content'
import { loadProgress } from '../lib/score'
import { Slot } from '../components/Slots'

export const TIER_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const

export function CompanyPicker({ onPick }: { onPick: (c: Company) => void }) {
  const content = useContent()
  const p = loadProgress()
  const counts = (id: string) => ({
    design: content.design.filter((c) => c.company === id).length,
    queries: content.queries.filter((q) => q.company === id).reduce((a, q) => a + q.questions.length, 0),
    viz: content.presentation.filter((c) => c.company === id).length,
    earned:
      content.design.filter((c) => c.company === id).reduce((a, c) => a + ((p.design[c.id]?.er ?? 0) + (p.design[c.id]?.schema ?? 0) + (p.design[c.id]?.ddl ?? 0)), 0) +
      content.presentation.filter((c) => c.company === id).reduce((a, c) => a + (p.present[c.id]?.score ?? 0), 0),
  })
  return (
    <div className="page">
      <h1>Who are you working for today?</h1>
      <p className="muted">Each employer is a difficulty setting. Start with Dave; move up when the checks come back green.</p>
      <div className="jobs">
        {content.companies.map((c) => {
          const n = counts(c.id)
          return (
            <div key={c.id} className={`card clickable job tier-${c.tier}`} onClick={() => onPick(c)}>
              <div className="job-logo">{c.logo ?? '🏢'}</div>
              <div className="job-body">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h2 style={{ margin: 0 }}>{c.name}</h2>
                  <span className={`badge tier ${c.tier}`}>{TIER_LABEL[c.tier]}</span>
                </div>
                <p style={{ margin: '4px 0 8px' }}>{c.tagline}</p>
                <div className="row muted" style={{ fontSize: 12, gap: 12 }}>
                  <span>✏ {n.design} design</span>
                  <span>⚡ {n.queries} query templates</span>
                  <span>📊 {n.viz} viz</span>
                  {n.earned > 0 && <span className="badge good">{n.earned} pts earned</span>}
                </div>
              </div>
            </div>
          )
        })}
        {content.companies.length === 0 && <div className="muted">No companies loaded. Check the content packs.</div>}
      </div>
      <Slot name="help">
        <div className="help-block">
          <h3>Instructions</h3>
          <p>
            You are a database analyst for hire. Pick an employer, then work through the three jobs every analyst does: <b>Diagramming</b> (design the
            database), the <b>Query Workbench</b> (answer questions with SQL against the clock), and <b>Viz</b> (build the chart that answers a business
            question).
          </p>
          <p>The help panel (here) always shows the brief and reference notes for what you are doing. The panel below the work area holds the timer and controls.</p>
        </div>
      </Slot>
    </div>
  )
}
