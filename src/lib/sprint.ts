/**
 * Shared sprint bookkeeping (timer, streak, scoring) used by the SQL, Viz and
 * Diagramming sprints so they all feel the same.
 */
import { useEffect, useRef, useState } from 'react'

export interface SprintSettings {
  durationSec: number // 0 = untimed practice
  minDiff: number
  maxDiff: number
}

export interface SprintEntry<Q> {
  q: Q
  correct: boolean
  earned: number
  attempts: number
}

export function attemptFactor(n: number): number {
  return n === 1 ? 1 : n === 2 ? 0.6 : 0.3
}
export function streakMultiplier(streak: number): number {
  return Math.min(2, 1 + 0.1 * streak)
}
export function speedBonus(timed: boolean, secs: number): number {
  return timed ? (secs < 60 ? 1.5 : secs < 120 ? 1.25 : 1) : 1
}

export function useSprintClock(durationSec: number, running: boolean): { timeLeft: number; elapsed: number; expired: boolean } {
  const [timeLeft, setTimeLeft] = useState(durationSec)
  const [elapsed, setElapsed] = useState(0)
  const [expired, setExpired] = useState(false)
  useEffect(() => {
    if (!running || expired) return
    const id = setInterval(() => {
      setElapsed((e) => e + 1)
      if (durationSec) {
        setTimeLeft((t) => {
          if (t <= 1) {
            clearInterval(id)
            setExpired(true)
            return 0
          }
          return t - 1
        })
      }
    }, 1000)
    return () => clearInterval(id)
  }, [durationSec, running, expired])
  return { timeLeft, elapsed, expired }
}

/** Score, streak and history for one sprint. */
export function useSprintScore<Q>() {
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [history, setHistory] = useState<SprintEntry<Q>[]>([])
  const qStart = useRef(Date.now())
  const startQuestion = () => {
    qStart.current = Date.now()
  }
  /** Record a correct answer; returns the points earned and the multipliers used. */
  const award = (q: Q, basePoints: number, attempts: number, timed: boolean) => {
    const secs = (Date.now() - qStart.current) / 1000
    const sm = streakMultiplier(streak)
    const sp = speedBonus(timed, secs)
    const earned = Math.round(basePoints * attemptFactor(attempts) * sm * sp)
    setScore((s) => s + earned)
    const ns = streak + 1
    setStreak(ns)
    setBestStreak((b) => Math.max(b, ns))
    setHistory((h) => [...h, { q, correct: true, earned, attempts }])
    return { earned, streakMult: sm, speed: sp }
  }
  const miss = (q: Q, attempts: number) => {
    setStreak(0)
    setHistory((h) => [...h, { q, correct: false, earned: 0, attempts }])
  }
  const breakStreak = () => setStreak(0)
  return { score, streak, bestStreak, history, startQuestion, award, miss, breakStreak }
}

export const DURATIONS: [number, string][] = [
  [180, '3 minutes'],
  [300, '5 minutes'],
  [600, '10 minutes'],
  [900, '15 minutes'],
  [0, 'Practice (no timer, no speed bonus)'],
]
