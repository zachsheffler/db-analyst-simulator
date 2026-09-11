import { useEffect, useRef, useState } from 'react'
import { useContent } from '../../content'
import type { Company, DesignChallenge } from '../../types/content'
import { emptyDiagram, emptySchema, type ERDiagram, type Schema } from './erModel'
import { ERStep } from './ERStep'
import { SchemaStep } from './SchemaStep'
import { DDLStep } from './DDLStep'
import type { Grade } from '../../lib/grade'
import { loadProgress, updateProgress } from '../../lib/score'
import { notifyProgress } from '../../App'
import { GradeReport, Stars } from '../../components/GradeReport'
import { Slot } from '../../components/Slots'
import { ControlBar } from '../../components/Controls'
import { DDLQuickRef, ERQuickRef, SchemaQuickRef } from '../../components/QuickRef'
import { useHotkeys } from '../../lib/hotkeys'
import { patchChatContext } from '../../lib/chatContext'
import { DesignSprint, DesignSprintSetup, type DesignSprintSettings } from './DesignSprint'
import { describeDiagram, describeSchema } from './describe'

type Step = 'er' | 'schema' | 'ddl'

const plural = (w: string) => (/y$/.test(w) ? w.slice(0, -1) + 'ies' : w + 's')

interface Work {
  er: ERDiagram
  schema: Schema
  sql: string
  grades: { er: Grade | null; schema: Grade | null; ddl: Grade | null }
}

const WORK_KEY = (id: string) => `dbsim.design.work.${id}`

