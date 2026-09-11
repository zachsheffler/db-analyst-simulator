import { useEffect, useMemo, useRef, useState } from 'react'
import { useContent } from '../../content'
import type { Company, PresentationChallenge, VisualSpec, VisualType, VizSet, VizTemplate } from '../../types/content'
import type { ResultSet } from '../../lib/sqlite'
import { defaultSort } from '../../lib/vizQuery'
import { gradeViz } from '../../lib/vizGrade'
import { gradeVizSprint, VIZ_TOPIC_LABELS } from '../../lib/vizSprint'
import type { Grade } from '../../lib/grade'
import { GradeReport, Stars } from '../../components/GradeReport'
import { loadProgress, updateProgress } from '../../lib/score'
import { notifyProgress } from '../../App'
import { Slot } from '../../components/Slots'
import { ControlBar, mmss } from '../../components/Controls'
import { VizQuickRef } from '../../components/QuickRef'
import { useHotkeys } from '../../lib/hotkeys'
import { patchChatContext } from '../../lib/chatContext'
import { generateQuestion, shuffle, type GeneratedQuestion } from '../../lib/questionGen'
import { DURATIONS, useSprintClock, useSprintScore, type SprintSettings } from '../../lib/sprint'
import { describeSpec, useWorkbench, type Workbench } from './workbench'
import { PLATFORMS, type Platform, type SkinProps } from './skins/types'
import { PowerBISkin } from './skins/PowerBI'
import { TableauSkin } from './skins/Tableau'
import { GgplotSkin } from './skins/Ggplot'

const PLATFORM_KEY = 'dbsim.vizPlatform'
const TYPE_KEYS: VisualType[] = ['clusteredColumn', 'clusteredBar', 'stackedColumn', 'line', 'pie', 'donut', 'card', 'table']

function loadPlatform(): Platform {
  const p = localStorage.getItem(PLATFORM_KEY) as Platform | null
  return p && PLATFORMS.some((x) => x.id === p) ? p : 'pbi'
}

function Skin({ platform, ...props }: SkinProps & { platform: Platform }) {
  if (platform === 'tab') return <TableauSkin {...props} />
  if (platform === 'gg') return <GgplotSkin {...props} />
  return <PowerBISkin {...props} />
}

interface VizSprintSettings extends SprintSettings {
  setId: string
  topics: string[]
}

export function PresentModule({ company }: { company: Company }) {
  const content = useContent()
  const [challenge, setChallenge] = useState<PresentationChallenge | null>(null)
  const [platform, setPlatformState] = useState<Platform>(loadPlatform)
  const [sprint, setSprint] = useState<VizSprintSettings | null>(null)
  const setPlatform = (p: Platform) => {
    setPlatformState(p)
    localStorage.setItem(PLATFORM_KEY, p)
  }
  const challenges = content.presentation.filter((c) => c.company === company.id)
  const sets = content.vizSprints.filter((s) => s.company === company.id)
  if (sprint) {
    const set = sets.find((s) => s.id === sprint.setId)!
    return <VizSprint company={company} set={set} settings={sprint} platform={platform} onExit={() => setSprint(null)} />
  }
  if (challenge) return <VizJob challenge={challenge} company={company} platform={platform} onBack={() => setChallenge(null)} />
  const progress = loadProgress()
  const current = PLATFORMS.find((p) => p.id === platform)!
  return (
    <div className="page">
      <h1>Viz · {company.name}</h1>
      <p className="muted">Each job asks a business question. Build the visual that answers it, then check it. Chart choice, fields, aggregation, filters, and sorting all count.</p>
      <div className="platform-picker">
        {PLATFORMS.map((p) => (
          <button key={p.id} className={`platform ${platform === p.id ? 'active' : ''}`} onClick={() => setPlatform(p.id)}>
            <span className="picon">{p.icon}</span>
            <span className="pname">{p.name}</span>
            <span className="pprod muted">{p.product}</span>
            <span className="pblurb muted">{p.blurb}</span>
          </button>
        ))}
      </div>
      <div className="grid-2">
        {challenges.map((c) => {
          const s = progress.present[c.id]
          return (
            <div key={c.id} className="card clickable" onClick={() => setChallenge(c)}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2 style={{ margin: 0 }}>{c.title}</h2>
                <span className="badge">{'●'.repeat(c.difficulty)}{'○'.repeat(5 - c.difficulty)}</span>
              </div>
              <p className="muted" style={{ fontSize: 13 }}>
                {c.brief.slice(0, 140)}…
              </p>
              <div>{s ? <Stars pct={(100 * s.score) / s.max} /> : <span className="muted">not attempted</span>}</div>
            </div>
          )
        })}
        {challenges.length === 0 && <div className="muted">No viz jobs for this employer yet.</div>}
      </div>
      {sets.length > 0 && <VizSprintSetup sets={sets} onStart={setSprint} />}
      <Slot name="help">
        <div className="help-block">
          <h3>{company.name}</h3>
          <p>{company.description}</p>
          <h3>How viz jobs work</h3>
          <p>
            You are working in <b>{current.product}</b>, a {current.name.replace('-style', '')} look-alike. {current.blurb} Tables are joined automatically along their foreign keys, and you
            can define your own calculated fields. Switch tools any time with the buttons above; the grading is the same.
          </p>
          <h3>Viz sprints</h3>
          <p>Timed questions: build the visual that shows the requested numbers. Any field choice (or calculated field) that yields the right numbers is accepted.</p>
          <details>
            <summary>Visualization principles</summary>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>
              {content.notation.viz.principles.map((p) => (
                <li key={p.id}>{p.text}</li>
              ))}
            </ul>
          </details>
        </div>
      </Slot>
    </div>
  )
}

