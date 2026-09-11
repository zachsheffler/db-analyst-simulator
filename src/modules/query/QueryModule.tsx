import { useEffect, useMemo, useRef, useState } from 'react'
import { useContent } from '../../content'
import type { Company, QuerySet, QueryTemplate } from '../../types/content'
import { DB, type ResultSet, type TableInfo } from '../../lib/sqlite'
import { compareResults } from '../../lib/resultCompare'
import { generateQuestion, shuffle, TOPIC_LABELS, type GeneratedQuestion } from '../../lib/questionGen'
import { updateProgress } from '../../lib/score'
import { notifyProgress } from '../../App'
import { ResultTable } from '../../components/ResultTable'
import { SchemaSidebar } from '../../components/SchemaSidebar'
import { Slot } from '../../components/Slots'
import { ControlBar, mmss } from '../../components/Controls'
import { useHotkeys } from '../../lib/hotkeys'
import { patchChatContext } from '../../lib/chatContext'

interface Settings {
  setId: string
  durationSec: number // 0 = untimed practice
  topics: string[]
  minDiff: number
  maxDiff: number
}

export function QueryModule({ company }: { company: Company }) {
  const content = useContent()
  const sets = content.queries.filter((q) => q.company === company.id)
  const [settings, setSettings] = useState<Settings | null>(null)
  if (!sets.length) {
    return (
      <div className="page">
        <h1>Query Workbench · {company.name}</h1>
        <p className="muted">No query sets for this employer yet.</p>
      </div>
    )
  }
  if (!settings) return <Setup company={company} sets={sets} onStart={setSettings} />
  const set = sets.find((q) => q.id === settings.setId)!
  return <Sprint set={set} company={company} settings={settings} onExit={() => setSettings(null)} />
}

function Setup({ company, sets, onStart }: { company: Company; sets: QuerySet[]; onStart: (s: Settings) => void }) {
  const [setId, setSetId] = useState(sets[0].id)
  const [duration, setDuration] = useState(300)
  const [minDiff, setMinDiff] = useState(1)
  const [maxDiff, setMaxDiff] = useState(5)
  const set = sets.find((s) => s.id === setId)!
  const topics = useMemo(() => [...new Set(set.questions.map((q) => q.topic))], [set])
  const [chosen, setChosen] = useState<string[]>([])
  useEffect(() => setChosen(topics), [topics])
  const count = set.questions.filter((q) => chosen.includes(q.topic) && q.difficulty >= minDiff && q.difficulty <= maxDiff).length
  const start = () => onStart({ setId, durationSec: duration, topics: chosen, minDiff, maxDiff })

  return (
    <div className="page">
      <h1>Query Workbench · {company.name}</h1>
      <p className="muted">Answer generated questions with real SQL. Points scale with difficulty; streaks and speed multiply them. Wrong answers cost nothing but time.</p>
      <div className="panel" style={{ maxWidth: 640 }}>
        <div className="panel-head">Set up a sprint</div>
        <div className="panel-body">
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
              <option value={180}>3 minutes</option>
              <option value={300}>5 minutes</option>
              <option value={600}>10 minutes</option>
              <option value={900}>15 minutes</option>
              <option value={0}>Practice (no timer, no speed bonus)</option>
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
                {TOPIC_LABELS[t] ?? t}
              </button>
            ))}
            <button className="small ghost" onClick={() => setChosen(topics)}>
              all
            </button>
          </div>
          <div className="muted" style={{ marginTop: 10 }}>
            {count} question templates match.
          </div>
        </div>
      </div>
      <Slot name="help">
        <div className="help-block">
          <h3>{company.name}</h3>
          <p>{company.description}</p>
          <h3>Scoring</h3>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Base points by difficulty: 10 / 15 / 20 / 30 / 40.</li>
            <li>Streak multiplier: +10% per consecutive correct answer, up to 2×.</li>
            <li>Speed bonus (timed only): +50% under 60 s, +25% under 2 min.</li>
            <li>Second attempt earns 60%, third or later 30%. Revealing the solution earns 0.</li>
            <li>Skipping is free but resets your streak.</li>
          </ul>
          <p className="muted" style={{ fontSize: 12 }}>
            Results are compared as sets of rows: column names and column order do not matter; row order only matters when the question asks for sorting.
          </p>
        </div>
      </Slot>
      <Slot name="controls">
        <ControlBar clock={duration ? mmss(duration) : '∞'} clockLabel={duration ? 'sprint length' : 'practice mode'}>
          <button className="primary" disabled={count === 0} onClick={start}>
            ▶ Start sprint
          </button>
        </ControlBar>
      </Slot>
    </div>
  )
}

interface Answered {
  q: GeneratedQuestion
  correct: boolean
  earned: number
  attempts: number
}

