import { useEffect, useRef, useState } from 'react'
import { useContent } from '../content'
import { getChatContext, useChatContext } from '../lib/chatContext'
import { buildSystemPrompt, listModels, loadChatSettings, scriptedReply, streamChat, type ChatMessage, type ChatSettings } from '../lib/llm'

interface Msg {
  id: number
  role: 'user' | 'assistant'
  text: string
  at: number
  pending?: boolean
  error?: boolean
}

const HIST_KEY = 'dbsim.chat.history.v1'
function loadHistory(): Msg[] {
  try {
    const raw = localStorage.getItem(HIST_KEY)
    if (raw) return (JSON.parse(raw) as Msg[]).filter((m) => !m.pending)
  } catch {
    /* ignore */
  }
  return []
}

const QUICK = ["I'm stuck", 'A hint?', 'Am I on track?', 'Encourage me']

const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** Teams / WhatsApp-style chat with the professor. */
export function ChatPanel() {
  const content = useContent()
  const ctx = useChatContext()
  const [settings, setSettings] = useState<ChatSettings>(loadChatSettings)
  const [msgs, setMsgs] = useState<Msg[]>(loadHistory)
  const [input, setInput] = useState('')
  const [online, setOnline] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [menu, setMenu] = useState(false)
  const hintIdx = useRef(0)
  const logRef = useRef<HTMLDivElement>(null)
  const abort = useRef<AbortController | null>(null)
  const nextId = useRef(Date.now())

  useEffect(() => {
    const h = () => setSettings(loadChatSettings())
    window.addEventListener('dbsim-chat-settings', h)
    return () => window.removeEventListener('dbsim-chat-settings', h)
  }, [])
  // probe the endpoint when settings change (and every couple of minutes while offline)
  useEffect(() => {
    let alive = true
    const probe = async () => {
      if (!settings.endpoint) return setOnline(false)
      try {
        const ac = new AbortController()
        const t = setTimeout(() => ac.abort(), 2500)
        await listModels(settings, ac.signal)
        clearTimeout(t)
        if (alive) setOnline(true)
      } catch {
        if (alive) setOnline(false)
      }
    }
    probe()
    const id = setInterval(() => online === false && probe(), 120000)
    return () => {
      alive = false
      clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.endpoint, settings.apiKey])
  useEffect(() => {
    localStorage.setItem(HIST_KEY, JSON.stringify(msgs.slice(-60)))
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [msgs])
  useEffect(() => () => abort.current?.abort(), [])

  const push = (m: Omit<Msg, 'id' | 'at'>) => {
    const id = nextId.current++
    setMsgs((h) => [...h, { ...m, id, at: Date.now() }])
    return id
  }
  const patch = (id: number, fn: (m: Msg) => Msg) => setMsgs((h) => h.map((m) => (m.id === id ? fn(m) : m)))

  const send = async (text: string) => {
    const t = text.trim()
    if (!t || busy) return
    setInput('')
    push({ role: 'user', text: t })
    setBusy(true)
    const replyId = push({ role: 'assistant', text: '', pending: true })
    const live = getChatContext()
    if (online) {
      const system: ChatMessage = { role: 'system', content: buildSystemPrompt(settings, content.notation, live) }
      const history: ChatMessage[] = msgs
        .filter((m) => !m.pending && !m.error)
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.text }))
      history.push({ role: 'user', content: t })
      abort.current?.abort()
      const ac = new AbortController()
      abort.current = ac
      let acc = ''
      try {
        for await (const delta of streamChat(settings, [system, ...history], ac.signal)) {
          acc += delta
          patch(replyId, (m) => ({ ...m, text: acc }))
        }
        patch(replyId, (m) => ({ ...m, text: acc.trim() || '…', pending: false }))
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setOnline(false)
        const r = scriptedReply(t, live, settings, hintIdx.current)
        if (r.usedHint) hintIdx.current++
        patch(replyId, (m) => ({ ...m, text: `${r.text}\n\n(Model offline: ${(e as Error).message}. Using scripted replies.)`, pending: false }))
      } finally {
        setBusy(false)
      }
    } else {
      // scripted fallback with a little typing delay
      const r = scriptedReply(t, live, settings, hintIdx.current)
      if (r.usedHint) hintIdx.current++
      setTimeout(() => {
        patch(replyId, (m) => ({ ...m, text: r.text, pending: false }))
        setBusy(false)
      }, 500 + Math.min(1500, r.text.length * 12))
    }
  }

  const status = online === null ? 'connecting…' : online ? `online · ${settings.model || 'default model'}` : 'offline · scripted replies'
  return (
    <div className="chat">
      <div className="chat-head">
        <div className="chat-avatar">{settings.avatar || '🧑‍🏫'}</div>
        <div className="chat-who">
          <div className="chat-name">{settings.professorName}</div>
          <div className={`chat-status ${online ? 'on' : 'off'}`}>
            <span className="dot" /> {status}
          </div>
        </div>
        <div className="chat-tools">
          <button className="ghost" title="Chat menu" onClick={() => setMenu((m) => !m)}>
            ⋮
          </button>
          {menu && (
            <div className="chat-menu" onMouseLeave={() => setMenu(false)}>
              <div
                onClick={() => {
                  setMenu(false)
                  window.dispatchEvent(new Event('dbsim-open-settings'))
                }}
              >
                ⚙ Model &amp; persona settings
              </div>
              <div
                onClick={() => {
                  setMenu(false)
                  setMsgs([])
                  hintIdx.current = 0
                }}
              >
                🧹 Clear conversation
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="chat-log" ref={logRef}>
        {msgs.length === 0 && (
          <div className="chat-day">
            <span>
              {settings.professorName} is here for advice on the current task. Ask for a hint, a sanity check, or a pep talk.{' '}
              {online === false && 'Connect a local model under Settings for real conversation; until then replies are scripted.'}
            </span>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={`chat-msg ${m.role === 'user' ? 'me' : 'them'} ${m.error ? 'err' : ''}`}>
            {m.pending && !m.text ? (
              <span className="typing">
                <i />
                <i />
                <i />
              </span>
            ) : (
              <span className="chat-text">{m.text}</span>
            )}
            <span className="chat-time">
              {hhmm(m.at)}
              {m.role === 'user' && <span className="ticks">✓✓</span>}
            </span>
          </div>
        ))}
      </div>
      <div className="chat-quick">
        {QUICK.map((q) => (
          <button key={q} className="small" onClick={() => send(q)} disabled={busy}>
            {q}
          </button>
        ))}
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
      >
        <input
          type="text"
          placeholder={`Message ${settings.professorName}…`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') (e.target as HTMLInputElement).blur()
          }}
        />
        <button type="submit" className="primary" disabled={busy || !input.trim()} title="Send">
          ➤
        </button>
      </form>
      {ctx.task && <div className="chat-ctx muted">talking about: {ctx.task}</div>}
    </div>
  )
}
