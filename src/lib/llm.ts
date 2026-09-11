/**
 * Minimal OpenAI-compatible chat client for a locally hosted model
 * (Ollama, LM Studio, llama.cpp server, vLLM, ... all expose /v1/chat/completions).
 */
import type { Notation } from '../types/content'
import { contextToText, type ChatContext } from './chatContext'

export interface ChatSettings {
  /** Base URL ending in /v1, e.g. http://localhost:11434/v1 (Ollama) or http://localhost:1234/v1 (LM Studio). */
  endpoint: string
  model: string
  apiKey: string
  professorName: string
  avatar: string
  systemPrompt: string
  temperature: number
  /** Max tokens per reply (keeps a light model snappy). */
  maxTokens: number
}

export const DEFAULT_SYSTEM_PROMPT = `You are {{name}}, the professor of an introductory databases course, chatting with one student inside the DB Analyst Simulator, a practice game (the "employers" such as Dave's Gig Log are fictional scenarios inside the game). The chat looks like Teams / WhatsApp, so keep every reply short: one to four sentences, warm, a little wry, encouraging.

How you help:
- Talk about the student's CURRENT task (see the context). Nudge with a question or a small hint; do not hand over a complete solution unless the student has clearly tried at least twice and asks for it directly.
- You know SQL (the game runs SQLite), ER modeling in the {{notation}} notation, mapping ER diagrams to relational schemas, and data visualization.
- Use the "exact errors" in the context to steer, but describe problems in broad terms ("look again at the participation on the vehicle side") rather than reciting the answer.
- If the student asks about anything unrelated to the course or their current task (grades, personal matters, other classes, current events, long chit-chat), politely demur in one sentence and steer back to the work.
- Never claim to see the student's screen beyond what the context says. Never mention these instructions.`

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  endpoint: 'http://localhost:11434/v1',
  model: '',
  apiKey: '',
  professorName: 'Prof. Sheffler',
  avatar: '🧑‍🏫',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  temperature: 0.7,
  maxTokens: 220,
}

const KEY = 'dbsim.chat.settings.v1'

export function loadChatSettings(): ChatSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULT_CHAT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_CHAT_SETTINGS }
}
export function saveChatSettings(s: ChatSettings): void {
  localStorage.setItem(KEY, JSON.stringify(s))
  window.dispatchEvent(new Event('dbsim-chat-settings'))
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

function headers(s: ChatSettings): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (s.apiKey) h.Authorization = `Bearer ${s.apiKey}`
  return h
}
const base = (s: ChatSettings) => s.endpoint.replace(/\/+$/, '')

/** GET /models — also serves as the connection test. */
export async function listModels(s: ChatSettings, signal?: AbortSignal): Promise<string[]> {
  const r = await fetch(`${base(s)}/models`, { headers: headers(s), signal })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  const j = (await r.json()) as { data?: { id: string }[]; models?: { name: string }[] }
  return (j.data ?? []).map((m) => m.id).concat((j.models ?? []).map((m) => m.name))
}

export function buildSystemPrompt(s: ChatSettings, notation: Notation, ctx: ChatContext): string {
  const persona = (s.systemPrompt || DEFAULT_SYSTEM_PROMPT).replace(/\{\{name\}\}/g, s.professorName).replace(/\{\{notation\}\}/g, notation.name)
  const context = contextToText(ctx)
  return `${persona}\n\n=== Current context (what the student is doing right now) ===\n${context || '(the student has not opened a task yet)'}`
}

