import { useEffect, useState, useSyncExternalStore } from 'react'
import type { UpdateState } from '../../../shared/types'
import { dayKey, nowDate } from './time'
import { getPlatformSettingsSnapshot, isDesktop, isNativeMobile, loadPlatformSettings, setPlatformSettings, subscribePlatformSettings } from './platform'
import { checkAndroidUpdate, getAndroidUpdate, installAndroidUpdate, subscribeAndroidUpdate } from './androidUpdate'

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

export function useSettings() {
  const s = useSyncExternalStore(subscribePlatformSettings, getPlatformSettingsSnapshot)
  useEffect(() => {
    void loadPlatformSettings().catch((error) => console.warn('settings unavailable', error))
  }, [])
  return [s, setPlatformSettings] as const
}

/** Стан оновлення: на Windows — від electron-updater, на Android — перевірка GitHub Releases */
export function useUpdateState() {
  const [s, setS] = useState<UpdateState>({ kind: 'idle' })
  const android = useSyncExternalStore(subscribeAndroidUpdate, getAndroidUpdate)
  useEffect(() => {
    if (!isDesktop) return
    window.kast.updates.state().then(setS)
    return window.kast.updates.onState(setS)
  }, [])
  return isNativeMobile ? android : s
}

/** Встановити готове оновлення: Windows перезапускається, Android завантажує APK */
export const installUpdate = () => (isNativeMobile ? void installAndroidUpdate() : window.kast?.updates.install())
export const checkForUpdates = () => (isNativeMobile ? void checkAndroidUpdate() : void window.kast?.updates.check())

export const prettyHotkey = (acc: string) => acc.replace('CommandOrControl', 'Ctrl').replace('Control', 'Ctrl').replaceAll('+', ' + ')