/** Hotkeys shared by the job and sprint workbenches. */
function useWorkbenchHotkeys(wb: Workbench, check: () => void) {
  useHotkeys('Viz workbench', [
    { keys: 'ctrl+enter', label: 'Check / submit the visual', handler: check },
    ...TYPE_KEYS.map((t, i) => ({ keys: String(i + 1), label: i === 0 ? 'Visual type 1–8 (column, bar, stacked, line, pie, donut, card, table)' : '', handler: () => wb.setType(t) })),
    { keys: 'ctrl+backspace', label: 'Clear all fields', handler: wb.clear },
  ])
}

function VizJob({ challenge, company, platform, onBack }: { challenge: PresentationChallenge; company: Company; platform: Platform; onBack: () => void }) {
  const content = useContent()
  const dbDef = content.databases.get(challenge.database)!
  const [grade, setGrade] = useState<Grade | null>(null)
  const wb = useWorkbench(dbDef, () => setGrade(null))

  useEffect(() => {
    patchChatContext({ task: `Viz job "${challenge.title}" (${PLATFORMS.find((p) => p.id === platform)?.name})`, brief: challenge.brief, hints: challenge.hints, work: describeSpec(wb), grade, notes: challenge.referenceSql ? `Reference SQL (for you only): ${challenge.referenceSql}` : undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wb.spec, wb.data, grade, challenge.id])

  const check = () => {
    const db = wb.db
    if (!db) return
    let reference: ResultSet | null = null
    if (challenge.referenceSql) {
      try {
        reference = db.query(challenge.referenceSql)
      } catch (e) {
        console.error('referenceSql failed', e)
      }
    }
    const effective: VisualSpec = { ...wb.spec, sort: wb.spec.sort ?? defaultSort(wb.spec) }
    const g = gradeViz({ spec: effective, data: wb.data.rs, reference, dims: wb.built.dims }, challenge, content.notation)
    setGrade(g)
    updateProgress((p) => {
      const prev = p.present[challenge.id]
      if (!prev || g.score > prev.score) p.present[challenge.id] = { score: g.score, max: g.max }
    })
    notifyProgress()
  }
  useWorkbenchHotkeys(wb, check)

  return (
    <div className="viz-frame">
      <Skin platform={platform} wb={wb} docTitle={challenge.title} onCheck={check} checkLabel="Check visual" />
      <Slot name="help">
        <div className="help-block">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>Request from {company.contact ?? company.name}</b>
            <span className="badge">{'●'.repeat(challenge.difficulty)}{'○'.repeat(5 - challenge.difficulty)}</span>
          </div>
          <div className="brief" style={{ marginTop: 4 }}>
            {challenge.brief}
          </div>
          {challenge.hints?.length ? (
            <details style={{ marginTop: 6, fontSize: 12 }}>
              <summary style={{ cursor: 'pointer' }}>Hints</summary>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {challenge.hints.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <details style={{ marginTop: 6, fontSize: 12 }}>
            <summary style={{ cursor: 'pointer' }}>Visualization principles</summary>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {content.notation.viz.principles.map((p) => (
                <li key={p.id}>{p.text}</li>
              ))}
            </ul>
          </details>
          {grade && (
            <div style={{ marginTop: 10 }}>
              <GradeReport grade={grade} title="Visual check" />
            </div>
          )}
        </div>
      </Slot>
      <Slot name="controls">
        <ControlBar reference={<VizQuickRef />} stats={[{ label: 'Best', value: loadProgress().present[challenge.id]?.score ?? '—' }, { label: 'Last check', value: grade ? grade.score : '—' }]}>
          <button className="primary" onClick={check} disabled={!wb.ready} title="Ctrl+Enter">
            ✓ Check visual
          </button>
          <button className="ghost" onClick={onBack}>
            ■ Leave job
          </button>
        </ControlBar>
      </Slot>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Viz sprint
// ---------------------------------------------------------------------------

function VizSprintSetup({ sets, onStart }: { sets: VizSet[]; onStart: (s: VizSprintSettings) => void }) {
  const [setId, setSetId] = useState(sets[0].id)
  const [duration, setDuration] = useState(300)
  const [minDiff, setMinDiff] = useState(1)
  const [maxDiff, setMaxDiff] = useState(5)
  const set = sets.find((s) => s.id === setId)!
  const topics = useMemo(() => [...new Set(set.questions.map((q) => q.topic))], [set])
  const [chosen, setChosen] = useState<string[]>([])
  useEffect(() => setChosen(topics), [topics])
  const count = set.questions.filter((q) => chosen.includes(q.topic) && q.difficulty >= minDiff && q.difficulty <= maxDiff).length
  return (
    <div className="panel" style={{ maxWidth: 720, marginTop: 20 }}>
      <div className="panel-head">⚡ Viz sprint</div>
      <div className="panel-body">
        <p className="muted" style={{ marginTop: 0 }}>
          Generated chart questions against the clock. Build the visual that shows the requested numbers (calculated fields welcome); streaks and speed multiply points.
        </p>
        {sets.length > 1 && (
          <label className="row" style={{ marginBottom: 8 }}>
            <span style={{ width: 110 }}>Question set</span>
            <select value={setId} onChange={(e) => setSetId(e.target.value)}>
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
        )}
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
        <div style={{ marginBottom: 6 }}>Topics</div>
        <div className="row" style={{ gap: 4 }}>
          {topics.map((t) => (
            <button key={t} className={`small ${chosen.includes(t) ? 'active' : ''}`} onClick={() => setChosen((c) => (c.includes(t) ? c.filter((x) => x !== t) : [...c, t]))}>
              {VIZ_TOPIC_LABELS[t] ?? t}
            </button>
          ))}
          <button className="small ghost" onClick={() => setChosen(topics)}>
            all
          </button>
        </div>
        <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
          <span className="muted">{count} question templates match.</span>
          <button className="primary" disabled={count === 0} onClick={() => onStart({ setId, durationSec: duration, topics: chosen, minDiff, maxDiff })}>
            ▶ Start sprint
          </button>
        </div>
      </div>
    </div>
  )
}

type VizQuestion = GeneratedQuestion & { template: VizTemplate }

function VizSprint({ company, set, settings, platform, onExit }: { company: Company; set: VizSet; settings: VizSprintSettings; platform: Platform; onExit: () => void }) {
  const content = useContent()
  const dbDef = content.databases.get(set.database)!
  const pool = () => set.questions.filter((q) => settings.topics.includes(q.topic) && q.difficulty >= settings.minDiff && q.difficulty <= settings.maxDiff)
  const [queue, setQueue] = useState<VizTemplate[]>(() => shuffle(pool()).sort((a, b) => Math.floor((a.difficulty - 1) / 2) - Math.floor((b.difficulty - 1) / 2)))
  const [current, setCurrent] = useState<VizQuestion | null>(null)
  const [attempts, setAttempts] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'good' | 'bad' | 'warn'; text: string } | null>(null)
  const [finished, setFinished] = useState(false)
  const wb = useWorkbench(dbDef, () => setFeedback((f) => (f?.kind === 'bad' ? null : f)), current?.template.id ?? '')
  const { score, streak, bestStreak, history, startQuestion, award, miss, breakStreak } = useSprintScore<VizQuestion>()
  const clock = useSprintClock(settings.durationSec, !finished && wb.ready)
  const timed = settings.durationSec > 0
  const advancing = useRef(false)

  useEffect(() => {
    if (clock.expired) setFinished(true)
  }, [clock.expired])

  useEffect(() => {
    if (!wb.ready || !wb.db || current || finished) return
    let q: VizQuestion | null = null
    let rest = [...queue]
    if (!rest.length) rest = shuffle(pool())
    while (rest.length && !q) {
      const t = rest.shift()!
      const g = generateQuestion(wb.db, t)
      if (g) q = g as VizQuestion
    }
    setQueue(rest)
    setCurrent(q)
    setAttempts(0)
    setRevealed(false)
    setFeedback(null)
    startQuestion()
    advancing.current = false
    if (!q) setFinished(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wb.ready, current, finished])

  useEffect(() => {
    if (!finished) return
    updateProgress((p) => {
      p.vizSprints.sessions.push({
        date: new Date().toISOString(),
        setId: set.id,
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
    patchChatContext({ task: `Viz sprint question (${VIZ_TOPIC_LABELS[current.template.topic] ?? current.template.topic})`, brief: current.text, hints: current.template.hints, work: describeSpec(wb), grade: null, notes: `Reference SQL (for you only): ${current.sql}. Acceptable visual types: ${current.template.types.join(', ')}.` })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, wb.spec, wb.data])

  const submit = () => {
    if (!current || revealed || advancing.current) return
    const r = gradeVizSprint({ ...wb.spec, sort: wb.spec.sort ?? defaultSort(wb.spec) }, wb.data.rs, current.expected, current.template, content.notation)
    const n = attempts + 1
    setAttempts(n)
    if (r.ok) {
      const { earned, streakMult, speed } = award(current, current.points, n, timed)
      setFeedback({ kind: 'good', text: `Correct! +${earned} pts${streakMult > 1 ? ` (streak ×${streakMult.toFixed(1)})` : ''}${speed > 1 ? ` (speed ×${speed})` : ''}. Next question in a moment…` })
      advancing.current = true
      setTimeout(() => setCurrent(null), 1400)
    } else {
      breakStreak()
      const hint = n >= 2 && current.template.hints?.length ? ` Hint: ${current.template.hints[Math.min(n - 2, current.template.hints.length - 1)]}` : ''
      setFeedback({ kind: 'bad', text: `Not yet. ${r.reason}${hint}` })
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
    setFeedback({ kind: 'warn', text: `Reference query shown in the help panel. No points for this one.` })
  }
  useWorkbenchHotkeys(wb, submit)
  useHotkeys('Viz sprint', [
    { keys: 'alt+n', label: 'Skip / next', handler: () => (revealed ? setCurrent(null) : skip()), when: () => !!current },
    { keys: 'alt+s', label: 'Show solution (after 2 attempts)', handler: reveal, when: () => attempts >= 2 && !revealed },
  ])

  const helpSlot = (
    <Slot name="help">
      <div className="help-block">
        {current ? (
          <>
            <b>Question</b>
            <div className="brief" style={{ marginTop: 4 }}>
              {current.text}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Expected: {current.expected.columns.length} column{current.expected.columns.length === 1 ? '' : 's'}
              {current.expected.rows.length <= 50 ? `, ${current.expected.rows.length} row${current.expected.rows.length === 1 ? '' : 's'}` : ''}. Acceptable visuals: {current.template.types.length}.
            </div>
            {revealed && (
              <div style={{ marginTop: 8 }}>
                <b>Reference query</b>
                <pre style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{current.sql}</pre>
              </div>
            )}
          </>
        ) : (
          <span className="muted">Loading…</span>
        )}
        <details style={{ marginTop: 8, fontSize: 12 }}>
          <summary style={{ cursor: 'pointer' }}>Visualization principles</summary>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {content.notation.viz.principles.map((p) => (
              <li key={p.id}>{p.text}</li>
            ))}
          </ul>
        </details>
      </div>
    </Slot>
  )

  if (finished) {
    const correct = history.filter((h) => h.correct).length
    return (
      <div className="page">
        <h1>Sprint over · {company.name}</h1>
        <div className="panel">
          <div className="panel-head">Questions</div>
          <div className="panel-body">
            {history.map((h, i) => (
              <details key={i} style={{ marginBottom: 6 }}>
                <summary style={{ cursor: 'pointer' }}>
                  <span className={`badge ${h.correct ? 'good' : 'bad'}`}>{h.correct ? `+${h.earned}` : h.attempts ? 'wrong' : 'skipped'}</span> {h.q.text}{' '}
                  <span className="muted">({VIZ_TOPIC_LABELS[h.q.template.topic] ?? h.q.template.topic})</span>
                </summary>
                <pre style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{h.q.sql}</pre>
              </details>
            ))}
            {history.length === 0 && <span className="muted">No questions answered.</span>}
          </div>
        </div>
        <Slot name="help">
          <div className="help-block">
            <h3>Viz sprint</h3>
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

  const banner = current ? (
    <div className="sprint-banner">
      <div className="question">
        <span className="badge" style={{ marginRight: 8 }}>
          {VIZ_TOPIC_LABELS[current.template.topic] ?? current.template.topic} · {current.points} pts
        </span>
        {current.text}
      </div>
      {feedback && <div className={`feedback ${feedback.kind}`}>{feedback.text}</div>}
    </div>
  ) : (
    <div className="sprint-banner">
      <div className="muted">Loading database…</div>
    </div>
  )

  return (
    <div className="viz-frame">
      <Skin platform={platform} wb={wb} docTitle={`Sprint · ${set.title}`} onCheck={submit} checkLabel="Submit" banner={banner} />
      {helpSlot}
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
