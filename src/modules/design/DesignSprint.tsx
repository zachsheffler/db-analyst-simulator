import { useEffect, useMemo, useRef, useState } from 'react'
import { useContent } from '../../content'
import type { Company, DesignChallenge } from '../../types/content'
import { emptyDiagram, emptySchema, type ERDiagram, type Schema } from './erModel'
import { ERStep } from './ERStep'
import { SchemaStep } from './SchemaStep'
import { ERCanvas } from './ERCanvas'
import { pct, summarize, type Grade } from '../../lib/grade'
import { updateProgress } from '../../lib/score'
import { notifyProgress } from '../../App'
import { GradeReport } from '../../components/GradeReport'
import { Slot } from '../../components/Slots'
import { ControlBar, mmss } from '../../components/Controls'
import { useHotkeys } from '../../lib/hotkeys'
import { patchChatContext } from '../../lib/chatContext'
import { generateDesignPool, KIND_LABELS, orderPool, type DesignSprintKind, type DesignSprintQuestion } from '../../lib/designSprint'
import { DURATIONS, useSprintClock, useSprintScore, type SprintSettings } from '../../lib/sprint'
import { describeDiagram, describeSchema } from './describe'
import { diagramFromReference, layoutDiagram } from '../../lib/erRef'

export interface DesignSprintSettings extends SprintSettings {
  kinds: DesignSprintKind[]
}

/** A sprint answer counts as correct only with full marks; warnings (extra attributes, naming) do not cost points. */
const isCorrect = (g: Grade) => g.score >= g.max

