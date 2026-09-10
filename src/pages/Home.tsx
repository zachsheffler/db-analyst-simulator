import { useRef, useState } from 'react'
import { loadUserPacks, saveUserPacks, useContent, validatePack } from '../content'
import { loadProgress, updateProgress } from '../lib/score'
import { notifyProgress } from '../App'
import type { ContentPack } from '../types/content'
import { Slot } from '../components/Slots'

/** Packs & player settings page. */
export function Home({ onReload }: { onReload: () => void }) {
  const content = useContent()
  const [name, setName] = useState(loadProgress().studentName)
  const [msg, setMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const userPacks = loadUserPacks()

  const importFile = async (f: File) => {
    try {
      const json = JSON.parse(await f.text()) as ContentPack
      const errs = validatePack(json)
      if (errs.length) {
        setMsg(`Pack rejected: ${errs.join(' ')}`)
        return
      }
      const packs = loadUserPacks().filter((p) => p.id !== json.id)
      packs.push(json)
      saveUserPacks(packs)
      setMsg(`Imported "${json.title}".`)
      onReload()
    } catch (e) {
      setMsg(`Could not read file: ${(e as Error).message}`)
    }
  }

  return (
    <div className="page">
      <h1>Player &amp; content packs</h1>
      {content.errors.length > 0 && (
        <div className="feedback warn">
          {content.errors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      )}
      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="panel-head">Player</div>
          <div className="panel-body">
            <label className="row">
              <span>Name (shown on your report card)</span>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  updateProgress((p) => (p.studentName = e.target.value))
                  notifyProgress()
                }}
              />
            </label>
            <p className="muted" style={{ fontSize: 12 }}>
              Progress is saved in this browser only. Use the Report card tab to export it.
            </p>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">Content packs</div>
          <div className="panel-body">
            <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>
              {content.packs.map((p) => (
                <li key={p.id}>
                  <b>{p.title}</b> <span className="muted">({p.id})</span>
                  {userPacks.some((u) => u.id === p.id) && (
                    <>
                      {' '}
                      <span className="badge">imported</span>{' '}
                      <button
                        className="small ghost danger"
                        onClick={() => {
                          saveUserPacks(loadUserPacks().filter((u) => u.id !== p.id))
                          onReload()
                        }}
                      >
                        remove
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
            <button onClick={() => fileRef.current?.click()}>Import pack (.json)</button>
            {msg && (
              <div className="muted" style={{ marginTop: 6 }}>
                {msg}
              </div>
            )}
          </div>
        </div>
      </div>
      <Slot name="help">
        <div className="help-block">
          <h3>Content packs</h3>
          <p>
            Employers, databases, and challenges come from JSON packs in <code>public/packs/</code>. Instructors generate packs from lecture notes with
            the prompts in the <code>prompts/</code> folder; students can import a pack file here for testing without a rebuild.
          </p>
          <p>Loaded companies: {content.companies.map((c) => c.name).join(', ') || 'none'}.</p>
        </div>
      </Slot>
    </div>
  )
}
