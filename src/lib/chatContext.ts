/**
 * A tiny store describing what the student is doing right now, so the
 * professor chat can give relevant nudges. Modules call setChatContext /
 * patchChatContext as the student works.
 */
import { useEffect, useState } from 'react'
import type { Grade } from './grade'

export interface ChatContext {
  company?: string | null
  /** design | query | present | report | packs */
  module?: string
  /** What the student is doing, e.g. "ER diagram step of job X" or "SQL sprint question". */
  task?: string
  /** The brief / question text. */
  brief?: string
  /** Hints the content author wrote (never revealed wholesale; the tutor may paraphrase one). */
  hints?: string[]
  /** A compact description of the student's current work (SQL text, diagram summary, visual spec). */
  work?: string
  /** The last grade or check result, including hidden detail items. */
  grade?: Grade | null
  /** Free-form extra notes for the tutor (e.g. reference solution, for the tutor's eyes only). */
  notes?: string
}

let current: ChatContext = {}
const listeners = new Set<(c: ChatContext) => void>()

export function setChatContext(c: ChatContext): void {
  current = { ...c }
  for (const l of listeners) l(current)
}
export function patchChatContext(p: Partial<ChatContext>): void {
  current = { ...current, ...p }
  for (const l of listeners) l(current)
}
export function getChatContext(): ChatContext {
  return current
}
export function useChatContext(): ChatContext {
  const [c, setC] = useState(current)
  useEffect(() => {
    listeners.add(setC)
    return () => {
      listeners.delete(setC)
    }
  }, [])
  return c
}

/** Render the context as text for the model's system prompt. */
export function contextToText(c: ChatContext): string {
  const lines: string[] = []
  if (c.company) lines.push(`Employer (game scenario): ${c.company}`)
  if (c.module) lines.push(`Module: ${{ design: 'Diagramming (ER → schema → DDL)', query: 'Query Workbench (SQL sprint)', present: 'Viz (chart builder)' }[c.module] ?? c.module}`)
  if (c.task) lines.push(`Task: ${c.task}`)
  if (c.brief) lines.push(`Brief / question:\n${c.brief}`)
  if (c.work) lines.push(`Student's current work:\n${c.work}`)
  if (c.grade) {
    const g = c.grade
    const vis = g.items.filter((i) => !i.hidden && i.max > 0 && !i.ok).map((i) => `- ${i.text}`)
    const hid = g.items.filter((i) => i.hidden).map((i) => `- ${i.text}`)
    lines.push(`Last check: ${g.score}/${g.max}.${vis.length ? `\nShown to the student:\n${vis.join('\n')}` : ' Everything correct.'}${hid.length ? `\nExact errors (for you only; nudge, don't recite):\n${hid.join('\n')}` : ''}`)
  }
  if (c.hints?.length) lines.push(`Author hints (paraphrase at most one per reply, only if asked or clearly stuck):\n${c.hints.map((h) => `- ${h}`).join('\n')}`)
  if (c.notes) lines.push(c.notes)
  return lines.join('\n\n')
}
