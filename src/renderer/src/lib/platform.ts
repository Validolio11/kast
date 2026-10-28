import { Capacitor } from '@capacitor/core'
import { App as NativeApp } from '@capacitor/app'
import { Preferences } from '@capacitor/preferences'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import type { Settings } from '../../../shared/types'

export const isNativeMobile = Capacitor.isNativePlatform()
export const isDesktop = !isNativeMobile && !!window.kast

/** Native storage keeps the PKCE verifier and session across Android process recreation. */
export const mobileAuthStorage = {
  getItem: async (key: string) => (await Preferences.get({ key: `kast.auth.${key}` })).value,
  setItem: async (key: string, value: string) => { await Preferences.set({ key: `kast.auth.${key}`, value }) },
  removeItem: async (key: string) => { await Preferences.remove({ key: `kast.auth.${key}` }) },
}

const SETTINGS_KEY = 'kast.settings.v1'
const defaults: Settings = { hotkey: 'Control+Shift+Space', eveningHour: 18, notifyEvening: isDesktop, launchAtLogin: false }
let settings: Settings = { ...defaults }
let version = window.kast?.info.version ?? 'dev'
let settingsReady: Promise<void> | undefined
let settingsWrites = Promise.resolve()
const settingsListeners = new Set<() => void>()

function validSettings(value: unknown): Settings {
  const data = value && typeof value === 'object' ? value as Partial<Settings> : {}
  return {
    hotkey: typeof data.hotkey === 'string' ? data.hotkey : defaults.hotkey,
    eveningHour: Number.isInteger(data.eveningHour) && data.eveningHour! >= 14 && data.eveningHour! <= 23 ? data.eveningHour! : defaults.eveningHour,
    notifyEvening: isDesktop && typeof data.notifyEvening === 'boolean' ? data.notifyEvening : defaults.notifyEvening,
    launchAtLogin: isDesktop && data.launchAtLogin === true,
  }
}

function publishSettings(next: Settings) {
  settings = next
  settingsListeners.forEach((listener) => listener())
}

export const getPlatformSettingsSnapshot = () => settings
export const subscribePlatformSettings = (listener: () => void) => {
  settingsListeners.add(listener)
  return () => { settingsListeners.delete(listener) }
}

export function loadPlatformSettings() {
  return settingsReady ??= (async () => {
    if (isDesktop) publishSettings(validSettings(await window.kast.settings.get()))
    else {
      const { value } = await Preferences.get({ key: SETTINGS_KEY })
      if (value) {
        try { publishSettings(validSettings(JSON.parse(value))) }
        catch { /* Keep usable defaults if a preferences value is malformed. */ }
      }
    }
  })().catch((error) => { settingsReady = undefined; throw error })
}

export function setPlatformSettings(patch: Partial<Settings>): Promise<void> {
  const update = settingsWrites.then(async () => {
    await loadPlatformSettings()
    const next = isDesktop
      ? validSettings(await window.kast.settings.set(patch))
      : validSettings({ ...settings, ...patch })
    if (!isDesktop) await Preferences.set({ key: SETTINGS_KEY, value: JSON.stringify(next) })
    publishSettings(next)
  })
  settingsWrites = update.catch(() => {})
  return update
}

export const getAppVersion = () => version

let mobileReady: Promise<void> | undefined
/** Call before mounting React; desktop is a no-op. */
export function initMobilePlatform(): Promise<void> {
  if (!isNativeMobile) return Promise.resolve()
  return mobileReady ??= (async () => {
    await loadPlatformSettings().catch((error) => console.warn('settings unavailable', error))
    const info = await NativeApp.getInfo()
    version = info.version
    await NativeApp.addListener('backButton', () => {
      const back = new CustomEvent('kast:back', { cancelable: true })
      document.dispatchEvent(back)
      if (!back.defaultPrevented) void NativeApp.minimizeApp().catch(() => {})
    })
    const { initMobileAuth } = await import('./mobileAuth')
    await initMobileAuth()
  })()
}

/** Desktop saves through Electron; Android shares a UTF-8 file from its allowed cache directory. */
export async function saveBackupFile(json: string, name: string): Promise<string | null> {
  if (isDesktop) return window.kast.backup.save(json, name)
  if (isNativeMobile) {
    const { uri } = await Filesystem.writeFile({ path: `backups/${name}`, data: json, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true })
    try {
      await Share.share({ title: 'Резервна копія Kast', dialogTitle: 'Зберегти резервну копію', files: [uri] })
    } catch (error) {
      if (/cancel(?:led|ed)?/i.test((error as Error).message)) return null
      throw error
    }
    return name
  }
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return name
}

/** The Android WebView opens the system document picker for this input. */
export function openBackupFile(): Promise<string | null> {
  if (isDesktop) return window.kast.backup.open()
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.hidden = true
    const finish = (value: string | null) => { input.remove(); resolve(value) }
    input.addEventListener('cancel', () => finish(null), { once: true })
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) return finish(null)
      file.text().then(finish, (error: unknown) => { input.remove(); reject(error) })
    }, { once: true })
    document.body.append(input)
    input.click()
  })
}
