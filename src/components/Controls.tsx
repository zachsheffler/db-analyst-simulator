import { useEffect, useRef, useState, type ReactNode } from 'react'

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

/** Standard layout for the bottom-left game-controls panel. */
export function ControlBar({
  clock,
  clockLabel,
  clockClass,
  stats,
  children,
}: {
  clock: string
  clockLabel?: string
  clockClass?: string
  stats?: { label: string; value: ReactNode }[]
  children?: ReactNode
}) {
  return (
    <div className="ctl">
      <div className="ctl-clock">
        <div className={`timer ${clockClass ?? ''}`}>{clock}</div>
        {clockLabel && <div className="ctl-clock-label">{clockLabel}</div>}
      </div>
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
      <div className="ctl-buttons">{children}</div>
    </div>
  )
}
