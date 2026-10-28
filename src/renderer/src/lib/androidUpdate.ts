/*
 * Оновлення Android через GitHub Releases. Кожен реліз (тег v*) містить підписаний постійним ключем
 * Kast-Android-<версія>.apk. Застосунок перевіряє останній реліз і, якщо версія новіша, пропонує
 * завантажити APK — Android сам покаже вікно встановлення поверх наявної програми (дані зберігаються).
 */
import { Browser } from '@capacitor/browser'
import { App as NativeApp } from '@capacitor/app'
import type { UpdateState } from '../../../shared/types'
import { getAppVersion, isNativeMobile } from './platform'

const LATEST = 'https://api.github.com/repos/Validolio11/kast/releases/latest'
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000
const APK = /^Kast-Android-\d+\.\d+\.\d+\.apk$/

let state: UpdateState = { kind: 'idle' }
let apkUrl: string | null = null
const listeners = new Set<() => void>()

function set(next: UpdateState) {
  state = next
  listeners.forEach((l) => l())
}
export const subscribeAndroidUpdate = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const getAndroidUpdate = () => state

const parts = (v: string) => v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
/** a новіша за b (семантичні версії 1.2.3, «v» на початку не важить) */
export function isNewer(a: string, b: string) {
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  return false
}

interface Release {
  tag_name: string
  body?: string
  assets?: { name: string; browser_download_url: string }[]
}

/** Перевірити останній реліз; ready — якщо є новіший APK */
export async function checkAndroidUpdate() {
  if (!isNativeMobile || state.kind === 'checking') return
  set({ kind: 'checking' })
  try {
    const res = await fetch(LATEST, { headers: { Accept: 'application/vnd.github+json' } })
    if (!res.ok) throw new Error(`GitHub ${res.status}`)
    const rel = (await res.json()) as Release
    const apk = rel.assets?.find((a) => APK.test(a.name))
    if (!apk || !isNewer(rel.tag_name, getAppVersion())) {
      apkUrl = null
      return set({ kind: 'none' })
    }
    apkUrl = apk.browser_download_url
    set({ kind: 'ready', version: rel.tag_name.replace(/^v/, ''), notes: rel.body?.split('\n').find((l) => l.trim()) })
  } catch (e) {
    set({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}

/** Завантажити APK у браузері; після завантаження Android запропонує встановити оновлення */
export async function installAndroidUpdate() {
  if (apkUrl) await Browser.open({ url: apkUrl })
}

let started = false
/** Перевірка через кілька секунд після запуску, кожні 6 годин і щоразу, коли застосунок повертається на екран */
export function startAndroidUpdates() {
  if (!isNativeMobile || started) return
  started = true
  setTimeout(checkAndroidUpdate, 5000)
  setInterval(checkAndroidUpdate, CHECK_EVERY_MS)
  void NativeApp.addListener('resume', () => void checkAndroidUpdate())
}