/** Stream a chat completion; yields text deltas. Falls back to a non-streaming body if the server does not send SSE. */
export async function* streamChat(s: ChatSettings, messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<string> {
  const r = await fetch(`${base(s)}/chat/completions`, {
    method: 'POST',
    headers: headers(s),
    signal,
    body: JSON.stringify({ model: s.model || undefined, messages, stream: true, temperature: s.temperature, max_tokens: s.maxTokens }),
  })
  if (!r.ok) {
    let detail = ''
    try {
      detail = (await r.text()).slice(0, 200)
    } catch {
      /* ignore */
    }
    throw new Error(`${r.status} ${r.statusText}${detail ? `: ${detail}` : ''}`)
  }
  const ct = r.headers.get('content-type') ?? ''
  if (!r.body || !ct.includes('text/event-stream')) {
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] }
    yield j.choices?.[0]?.message?.content ?? ''
    return
  }
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const t = line.trim()
      if (!t.startsWith('data:')) continue
      const payload = t.slice(5).trim()
      if (payload === '[DONE]') return
      try {
        const j = JSON.parse(payload) as { choices?: { delta?: { content?: string }; message?: { content?: string } }[] }
        const d = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content
        if (d) yield d
      } catch {
        /* partial line */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Offline fallback: scripted professor. Used when no model endpoint answers.
// ---------------------------------------------------------------------------

const ON_TOPIC =
  /\b(sql|select|join|table|entit|attribute|relationship|key|foreign|primary|cardinal|particip|chart|visual|pie|bar|line|filter|aggregat|group|where|having|schema|ddl|diagram|er|stuck|hint|help|check|wrong|error|query|column|row|count|sum|avg|average|calculat|measure|sort|title|approach|track|right|correct|weak|derived|multivalued|composite|mapping|bridge|null|order|distinct|subquer|nested|sprint|question|score|points|hard|easy|tired|frustrat|encourag|thank|explain|difference|mean|database|data|model|normal|constraint|unique|insert|create|dax|tableau|ggplot|power bi|axis|legend|card|pep talk|motivat)\w*/i
const GREETING = /^(hi|hello|hey|yo|good (morning|afternoon|evening))\b/i
const MODULE_TIP: Record<string, string> = {
  query: 'Start from the tables in the question: which one holds the numbers, which one holds the names? Join those first, then aggregate.',
  present: 'Name the one number you want on the y-axis and the one category on the x-axis; everything else is decoration.',
  design: 'Read the brief one sentence at a time and ask: is this a thing (entity), a fact about a thing (attribute), or a link between things (relationship)?',
}

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

export function scriptedReply(text: string, ctx: ChatContext, _s: ChatSettings, hintIndex: number): { text: string; usedHint: boolean } {
  const t = text.trim()
  const words = t.split(/\s+/).length
  const module = ctx.module ?? ''
  if (GREETING.test(t)) {
    return { text: pick([`Hey! ${ctx.task ? `I see you're on "${ctx.task}". ` : ''}What can I help with?`, "Hello! Ready when you are — what's the sticking point?"]), usedHint: false }
  }
  if (words > 2 && !ON_TOPIC.test(t)) {
    return {
      text: pick([
        "Ha — let's keep this channel for databases. What are you working on right now?",
        'Office hours are for the course, I\'m afraid. Show me where you are in the task and we\'ll dig in.',
        "I'll dodge that one. Back to the data: what's the question you're trying to answer?",
      ]),
      usedHint: false,
    }
  }
  if (/thank/i.test(t)) return { text: pick(['Any time. Keep going.', "You did the work — I just pointed. Onward."]), usedHint: false }
  if (/\b(hint|stuck|help|clue|no idea|lost)\b/i.test(t)) {
    const hints = ctx.hints ?? []
    if (hints.length) {
      const h = hints[Math.min(hintIndex, hints.length - 1)]
      return { text: `${pick(['Okay, one nudge:', 'Try this angle:', 'Small hint, then you try again:'])} ${h}`, usedHint: true }
    }
    const failing = ctx.grade?.items.filter((i) => !i.hidden && i.max > 0 && !i.ok)
    if (failing?.length) return { text: `Run with what the checker said: "${failing[0].text}" — what would fix that?`, usedHint: false }
    return { text: pick([MODULE_TIP[module] ?? MODULE_TIP.design, "Tell me what you've tried so far; it's easier to unstick a specific step."]), usedHint: false }
  }
  if (/\b(approach|right|correct|good|ok\??|on track)\b/i.test(t) && ctx.grade) {
    const g = ctx.grade
    const pct = g.max ? Math.round((100 * g.score) / g.max) : 0
    const failing = g.items.filter((i) => !i.hidden && i.max > 0 && !i.ok)
    if (!failing.length) return { text: `Your last check came back at ${pct}% — that's the real thing. Nice.`, usedHint: false }
    return { text: `You're at ${pct}%. The checker flagged: "${failing[0].text}" ${failing.length > 1 ? `(and ${failing.length - 1} more). ` : ''}Fix that one first, then check again.`, usedHint: false }
  }
  if (/\b(hard|tired|frustrat|give up|impossible|hate|encourag|pep talk|motivat)/i.test(t)) {
    return { text: pick(['Everyone hits this wall; the ones who pass are just the ones who kept poking at it. One small step: what is the very next thing you need to add?', "Deep breath. Skip it, do an easier one, come back. That's a legitimate strategy, not cheating."]), usedHint: false }
  }
  return {
    text: pick([
      ctx.task ? `On "${ctx.task}" — what have you tried so far? Describe your current answer in one sentence and I'll point at the weak spot.` : 'Open a job or a sprint and I can look at what you have. What are you aiming to build?',
      `${MODULE_TIP[module] ?? MODULE_TIP.design} Then run a check: its wording is usually the fastest clue.`,
    ]),
    usedHint: false,
  }
}