export function DesignSprintSetup({ challenges, onStart }: { challenges: DesignChallenge[]; onStart: (s: DesignSprintSettings) => void }) {
  const [duration, setDuration] = useState(300)
  const [kinds, setKinds] = useState<DesignSprintKind[]>(['entity', 'relationship', 'schema'])
  const [minDiff, setMinDiff] = useState(1)
  const [maxDiff, setMaxDiff] = useState(5)
  const pool = useMemo(() => generateDesignPool(challenges, kinds).filter((q) => q.difficulty >= minDiff && q.difficulty <= maxDiff), [challenges, kinds, minDiff, maxDiff])
  return (
    <div className="panel" style={{ maxWidth: 720, marginTop: 20 }}>
      <div className="panel-head">⚡ Diagramming sprint</div>
      <div className="panel-body">
        <p className="muted" style={{ marginTop: 0 }}>
          Short questions about pieces of the briefs above: draw one entity, model one relationship, or map a fragment to tables. Points scale with difficulty; streaks and speed
          multiply them.
        </p>
        <label className="row" style={{ marginBottom: 8 }}>
          <span style={{ width: 110 }}>Time limit</span>
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {DURATIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="row" style={{ marginBottom: 8 }}>
          <span style={{ width: 110 }}>Difficulty</span>
          <select value={minDiff} onChange={(e) => setMinDiff(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <span>to</span>
          <select value={maxDiff} onChange={(e) => setMaxDiff(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <div style={{ marginBottom: 6 }}>Question kinds</div>
        <div className="row" style={{ gap: 4 }}>
          {(Object.keys(KIND_LABELS) as DesignSprintKind[]).map((k) => (
            <button key={k} className={`small ${kinds.includes(k) ? 'active' : ''}`} onClick={() => setKinds((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]))}>
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
          <span className="muted">{pool.length} questions match.</span>
          <button className="primary" disabled={!pool.length} onClick={() => onStart({ durationSec: duration, kinds, minDiff, maxDiff })}>
            ▶ Start sprint
          </button>
        </div>
      </div>
    </div>
  )
}

export function DesignSprint({ company, challenges, settings, onExit }: { company: Company; challenges: DesignChallenge[]; settings: DesignSprintSettings; onExit: () => void }) {
  const content = useContent()
  const n = content.notation
  const pool = useMemo(() => generateDesignPool(challenges, settings.kinds).filter((q) => q.difficulty >= settings.minDiff && q.difficulty <= settings.maxDiff), [challenges, settings])
  const [queue, setQueue] = useState<DesignSprintQuestion[]>(() => orderPool(pool))
  const [current, setCurrent] = useState<DesignSprintQuestion | null>(null)
  const [er, setEr] = useState<ERDiagram>(emptyDiagram())
  const [schema, setSchema] = useState<Schema>(emptySchema())
  const [grade, setGrade] = useState<Grade | null>(null)
  const [attempts, setAttempts] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'good' | 'bad' | 'warn'; text: string } | null>(null)
  const [finished, setFinished] = useState(false)
  const checkRef = useRef<(() => void | Promise<void>) | null>(null)
  const gradeRef = useRef<Grade | null>(null)
  const { score, streak, bestStreak, history, startQuestion, award, miss, breakStreak } = useSprintScore<DesignSprintQuestion>()
  const clock = useSprintClock(settings.durationSec, !finished)
  const timed = settings.durationSec > 0

  useEffect(() => {
    if (clock.expired) setFinished(true)
  }, [clock.expired])

  useEffect(() => {
    if (current || finished) return
    const rest = queue.length ? [...queue] : orderPool(pool)
    const q = rest.shift() ?? null
    setQueue(rest)
    setCurrent(q)
    setEr(emptyDiagram())
    setSchema(emptySchema())
    setGrade(null)
    setAttempts(0)
    setRevealed(false)
    setFeedback(null)
    startQuestion()
    if (!q) setFinished(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, finished])

  useEffect(() => {
    if (!finished) return
    updateProgress((p) => {
      p.designSprints.sessions.push({
        date: new Date().toISOString(),
        setId: `${company.id}-design`,
        durationSec: settings.durationSec,
        score,
        answered: history.length,
        correct: history.filter((h) => h.correct).length,
        bestStreak,
      })
    })
    notifyProgress()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished])

  useEffect(() => {
    if (!current) return
    patchChatContext({
      task: `Diagramming sprint: ${current.title}`,
      brief: current.text,
      work: current.kind === 'schema' ? describeSchema(schema) : describeDiagram(er),
      grade,
      notes: `Reference solution (never reveal wholesale): ${JSON.stringify(current.kind === 'schema' ? current.challenge.schema.tables : current.challenge.er)}`,
    })
  }, [current, er, schema, grade])

  const submit = async () => {
    if (!current || revealed || !checkRef.current) return
    await checkRef.current()
    const g = gradeRef.current
    if (!g) return
    setGrade(g)
    const nAtt = attempts + 1
    setAttempts(nAtt)
    if (isCorrect(g)) {
      const { earned, streakMult, speed } = award(current, current.points, nAtt, timed)
      setFeedback({ kind: 'good', text: `Correct! +${earned} pts${streakMult > 1 ? ` (streak ×${streakMult.toFixed(1)})` : ''}${speed > 1 ? ` (speed ×${speed})` : ''}. Next question in a moment…` })
      setTimeout(() => setCurrent(null), 1400)
    } else {
      breakStreak()
      setFeedback({ kind: 'bad', text: `Not yet (${Math.round(pct(g))}%). ${summarize(g)}` })
    }
  }
  const skip = () => {
    if (!current) return
    miss(current, attempts)
    setCurrent(null)
  }
  const reveal = () => {
    if (!current) return
    setRevealed(true)
    miss(current, attempts)
    setFeedback({ kind: 'warn', text: 'Reference shown in the help panel. No points for this one. Study it, then continue.' })
  }

  useHotkeys('Diagramming sprint', [
    { keys: 'ctrl+enter', label: 'Submit', handler: submit, when: () => !!current && !revealed },
    { keys: 'alt+n', label: 'Skip / next', handler: () => (revealed ? setCurrent(null) : skip()), when: () => !!current },
    { keys: 'alt+s', label: 'Show solution (after 2 attempts)', handler: reveal, when: () => attempts >= 2 && !revealed },
  ])

  const referenceView = current && (revealed || current.kind === 'schema') ? (
    <div className="panel" style={{ marginTop: 8 }}>
      <div className="panel-head">{revealed ? 'Reference solution' : 'ER fragment to map'}</div>
      {current.kind === 'schema' && !revealed ? (
        <ERCanvas diagram={current.reference!} onChange={() => {}} selected={null} onSelect={() => {}} notation={n} mode="select" onModeDone={() => {}} readOnly fit />
      ) : revealed && current.kind !== 'schema' ? (
        <ERCanvas diagram={current.reference ?? refDiagram(current)} onChange={() => {}} selected={null} onSelect={() => {}} notation={n} mode="select" onModeDone={() => {}} readOnly fit />
      ) : (
        <div className="panel-body" style={{ fontSize: 12 }}>
          {current.challenge.schema.tables.map((t) => (
            <div key={t.name}>
              <b>{t.name}</b> ({t.columns.map((c) => (t.pk.includes(c.name) ? <u key={c.name}>{c.name}</u> : t.fks.some((f) => f.columns.includes(c.name)) ? <i key={c.name}>{c.name}</i> : c.name)).reduce<React.ReactNode[]>((a, x, i) => (i ? [...a, ', ', x] : [x]), [])})
              {t.fks.map((f) => (
                <span key={f.refTable} className="muted">
                  {' '}
                  · FK {f.columns.join(', ')} → {f.refTable}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  ) : null

  if (finished) {
    const correct = history.filter((h) => h.correct).length
    return (
      <div className="page">
        <h1>Sprint over · {company.name}</h1>
        <div className="panel">
          <div className="panel-head">Questions</div>
          <div className="panel-body">
            {history.map((h, i) => (
              <div key={i} style={{ marginBottom: 6 }}>
                <span className={`badge ${h.correct ? 'good' : 'bad'}`}>{h.correct ? `+${h.earned}` : h.attempts ? 'wrong' : 'skipped'}</span> {h.q.title}{' '}
                <span className="muted">({KIND_LABELS[h.q.kind]})</span>
              </div>
            ))}
            {history.length === 0 && <span className="muted">No questions answered.</span>}
          </div>
        </div>
        <Slot name="help">
          <div className="help-block">
            <h3>Diagramming sprint</h3>
            <p>Best sprint scores are listed on your report card.</p>
          </div>
        </Slot>
        <Slot name="controls">
          <ControlBar
            clock={mmss(clock.elapsed)}
            clockLabel="sprint finished"
            stats={[
              { label: 'Score', value: score },
              { label: 'Correct', value: `${correct}/${history.length}` },
              { label: 'Best streak', value: bestStreak },
            ]}
          >
            <button className="primary" onClick={onExit}>
              New sprint
            </button>
          </ControlBar>
        </Slot>
      </div>
    )
  }

  return (
    <div className="page wide fill">
      {current && (
        <>
          <div className="question" style={{ marginBottom: 8 }}>
            <span className="badge" style={{ marginRight: 8 }}>
              {KIND_LABELS[current.kind]} · {current.points} pts
            </span>
            <b>{current.title}</b>
          </div>
          {feedback && <div className={`feedback ${feedback.kind}`}>{feedback.text}</div>}
          <div className="fill-body" style={{ minHeight: 360 }}>
            {current.kind === 'schema' ? (
              <SchemaStep key={current.id} challenge={current.challenge} notation={n} schema={schema} er={emptyDiagram()} onChange={setSchema} onGraded={(g) => (gradeRef.current = g)} checkRef={checkRef} />
            ) : (
              <ERStep key={current.id} challenge={current.challenge} notation={n} diagram={er} onChange={setEr} onGraded={(g) => (gradeRef.current = g)} checkRef={checkRef} />
            )}
          </div>
        </>
      )}
      <Slot name="help">
        <div className="help-block">
          {current && (
            <>
              <b>{current.title}</b>
              <div className="brief" style={{ marginTop: 4 }}>
                {current.text}
              </div>
              {referenceView}
              {grade && (
                <div style={{ marginTop: 10 }}>
                  <GradeReport grade={grade} title="Check" />
                </div>
              )}
            </>
          )}
        </div>
      </Slot>
      <Slot name="controls">
        <ControlBar
          clock={timed ? mmss(clock.timeLeft) : mmss(clock.elapsed)}
          clockLabel={timed ? 'time left' : 'practice · elapsed'}
          clockClass={timed && clock.timeLeft <= 30 ? 'low' : ''}
          stats={[
            { label: 'Score', value: score },
            { label: 'Streak', value: streak > 0 ? `🔥${streak}` : '–' },
            { label: 'Solved', value: history.filter((h) => h.correct).length },
          ]}
        >
          <button className="primary" onClick={submit} disabled={!current || revealed} title="Ctrl+Enter">
            Submit
          </button>
          {attempts >= 2 && !revealed && (
            <button onClick={reveal} className="ghost" title="Alt+S">
              Show solution
            </button>
          )}
          <button onClick={revealed ? () => setCurrent(null) : skip} className="ghost" disabled={!current} title="Alt+N">
            {revealed ? 'Next →' : 'Skip →'}
          </button>
          <button className="ghost danger" onClick={() => setFinished(true)}>
            ■ End
          </button>
        </ControlBar>
      </Slot>
    </div>
  )
}

function refDiagram(q: DesignSprintQuestion): ERDiagram {
  return layoutDiagram(diagramFromReference(q.challenge))
}
