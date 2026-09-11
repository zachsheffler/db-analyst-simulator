import { useRef, useState } from 'react'
import { loadUserPacks, saveUserPacks, useContent, validatePack } from '../content'
import { loadProgress, updateProgress } from '../lib/score'
import { notifyProgress } from '../App'
import type { ContentPack } from '../types/content'
import { Slot } from '../components/Slots'
import { DEFAULT_CHAT_SETTINGS, DEFAULT_SYSTEM_PROMPT, listModels, loadChatSettings, saveChatSettings, streamChat, type ChatSettings } from '../lib/llm'

/** Settings (player, professor chat) & content packs page. */
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
      <h1>Settings &amp; content packs</h1>
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
      <ChatSettingsPanel />
      <Slot name="help">
        <div className="help-block">
          <h3>Professor chat</h3>
          <p>
            The chat panel talks to any OpenAI-compatible endpoint you run yourself: <b>Ollama</b> (<code>http://localhost:11434/v1</code>), <b>LM Studio</b> (
            <code>http://localhost:1234/v1</code>), llama.cpp's server, vLLM… A small instruction-tuned model that knows SQL is plenty; the persona and the current task are sent
            as the system prompt with every message.
          </p>
          <p className="muted" style={{ fontSize: 12 }}>
            The browser must be allowed to call the endpoint (CORS). Ollama: start it with <code>OLLAMA_ORIGINS=*</code>; LM Studio: enable CORS in the server tab. Without a model the
            professor falls back to short scripted replies.
          </p>
          <h3>Content packs</h3>
          <p>
            Employers, databases, and challenges come from JSON packs in <code>public/packs/</code>. Instructors generate packs from lecture notes with the prompts in the{' '}
            <code>prompts/</code> folder; students can import a pack file here for testing without a rebuild.
          </p>
          <p>Loaded companies: {content.companies.map((c) => c.name).join(', ') || 'none'}.</p>
        </div>
      </Slot>
    </div>
  )
}

function ChatSettingsPanel() {
  const [s, setS] = useState<ChatSettings>(loadChatSettings)
  const [models, setModels] = useState<string[]>([])
  const [test, setTest] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<ChatSettings>) => {
    const next = { ...s, ...patch }
    setS(next)
    saveChatSettings(next)
  }
  const fetchModels = async () => {
    setBusy(true)
    setTest(null)
    try {
      const m = await listModels(s)
      setModels(m)
      setTest(m.length ? `Connected. ${m.length} model(s) available.` : 'Connected, but the server lists no models.')
      if (!s.model && m.length) set({ model: m[0] })
    } catch (e) {
      setTest(`Cannot reach ${s.endpoint}: ${(e as Error).message}. Is the server running and CORS enabled?`)
    } finally {
      setBusy(false)
    }
  }
  const testChat = async () => {
    setBusy(true)
    setTest('Asking the model to say hello…')
    try {
      let out = ''
      for await (const d of streamChat({ ...s, maxTokens: 60 }, [{ role: 'system', content: `You are ${s.professorName}. Reply in one short sentence.` }, { role: 'user', content: 'Say hello to the class.' }])) out += d
      setTest(`Model replied: "${out.trim()}"`)
    } catch (e) {
      setTest(`Chat failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="panel-head">Professor chat — model &amp; persona</div>
      <div className="panel-body">
        <div className="grid-2">
          <div>
            <label className="row" style={{ marginBottom: 6 }}>
              <span style={{ width: 120 }}>Endpoint</span>
              <input type="text" style={{ flex: 1 }} value={s.endpoint} placeholder="http://localhost:11434/v1" onChange={(e) => set({ endpoint: e.target.value })} />
            </label>
            <label className="row" style={{ marginBottom: 6 }}>
              <span style={{ width: 120 }}>Model</span>
              <input type="text" style={{ flex: 1 }} list="dbsim-models" value={s.model} placeholder="e.g. llama3.2:3b, qwen2.5:3b" onChange={(e) => set({ model: e.target.value })} />
              <datalist id="dbsim-models">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </label>
            <label className="row" style={{ marginBottom: 6 }}>
              <span style={{ width: 120 }}>API key</span>
              <input type="password" style={{ flex: 1 }} value={s.apiKey} placeholder="(optional)" onChange={(e) => set({ apiKey: e.target.value })} />
            </label>
            <label className="row" style={{ marginBottom: 6 }}>
              <span style={{ width: 120 }}>Temperature</span>
              <input type="number" step={0.1} min={0} max={1.5} style={{ width: 80 }} value={s.temperature} onChange={(e) => set({ temperature: Number(e.target.value) })} />
              <span style={{ width: 90, textAlign: 'right' }}>Max tokens</span>
              <input type="number" step={20} min={40} max={2000} style={{ width: 80 }} value={s.maxTokens} onChange={(e) => set({ maxTokens: Number(e.target.value) })} />
            </label>
            <div className="row">
              <button onClick={fetchModels} disabled={busy}>
                Test connection / list models
              </button>
              <button onClick={testChat} disabled={busy || !s.endpoint}>
                Test chat
              </button>
            </div>
            {test && (
              <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                {test}
              </div>
            )}
          </div>
          <div>
            <label className="row" style={{ marginBottom: 6 }}>
              <span style={{ width: 120 }}>Professor name</span>
              <input type="text" style={{ flex: 1 }} value={s.professorName} onChange={(e) => set({ professorName: e.target.value })} />
              <input type="text" style={{ width: 56, textAlign: 'center' }} value={s.avatar} title="Avatar emoji" onChange={(e) => set({ avatar: e.target.value })} />
            </label>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
              <span>Persona (system prompt)</span>
              <button className="small ghost" onClick={() => set({ systemPrompt: DEFAULT_SYSTEM_PROMPT })}>
                reset to default
              </button>
            </div>
            <textarea className="code" style={{ minHeight: 150, fontFamily: 'inherit', fontSize: 12 }} value={s.systemPrompt} onChange={(e) => set({ systemPrompt: e.target.value })} />
            <div className="muted" style={{ fontSize: 11 }}>
              {'{{name}}'} and {'{{notation}}'} are substituted. The current task, the student's work and the latest check (including the exact errors, marked "for you only") are appended
              automatically.
            </div>
          </div>
        </div>
        <button className="small ghost" style={{ marginTop: 8 }} onClick={() => set({ ...DEFAULT_CHAT_SETTINGS })}>
          Reset all chat settings
        </button>
      </div>
    </div>
  )
}