function loadWork(id: string): Work {
  try {
    const raw = localStorage.getItem(WORK_KEY(id))
    if (raw) return { er: emptyDiagram(), schema: emptySchema(), sql: '', grades: { er: null, schema: null, ddl: null }, ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return { er: emptyDiagram(), schema: emptySchema(), sql: '', grades: { er: null, schema: null, ddl: null } }
}

export function DesignModule({ company }: { company: Company }) {
  const content = useContent()
  const [challenge, setChallenge] = useState<DesignChallenge | null>(null)
  const [sprint, setSprint] = useState<DesignSprintSettings | null>(null)
  const challenges = content.design.filter((c) => c.company === company.id)
  if (sprint) return <DesignSprint company={company} challenges={challenges} settings={sprint} onExit={() => setSprint(null)} />
  if (!challenge) {
    const progress = loadProgress()
    return (
      <div className="page">
        <h1>Diagramming · {company.name}</h1>
        <p className="muted">Each job has three steps: ER diagram → relational schema → SQL DDL. Check each step as often as you like; your best score is kept.</p>
        <div className="grid-2">
          {challenges.map((c) => {
            const d = progress.design[c.id]
            const max = { er: c.points?.er ?? 100, schema: c.points?.schema ?? 100, ddl: c.points?.ddl ?? 100 }
            return (
              <div key={c.id} className="card clickable" onClick={() => setChallenge(c)}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h2 style={{ margin: 0 }}>{c.title}</h2>
                  <span className="badge">{'●'.repeat(c.difficulty)}{'○'.repeat(5 - c.difficulty)}</span>
                </div>
                <p className="muted" style={{ fontSize: 13 }}>
                  {c.brief.split('\n')[0].slice(0, 160)}…
                </p>
                <div className="row" style={{ fontSize: 12 }}>
                  <span>ER {d?.er !== undefined ? <Stars pct={(100 * d.er) / max.er} /> : '—'}</span>
                  <span>Schema {d?.schema !== undefined ? <Stars pct={(100 * d.schema) / max.schema} /> : '—'}</span>
                  <span>DDL {d?.ddl !== undefined ? <Stars pct={(100 * d.ddl) / max.ddl} /> : '—'}</span>
                </div>
              </div>
            )
          })}
          {challenges.length === 0 && <div className="muted">No design jobs for this employer yet.</div>}
        </div>
        {challenges.length > 0 && <DesignSprintSetup challenges={challenges} onStart={setSprint} />}
        <Slot name="help">
          <div className="help-block">
            <h3>{company.name}</h3>
            <p>{company.description}</p>
            <h3>How diagramming jobs work</h3>
            <ol style={{ paddingLeft: 18, margin: 0 }}>
              <li>
                <b>ER diagram.</b> Model the brief with {plural(content.notation.er.terms.entity)}, {plural(content.notation.er.terms.attribute)}, and{' '}
                {plural(content.notation.er.terms.relationship)}, including cardinality and participation.
              </li>
              <li>
                <b>Relational schema.</b> Map the diagram to tables with primary and foreign keys.
              </li>
              <li>
                <b>SQL DDL.</b> Write CREATE TABLE statements. They run in a real database and the constraints are tested.
              </li>
            </ol>
            <h3>Sprints</h3>
            <p>
              A diagramming sprint fires short questions about pieces of the brief (one entity, one relationship, one mapping) against the clock. Streaks and speed multiply points, like
              the SQL sprint.
            </p>
            <p className="muted" style={{ fontSize: 12 }}>
              Grading looks at the amount and kind of things you draw (how many attributes, which are derived or multivalued, which cardinalities), not at the exact names. Work is saved
              in this browser.
            </p>
          </div>
        </Slot>
      </div>
    )
  }
  return <DesignChallengeView challenge={challenge} company={company} onBack={() => setChallenge(null)} />
}

function DesignChallengeView({ challenge, company, onBack }: { challenge: DesignChallenge; company: Company; onBack: () => void }) {
  const content = useContent()
  const n = content.notation
  const [step, setStep] = useState<Step>('er')
  const [work, setWork] = useState<Work>(() => loadWork(challenge.id))
  const [showHints, setShowHints] = useState(0)
  const [busy, setBusy] = useState(false)
  const checkRef = useRef<(() => void | Promise<void>) | null>(null)

  useEffect(() => {
    localStorage.setItem(WORK_KEY(challenge.id), JSON.stringify(work))
  }, [work, challenge.id])

  const steps: [Step, string][] = [
    ['er', 'ER diagram'],
    ['schema', 'Relational schema'],
    ['ddl', 'SQL DDL'],
  ]
  const done = (s: Step) => !!work.grades[s] && work.grades[s]!.score >= 0.8 * work.grades[s]!.max
  const idx = steps.findIndex(([s]) => s === step)
  const grade = work.grades[step]

  // keep the professor chat informed
  useEffect(() => {
    patchChatContext({
      task: `${steps[idx][1]} step of design job "${challenge.title}"`,
      brief: challenge.brief,
      hints: challenge.hints,
      work: step === 'er' ? describeDiagram(work.er) : step === 'schema' ? describeSchema(work.schema) : work.sql || '(no SQL yet)',
      grade,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, work, challenge.id])

  const recordGrade = (which: Step, g: Grade) => {
    setWork((w) => ({ ...w, grades: { ...w.grades, [which]: g } }))
    updateProgress((p) => {
      const d = p.design[challenge.id] ?? {}
      d.max = { er: challenge.points?.er ?? 100, schema: challenge.points?.schema ?? 100, ddl: challenge.points?.ddl ?? 100 }
      d[which] = Math.max(d[which] ?? 0, g.score)
      p.design[challenge.id] = d
    })
    notifyProgress()
  }

  const check = async () => {
    if (!checkRef.current || busy) return
    setBusy(true)
    try {
      await checkRef.current()
    } finally {
      setBusy(false)
    }
  }
  const go = (i: number) => setStep(steps[Math.max(0, Math.min(steps.length - 1, i))][0])

  useHotkeys('Design job', [
    { keys: 'ctrl+enter', label: `Check the current step`, handler: check },
    { keys: 'alt+1', label: 'ER diagram step', handler: () => go(0) },
    { keys: 'alt+2', label: 'Relational schema step', handler: () => go(1) },
    { keys: 'alt+3', label: 'SQL DDL step', handler: () => go(2) },
    { keys: 'ctrl+arrowleft', label: 'Previous step', handler: () => go(idx - 1) },
    { keys: 'ctrl+arrowright', label: 'Next step', handler: () => go(idx + 1) },
    { keys: 'alt+h', label: 'Reveal a hint', handler: () => setShowHints((h) => Math.min(h + 1, challenge.hints?.length ?? 0)) },
  ])

  return (
    <div className="page wide fill">
      <div className="row" style={{ marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontSize: 18 }}>{challenge.title}</h1>
        <span className="badge">{'●'.repeat(challenge.difficulty)}{'○'.repeat(5 - challenge.difficulty)}</span>
        <span className="muted" style={{ fontSize: 12 }}>
          for {company.name}
        </span>
      </div>
      <div className="stepper" style={{ marginBottom: 8 }}>
        {steps.map(([id, label], i) => (
          <button key={id} className={`${step === id ? 'active' : ''} ${done(id) ? 'done' : ''}`} onClick={() => setStep(id)} title={`Alt+${i + 1}`}>
            <span className="step-n">{i + 1}</span>
            {label}
            <span className="muted" style={{ float: 'right', fontSize: 12 }}>
              {work.grades[id] ? `${work.grades[id]!.score}/${work.grades[id]!.max}` : ''}
            </span>
          </button>
        ))}
      </div>
      <div className="fill-body">
        {step === 'er' && <ERStep challenge={challenge} notation={n} diagram={work.er} onChange={(er) => setWork((w) => ({ ...w, er }))} onGraded={(g) => recordGrade('er', g)} checkRef={checkRef} />}
        {step === 'schema' && <SchemaStep challenge={challenge} notation={n} schema={work.schema} er={work.er} onChange={(schema) => setWork((w) => ({ ...w, schema }))} onGraded={(g) => recordGrade('schema', g)} checkRef={checkRef} />}
        {step === 'ddl' && <DDLStep challenge={challenge} notation={n} schema={work.schema} sql={work.sql} onChange={(sql) => setWork((w) => ({ ...w, sql }))} onGraded={(g) => recordGrade('ddl', g)} checkRef={checkRef} />}
      </div>

      <Slot name="help">
        <div className="help-block">
          <details open>
            <summary>
              <b>Brief from {company.contact ?? company.name}</b>
            </summary>
            <div className="brief" style={{ marginTop: 6 }}>
              {challenge.brief}
            </div>
          </details>
          {challenge.hints?.length ? (
            <div style={{ marginTop: 8 }}>
              <button className="small" onClick={() => setShowHints((h) => Math.min(h + 1, challenge.hints!.length))} disabled={showHints >= challenge.hints.length}>
                Reveal a hint ({showHints}/{challenge.hints.length}) <kbd>Alt+H</kbd>
              </button>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {challenge.hints.slice(0, showHints).map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <details style={{ marginTop: 8 }}>
            <summary>
              <b>{step === 'er' ? 'Notation reminders' : step === 'schema' ? 'Mapping rules' : 'SQL notes'}</b>
            </summary>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>
              {(step === 'er' ? n.er.reminders : step === 'schema' ? n.relational.mappingRules : n.sql.dialectNotes).map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </details>
          {grade && (
            <div style={{ marginTop: 10 }}>
              <GradeReport grade={grade} title={steps[idx][1]} />
            </div>
          )}
        </div>
      </Slot>

      <Slot name="controls">
        <ControlBar
          reference={step === 'er' ? <ERQuickRef notation={n} /> : step === 'schema' ? <SchemaQuickRef notation={n} /> : <DDLQuickRef notation={n} />}
          stats={[
            { label: 'ER', value: work.grades.er ? work.grades.er.score : '—' },
            { label: 'Schema', value: work.grades.schema ? work.grades.schema.score : '—' },
            { label: 'DDL', value: work.grades.ddl ? work.grades.ddl.score : '—' },
          ]}
        >
          <button className="primary" onClick={check} disabled={busy} title="Ctrl+Enter">
            {busy ? 'Checking…' : `Check ${steps[idx][1]}`}
          </button>
          <button onClick={() => go(idx - 1)} disabled={idx === 0} title="Ctrl+←">
            ← Prev
          </button>
          <button onClick={() => go(idx + 1)} disabled={idx === steps.length - 1} title="Ctrl+→">
            Next →
          </button>
          <button className="ghost" onClick={onBack}>
            ■ Leave job
          </button>
        </ControlBar>
      </Slot>
    </div>
  )
}