function Sprint({ set, company, settings, onExit }: { set: QuerySet; company: Company; settings: Settings; onExit: () => void }) {
  const content = useContent()
  const dbDef = content.databases.get(set.database)!
  const dbRef = useRef<DB | null>(null)
  const [tables, setTables] = useState<TableInfo[]>([])
  const [ready, setReady] = useState(false)
  const [queue, setQueue] = useState<QueryTemplate[]>([])
  const [current, setCurrent] = useState<GeneratedQuestion | null>(null)
  const [sql, setSql] = useState('')
  const [result, setResult] = useState<ResultSet | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'good' | 'bad' | 'warn'; text: string } | null>(null)
  const [attempts, setAttempts] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [history, setHistory] = useState<Answered[]>([])
  const [timeLeft, setTimeLeft] = useState(settings.durationSec)
  const [elapsed, setElapsed] = useState(0)
  const [finished, setFinished] = useState(false)
  const qStart = useRef(Date.now())
  const editorRef = useRef<HTMLTextAreaElement>(null)

  const pool = () => set.questions.filter((q) => settings.topics.includes(q.topic) && q.difficulty >= settings.minDiff && q.difficulty <= settings.maxDiff)

  useEffect(() => {
    let alive = true
    DB.create([...dbDef.ddl, ...dbDef.seed]).then((db) => {
      if (!alive) {
        db.close()
        return
      }
      dbRef.current = db
      setTables(db.describe())
      // shuffle, then ramp difficulty: easy band first
      setQueue(shuffle(pool()).sort((a, b) => Math.floor((a.difficulty - 1) / 2) - Math.floor((b.difficulty - 1) / 2)))
      setReady(true)
    })
    return () => {
      alive = false
      dbRef.current?.close()
      dbRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!ready || current || finished) return
    nextQuestion()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, current, finished])

  useEffect(() => {
    if (finished || !ready) return
    const id = setInterval(() => {
      setElapsed((e) => e + 1)
      if (settings.durationSec) {
        setTimeLeft((t) => {
          if (t <= 1) {
            clearInterval(id)
            setFinished(true)
            return 0
          }
          return t - 1
        })
      }
    }, 1000)
    return () => clearInterval(id)
  }, [settings.durationSec, finished, ready])

  useEffect(() => {
    if (!finished) return
    updateProgress((p) => {
      p.query.sessions.push({
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
    patchChatContext({
      task: `SQL sprint question (${TOPIC_LABELS[current.template.topic] ?? current.template.topic})`,
      brief: current.text,
      hints: current.template.hints,
      work: sql.trim() ? `SQL so far:\n${sql}${error ? `\nError: ${error}` : ''}${feedback ? `\nLast feedback: ${feedback.text}` : ''}` : '(no SQL typed yet)',
      grade: null,
      notes: `Reference SQL (for you only, never paste it): ${current.sql}`,
    })
  }, [current, sql, error, feedback])

  const nextQuestion = () => {
    const db = dbRef.current
    if (!db) return
    let q: GeneratedQuestion | null = null
    let rest = [...queue]
    if (!rest.length) rest = shuffle(pool())
    while (rest.length && !q) {
      const t = rest.shift()!
      q = generateQuestion(db, t)
    }
    setQueue(rest)
    setCurrent(q)
    setSql('')
    setResult(null)
    setError(null)
    setFeedback(null)
    setAttempts(0)
    setRevealed(false)
    qStart.current = Date.now()
    setTimeout(() => editorRef.current?.focus(), 0)
    if (!q) setFinished(true)
  }

  const runSql = (): ResultSet | null => {
    const db = dbRef.current
    if (!db) return null
    setError(null)
    try {
      const trimmed = sql.trim().replace(/;\s*$/, '')
      if (!/^\s*(select|with)\b/i.test(trimmed)) {
        setError('Only SELECT queries are allowed in the sprint.')
        return null
      }
      const rs = db.query(trimmed, 2000)
      setResult(rs)
      return rs
    } catch (e) {
      setError((e as Error).message)
      setResult(null)
      return null
    }
  }

  const submit = () => {
    if (!current || revealed) return
    const rs = runSql()
    if (!rs) return
    const cmp = compareResults(rs, current.expected, !!current.template.orderMatters)
    const n = attempts + 1
    setAttempts(n)
    if (cmp.ok) {
      const secs = (Date.now() - qStart.current) / 1000
      const attemptFactor = n === 1 ? 1 : n === 2 ? 0.6 : 0.3
      const streakMult = Math.min(2, 1 + 0.1 * streak)
      const speed = settings.durationSec ? (secs < 60 ? 1.5 : secs < 120 ? 1.25 : 1) : 1
      const earned = Math.round(current.points * attemptFactor * streakMult * speed)
      setScore((s) => s + earned)
      const ns = streak + 1
      setStreak(ns)
      setBestStreak((b) => Math.max(b, ns))
      setHistory((h) => [...h, { q: current, correct: true, earned, attempts: n }])
      setFeedback({
        kind: 'good',
        text: `Correct! +${earned} pts${streakMult > 1 ? ` (streak ×${streakMult.toFixed(1)})` : ''}${speed > 1 ? ` (speed ×${speed})` : ''}. Next question in a moment…`,
      })
      setTimeout(() => setCurrent(null), 1400)
    } else {
      setStreak(0)
      const hint = n >= 2 && current.template.hints?.length ? ` Hint: ${current.template.hints[Math.min(n - 2, current.template.hints.length - 1)]}` : ''
      setFeedback({ kind: 'bad', text: `Not yet. ${cmp.reason}${hint}` })
    }
  }

  const skip = () => {
    if (!current) return
    setStreak(0)
    setHistory((h) => [...h, { q: current, correct: false, earned: 0, attempts }])
    setCurrent(null)
  }
  const reveal = () => {
    if (!current) return
    setRevealed(true)
    setStreak(0)
    setHistory((h) => [...h, { q: current, correct: false, earned: 0, attempts }])
    setFeedback({ kind: 'warn', text: 'Solution shown below. No points for this one. Study it, then continue.' })
  }

  useHotkeys('SQL sprint', [
    { keys: 'ctrl+enter', label: 'Run the query', handler: runSql, when: () => !!current },
    { keys: 'ctrl+shift+enter', label: 'Submit the answer', handler: submit, when: () => !!current && !revealed },
    { keys: 'alt+n', label: 'Skip / next', handler: () => (revealed ? setCurrent(null) : skip()), when: () => !!current },
    { keys: 'alt+s', label: 'Show solution (after 2 attempts)', handler: reveal, when: () => attempts >= 2 && !revealed },
  ])

  const helpSlot = (
    <Slot name="help">
      <div className="help-block">
        <h3>{dbDef.name}</h3>
        {dbDef.description && (
          <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
            {dbDef.description}
          </p>
        )}
        <SchemaSidebar tables={tables} notes={dbDef.tableNotes} />
        <details style={{ marginTop: 8 }}>
          <summary>
            <b>SQL notes</b>
          </summary>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>
            {content.notation.sql.dialectNotes.map((r, i) => (
              <li key={i}>{r}</li>
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
                  <span className="muted">({TOPIC_LABELS[h.q.template.topic] ?? h.q.template.topic})</span>
                </summary>
                <pre style={{ marginTop: 6 }}>{h.q.sql}</pre>
              </details>
            ))}
            {history.length === 0 && <span className="muted">No questions answered.</span>}
          </div>
        </div>
        {helpSlot}
        <Slot name="controls">
          <ControlBar
            clock={mmss(elapsed)}
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
    <div className="page wide">
      {!ready && <p className="muted">Loading database…</p>}
      {current && (
        <>
          <div className="question">
            <span className="badge" style={{ marginRight: 8 }}>
              {TOPIC_LABELS[current.template.topic] ?? current.template.topic} · {current.points} pts
            </span>
            {current.text}
          </div>
          <textarea
            ref={editorRef}
            className="code"
            style={{ marginTop: 8, minHeight: 120 }}
            value={sql}
            spellCheck={false}
            placeholder="SELECT ...   (Ctrl+Enter to run, Ctrl+Shift+Enter to submit, Alt+N to skip)"
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault()
                if (e.shiftKey) submit()
                else runSql()
              }
            }}
          />
          {feedback && <div className={`feedback ${feedback.kind}`}>{feedback.text}</div>}
          {error && <div className="feedback bad">SQL error: {error}</div>}
          {revealed && <pre style={{ margin: '8px 0' }}>{current.sql}</pre>}
          {result && (
            <div style={{ marginTop: 8 }}>
              <ResultTable rs={result} />
            </div>
          )}
          {!result && !error && (
            <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
              Expected result: {current.expected.columns.length} column{current.expected.columns.length === 1 ? '' : 's'}
              {current.expected.rows.length <= 50 ? `, ${current.expected.rows.length} row${current.expected.rows.length === 1 ? '' : 's'}` : ''}.
            </div>
          )}
        </>
      )}
      {helpSlot}
      <Slot name="controls">
        <ControlBar
          clock={settings.durationSec ? mmss(timeLeft) : mmss(elapsed)}
          clockLabel={settings.durationSec ? 'time left' : 'practice · elapsed'}
          clockClass={settings.durationSec && timeLeft <= 30 ? 'low' : ''}
          stats={[
            { label: 'Score', value: score },
            { label: 'Streak', value: streak > 0 ? `🔥${streak}` : '–' },
            { label: 'Solved', value: history.filter((h) => h.correct).length },
          ]}
        >
          <button onClick={runSql} disabled={!sql.trim() || !current}>
            Run
          </button>
          <button className="primary" onClick={submit} disabled={!sql.trim() || revealed || !current}>
            Submit
          </button>
          {attempts >= 2 && !revealed && (
            <button onClick={reveal} className="ghost">
              Show solution
            </button>
          )}
          <button onClick={revealed ? () => setCurrent(null) : skip} className="ghost" disabled={!current}>
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
