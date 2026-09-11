import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Slot } from './Slots'
import { useHotkeyHelp } from '../lib/hotkeys'

export function mmss(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

/** Elapsed seconds while `running`; resets when `resetKey` changes. */
export function useStopwatch(running: boolean, resetKey: string | number): number {
  const [sec, setSec] = useState(0)
  const start = useRef(Date.now())
  const acc = useRef(0)
  useEffect(() => {
    acc.current = 0
    start.current = Date.now()
    setSec(0)
  }, [resetKey])
  useEffect(() => {
    if (!running) {
      acc.current += (Date.now() - start.current) / 1000
      return
    }
    start.current = Date.now()
    const id = setInterval(() => setSec(acc.current + (Date.now() - start.current) / 1000), 500)
    return () => clearInterval(id)
  }, [running, resetKey])
  return sec
}

/**
 * Standard layout for the bottom-left panel. Sprints pass a `clock`; ordinary
 * jobs pass a `reference` (a quick-reference card) instead, so the timer is
 * only ever shown while the clock actually matters.
 */
export function ControlBar({
  clock,
  clockLabel,
  clockClass,
  reference,
  stats,
  title,
  children,
}: {
  clock?: string
  clockLabel?: string
  clockClass?: string
  reference?: ReactNode
  stats?: { label: string; value: ReactNode }[]
  /** Text for the panel's title strip (defaults to "Timer & controls" with a clock, "Reference & controls" otherwise). */
  title?: string
  children?: ReactNode
}) {
  const toggleHelp = useHotkeyHelp()
  return (
    <div className={`ctl ${clock ? 'with-clock' : 'with-ref'}`}>
      <Slot name="controlsTitle">{title ?? (clock ? 'Timer & controls' : 'Quick reference & controls')}</Slot>
      {clock && (
        <div className="ctl-clock">
          <div className={`timer ${clockClass ?? ''}`}>{clock}</div>
          {clockLabel && <div className="ctl-clock-label">{clockLabel}</div>}
        </div>
      )}
      {!clock && reference && <div className="ctl-ref">{reference}</div>}
      <div className="ctl-right">
        {stats && stats.length > 0 && (
          <div className="ctl-stats">
            {stats.map((s) => (
              <div key={s.label} className="stat">
                <div className="v">{s.value}</div>
                <div className="l">{s.label}</div>
              </div>
            ))}
          </div>
        )}
        <div className="ctl-buttons">
          {children}
          <button className="ghost" title="Keyboard shortcuts (?)" onClick={toggleHelp} style={{ padding: '6px 8px' }}>
            ⌨
          </button>
        </div>
      </div>
    </div>
  )
}
