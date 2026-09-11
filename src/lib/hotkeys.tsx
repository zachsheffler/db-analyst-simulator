import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Keyboard shortcuts. Modules register bindings for a named scope; the most
 * recently registered scope gets first crack at a key. Plain letter shortcuts
 * are ignored while typing in an input; ctrl/alt combos and Escape work anywhere.
 * Press ? (or click ⌨) to see everything currently bound.
 */
export interface Hotkey {
  /** e.g. "ctrl+enter", "shift+arrowup", "e", "?", "delete" */
  keys: string
  label: string
  handler: (e: KeyboardEvent) => void | boolean
  /** Fire even when focus is in an input/textarea/select. */
  inInputs?: boolean
  /** Only fire when this returns true (defaults to always). */
  when?: () => boolean
}

interface Entry {
  id: number
  scope: string
  ref: { current: Hotkey[] }
}

interface HotkeysState {
  register: (scope: string, ref: { current: Hotkey[] }) => () => void
  entries: () => Entry[]
  toggleHelp: () => void
  help: boolean
}

const Ctx = createContext<HotkeysState | null>(null)
let nextId = 1

function keyOf(e: KeyboardEvent): string {
  const k = e.key
  if (k === ' ') return 'space'
  return k.length === 1 ? k.toLowerCase() : k.toLowerCase()
}

export function matches(keys: string, e: KeyboardEvent): boolean {
  const parts = keys.toLowerCase().split('+')
  const key = parts.pop()!
  const ctrl = parts.includes('ctrl') || parts.includes('cmd') || parts.includes('meta')
  const shift = parts.includes('shift')
  const alt = parts.includes('alt')
  if (keyOf(e) !== key) return false
  if ((e.ctrlKey || e.metaKey) !== ctrl) return false
  if (e.altKey !== alt) return false
  const symbol = key.length === 1 && !/[a-z0-9]/.test(key)
  if (!symbol && e.shiftKey !== shift) return false
  return true
}

export function isEditable(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null
  if (!t || !t.tagName) return false
  if (t.isContentEditable) return true
  const tag = t.tagName.toLowerCase()
  if (tag === 'textarea' || tag === 'select') return true
  if (tag === 'input') return !['checkbox', 'radio', 'button', 'submit', 'range'].includes((t as HTMLInputElement).type)
  return false
}

export function HotkeysProvider({ children }: { children: ReactNode }) {
  const entriesRef = useRef<Entry[]>([])
  const [help, setHelp] = useState(false)
  const [, bump] = useState(0)
  const helpRef = useRef(false)
  helpRef.current = help

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      const editable = isEditable(e.target)
      // help overlay
      if (matches('?', e) && !editable) {
        e.preventDefault()
        setHelp((h) => !h)
        return
      }
      if (helpRef.current && matches('escape', e)) {
        setHelp(false)
        return
      }
      const list = entriesRef.current
      for (let i = list.length - 1; i >= 0; i--) {
        for (const b of list[i].ref.current) {
          if (!matches(b.keys, e)) continue
          const combo = /ctrl|alt|cmd|meta/.test(b.keys) || /^(escape|f\d+)$/.test(b.keys)
          if (editable && !b.inInputs && !combo) continue
          if (b.when && !b.when()) continue
          const r = b.handler(e)
          if (r === false) continue
          e.preventDefault()
          return
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const state: HotkeysState = {
    register: (scope, ref) => {
      const entry: Entry = { id: nextId++, scope, ref }
      entriesRef.current = [...entriesRef.current, entry]
      bump((x) => x + 1)
      return () => {
        entriesRef.current = entriesRef.current.filter((e) => e !== entry)
        bump((x) => x + 1)
      }
    },
    entries: () => entriesRef.current,
    toggleHelp: () => setHelp((h) => !h),
    help,
  }
  return (
    <Ctx.Provider value={state}>
      {children}
      {help && <HotkeyHelp entries={entriesRef.current} onClose={() => setHelp(false)} />}
    </Ctx.Provider>
  )
}

/** Register a scope of bindings for the lifetime of the component. Handlers always see fresh closures. */
export function useHotkeys(scope: string, bindings: Hotkey[]): void {
  const ctx = useContext(Ctx)
  const ref = useRef<Hotkey[]>(bindings)
  ref.current = bindings
  useEffect(() => {
    if (!ctx) return
    return ctx.register(scope, ref)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope])
}

export function useHotkeyHelp(): () => void {
  const ctx = useContext(Ctx)
  return ctx ? ctx.toggleHelp : () => {}
}

export function prettyKeys(keys: string): ReactNode {
  const map: Record<string, string> = {
    ctrl: 'Ctrl',
    shift: 'Shift',
    alt: 'Alt',
    enter: 'Enter',
    escape: 'Esc',
    delete: 'Del',
    backspace: '⌫',
    arrowup: '↑',
    arrowdown: '↓',
    arrowleft: '←',
    arrowright: '→',
    space: 'Space',
  }
  return keys.split('+').map((k, i, arr) => (
    <span key={i}>
      <kbd>{map[k] ?? (k.length === 1 ? k.toUpperCase() : k)}</kbd>
      {i < arr.length - 1 ? ' + ' : ''}
    </span>
  ))
}

function HotkeyHelp({ entries, onClose }: { entries: Entry[]; onClose: () => void }) {
  const groups = new Map<string, Hotkey[]>()
  for (const e of entries) groups.set(e.scope, [...(groups.get(e.scope) ?? []), ...e.ref.current])
  return (
    <div className="hk-overlay" onClick={onClose}>
      <div className="hk-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Keyboard shortcuts</h2>
          <button className="ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="hk-groups">
          <div className="hk-group">
            <h3>Everywhere</h3>
            <div className="hk-row">
              <span>{prettyKeys('?')}</span>
              <span>Show / hide this sheet</span>
            </div>
          </div>
          {[...groups].map(([scope, list]) => (
            <div key={scope} className="hk-group">
              <h3>{scope}</h3>
              {list.map((b, i) => (
                <div key={i} className="hk-row">
                  <span>{prettyKeys(b.keys)}</span>
                  <span>{b.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          Letter shortcuts pause while you type in a text box; press Enter or Esc to leave the box and get them back.
        </p>
      </div>
    </div>
  )
}
