import { useEffect, useState } from 'react'
import type { Settings, UpdateState } from '../../../shared/types'
import { dayKey, nowDate } from './time'

/** Поточний день; оновлюється після півночі без перезапуску */
export function useDayKey() {
  const [key, setKey] = useState(dayKey)
  useEffect(() => {
    const t = setInterval(() => setKey(dayKey()), 30_000)
    return () => clearInterval(t)
  }, [])
  return key
}

/** Поточна година (оновлюється щохвилини) */
export function useHour() {
  const [h, setH] = useState(() => nowDate().getHours())
  useEffect(() => {
    const t = setInterval(() => setH(nowDate().getHours()), 60_000)
    return () => clearInterval(t)
  }, [])
  return h
}

const fallbackSettings: Settings = { hotkey: 'Control+Shift+Space', eveningHour: 18, notifyEvening: true, launchAtLogin: false }

export function useSettings() {
  const [s, setS] = useState<Settings>(fallbackSettings)
  useEffect(() => {
    window.kast?.settings.get().then(setS)
  }, [])
  const set = async (patch: Partial<Settings>) => {
    if (!window.kast) return setS((cur) => ({ ...cur, ...patch }))
    setS(await window.kast.settings.set(patch))
  }
  return [s, set] as const
}

export function useUpdateState() {
  const [s, setS] = useState<UpdateState>({ kind: 'idle' })
  useEffect(() => {
    if (!window.kast) return
    window.kast.updates.state().then(setS)
    return window.kast.updates.onState(setS)
  }, [])
  return s
}

export const prettyHotkey = (acc: string) => acc.replace('CommandOrControl', 'Ctrl').replace('Control', 'Ctrl').replaceAll('+', ' + ')
