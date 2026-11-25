/*
 * Таймбокс задачі — спільний стан для Фокусу.
 * Живе поза компонентами: пішли з екрана — відлік триває; «Час вийшов» сповіщає з будь-якої вкладки.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'

export const PRESETS = [15, 25, 45]

export interface TimerState {
  minutes: number
  /** Коли закінчиться (якщо йде) */
  endAt: number | null
  /** Скільки лишилося секунд (якщо на паузі) */
  left: number
  /** Час вийшов, а ви ще не відповіли «Зроблено» чи «Ще 5 хв» */
  finished?: boolean
  title?: string
  alarm?: ReturnType<typeof setTimeout>
}

const timers = new Map<string, TimerState>()
const listeners = new Set<() => void>()
let version = 0
const emit = () => {
  version++
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function timerOf(id: string): TimerState {
  return timers.get(id) ?? { minutes: 25, endAt: null, left: 25 * 60 }
}
export const secondsLeft = (t: TimerState) => (t.endAt ? Math.max(0, Math.round((t.endAt - Date.now()) / 1000)) : t.left)

function save(id: string, next: TimerState) {
  const prev = timerOf(id)
  clearTimeout(prev.alarm)
  if (next.endAt) {
    next.alarm = setTimeout(() => {
      timers.set(id, { minutes: next.minutes, endAt: null, left: 0, finished: true, title: next.title })
      window.kast?.notify('Час вийшов', `${next.title ?? 'Задача'} — зробіть паузу або позначте як готово.`)
      emit()
    }, next.endAt - Date.now())
  }
  timers.set(id, next)
  emit()
}

export function startTimer(id: string, title: string) {
  const s = timerOf(id)
  const left = s.finished ? s.minutes * 60 : secondsLeft(s) || s.minutes * 60
  save(id, { minutes: s.minutes, endAt: Date.now() + left * 1000, left: 0, title })
}
export const pauseTimer = (id: string) => {
  const s = timerOf(id)
  save(id, { minutes: s.minutes, endAt: null, left: secondsLeft(s), title: s.title })
}
export const resetTimer = (id: string, minutes?: number) => {
  const m = minutes ?? timerOf(id).minutes
  save(id, { minutes: m, endAt: null, left: m * 60, title: timerOf(id).title })
}

const anyRunning = () => [...timers.values()].some((t) => t.endAt)

/** Перемальовка, поки таймер іде (раз на 250 мс) і на будь-яку зміну таймерів */
export function useTimers() {
  useSyncExternalStore(subscribe, () => version)
  const [, tick] = useState(0)
  const running = anyRunning()
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(t)
  }, [running])
}
