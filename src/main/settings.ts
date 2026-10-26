import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Settings } from '../shared/types'

interface Stored extends Settings {
  bounds?: { x: number; y: number; width: number; height: number; maximized: boolean }
  trayHintShown?: boolean
}

const defaults: Stored = {
  hotkey: 'Control+Shift+Space',
  eveningHour: 18,
  notifyEvening: true,
  launchAtLogin: false,
}

const file = () => join(app.getPath('userData'), 'settings.json')
let cache: Stored | null = null

export function load(): Stored {
  if (cache) return cache
  try {
    cache = { ...defaults, ...JSON.parse(readFileSync(file(), 'utf8')) }
  } catch {
    cache = { ...defaults }
  }
  return cache!
}

export function save(patch: Partial<Stored>): Stored {
  cache = { ...load(), ...patch }
  try {
    writeFileSync(file(), JSON.stringify(cache, null, 2))
  } catch (e) {
    console.error('settings save failed', e)
  }
  return cache
}

export function publicSettings(): Settings {
  const { hotkey, eveningHour, notifyEvening, launchAtLogin } = load()
  return { hotkey, eveningHour, notifyEvening, launchAtLogin }
}
