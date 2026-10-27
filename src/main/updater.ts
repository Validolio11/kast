import { app, BrowserWindow, ipcMain } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateState } from '../shared/types'

const { autoUpdater } = electronUpdater
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000

let state: UpdateState = app.isPackaged ? { kind: 'idle' } : { kind: 'dev' }

function set(next: UpdateState) {
  state = next
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('update:state', state)
}

function notesToText(notes: unknown): string | undefined {
  if (typeof notes === 'string') return notes.replace(/<[^>]+>/g, '').trim()
  if (Array.isArray(notes)) return notes.map((n) => notesToText(n?.note)).filter(Boolean).join('\n')
  return undefined
}

async function check() {
  if (!app.isPackaged) return set({ kind: 'dev' })
  if (state.kind === 'downloading' || state.kind === 'ready') return
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    set({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}

/** onReady — один раз, коли нова версія завантажена (сповіщення, пункт у треї) */
export function installUpdate() {
  if (state.kind === 'ready') autoUpdater.quitAndInstall(true, true)
}

export function setupUpdater(onReady?: (version: string) => void) {
  ipcMain.handle('update:state', () => state)
  ipcMain.handle('update:check', () => check())
  ipcMain.on('update:install', installUpdate)

  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => set({ kind: 'checking' }))
  autoUpdater.on('update-not-available', () => set({ kind: 'none' }))
  autoUpdater.on('update-available', (info) => set({ kind: 'downloading', percent: 0, version: info.version }))
  autoUpdater.on('download-progress', (p) =>
    set({ kind: 'downloading', percent: Math.round(p.percent), version: state.kind === 'downloading' ? state.version : undefined }),
  )
  autoUpdater.on('update-downloaded', (info) => {
    set({ kind: 'ready', version: info.version, notes: notesToText(info.releaseNotes) })
    onReady?.(info.version)
  })
  autoUpdater.on('error', (e) => set({ kind: 'error', message: e?.message ?? 'Помилка оновлення' }))

  setTimeout(check, 10_000)
  setInterval(check, CHECK_EVERY_MS)
}
