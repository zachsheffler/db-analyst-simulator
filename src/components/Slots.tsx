import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Named slots: a module deep in the main panel can render content into the
 * "help" and "controls" panels of the 2x2 workspace via portals.
 */
export type SlotName = 'help' | 'controls'

interface SlotsState {
  els: Partial<Record<SlotName, HTMLElement | null>>
  counts: Partial<Record<SlotName, number>>
  setEl: (name: SlotName, el: HTMLElement | null) => void
  bump: (name: SlotName, delta: number) => void
}

const Ctx = createContext<SlotsState | null>(null)

export function SlotsProvider({ children }: { children: ReactNode }) {
  const [els, setEls] = useState<SlotsState['els']>({})
  const [counts, setCounts] = useState<SlotsState['counts']>({})
  const setEl = useCallback((name: SlotName, el: HTMLElement | null) => setEls((p) => (p[name] === el ? p : { ...p, [name]: el })), [])
  const bump = useCallback((name: SlotName, delta: number) => setCounts((p) => ({ ...p, [name]: (p[name] ?? 0) + delta })), [])
  return <Ctx.Provider value={{ els, counts, setEl, bump }}>{children}</Ctx.Provider>
}

/** The panel that receives slot content. Shows `fallback` when nothing is rendered into it. */
export function SlotOutlet({ name, fallback, className }: { name: SlotName; fallback?: ReactNode; className?: string }) {
  const ctx = useContext(Ctx)!
  const ref = useRef<HTMLDivElement>(null)
  const { setEl } = ctx
  useEffect(() => {
    setEl(name, ref.current)
    return () => setEl(name, null)
  }, [name, setEl])
  const filled = (ctx.counts[name] ?? 0) > 0
  return (
    <div className={className} ref={ref}>
      {!filled && fallback}
    </div>
  )
}

/** Render children into the named panel. */
export function Slot({ name, children }: { name: SlotName; children: ReactNode }) {
  const ctx = useContext(Ctx)!
  useEffect(() => {
    ctx.bump(name, 1)
    return () => ctx.bump(name, -1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])
  const el = ctx.els[name]
  if (!el) return null
  return createPortal(children, el)
}
