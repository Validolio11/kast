import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, net, Notification, protocol, screen, shell, Tray } from 'electron'
import { join, normalize } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AppInfo, NavTarget, Settings } from '../shared/types'
import * as settings from './settings'
import { setupUpdater } from './updater'

const DEV_URL = process.env.ELECTRON_RENDERER_URL
const RENDERER_DIR = join(__dirname, '../renderer')
// Іконка розпакована з asar (asarUnpack), бо сповіщенням Windows потрібен справжній файл
const ICON = join(__dirname, '../../resources/icon.png').replace('app.asar', 'app.asar.unpacked')
const startHidden = process.argv.includes('--hidden')

// Власний протокол дає сторінкам стабільний origin: IndexedDB і BroadcastChannel
// спільні для головного вікна та вікна швидкого запису.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
])

let main: BrowserWindow | null = null
let capture: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

if (!app.requestSingleInstanceLock()) app.quit()
app.setAppUserModelId('com.kast.app')

function pageUrl(page: 'index' | 'capture') {
  return DEV_URL ? `${DEV_URL}/${page}.html` : `app://kast/${page}.html`
}

function webPreferences() {
  return {
    preload: join(__dirname, '../preload/index.js'),
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
  }
}

function createMain() {
  const b = settings.load().bounds
  main = new BrowserWindow({
    width: b?.width ?? 1100,
    height: b?.height ?? 720,
    x: b?.x,
    y: b?.y,
    minWidth: 760,
    minHeight: 520,
    show: false,
    title: 'Kast',
    icon: ICON,
    backgroundColor: '#090a0a',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#090a0a', symbolColor: '#a1a1a6', height: 40 },
    webPreferences: webPreferences(),
  })
  if (b?.maximized) main.maximize()
  main.loadURL(pageUrl('index'))
  main.once('ready-to-show', () => {
    if (!startHidden) main?.show()
  })

  const saveBounds = () => {
    if (!main || main.isMinimized()) return
    settings.save({ bounds: { ...main.getNormalBounds(), maximized: main.isMaximized() } })
  }
  main.on('resize', saveBounds)
  main.on('move', saveBounds)

  // Закриття ховає вікно в трей, щоб гаряча клавіша запису працювала далі
  main.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    main?.hide()
    if (!settings.load().trayHintShown) {
      settings.save({ trayHintShown: true })
      notify('Kast працює у треї', `${prettyHotkey(settings.load().hotkey)} — швидкий запис з будь-якої програми.`)
    }
  })

  main.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
}

function showMain(target?: NavTarget) {
  if (!main) createMain()
  if (main!.isMinimized()) main!.restore()
  main!.show()
  main!.focus()
  if (target) main!.webContents.send('navigate', target)
}

function createCapture() {
  capture = new BrowserWindow({
    width: 640,
    height: 120,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    backgroundColor: '#00000000',
    webPreferences: webPreferences(),
  })
  capture.loadURL(pageUrl('capture'))
  capture.on('blur', () => capture?.hide())
  capture.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    capture?.hide()
  })
}

function toggleCapture() {
  if (!capture) createCapture()
  if (capture!.isVisible()) return capture!.hide()
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { x, y, width, height } = display.workArea
  const [w] = capture!.getSize()
  capture!.setPosition(Math.round(x + (width - w) / 2), Math.round(y + height * 0.22))
  capture!.show()
  capture!.focus()
  capture!.webContents.send('capture:open')
}

function prettyHotkey(acc: string) {
  return acc.replace('Control', 'Ctrl').replace('CommandOrControl', 'Ctrl')
}

function registerHotkey(acc: string): boolean {
  globalShortcut.unregisterAll()
  try {
    return globalShortcut.register(acc, toggleCapture)
  } catch {
    return false
  }
}

function notify(title: string, body: string, target?: NavTarget) {
  if (!Notification.isSupported()) return
  const n = new Notification({ title, body, icon: ICON, silent: false })
  n.on('click', () => showMain(target))
  n.show()
}

function createTray() {
  const img = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 })
  tray = new Tray(img)
  tray.setToolTip('Kast')
  tray.on('click', () => showMain())
  setTrayMenu()
}

function setTrayMenu() {
  tray?.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Відкрити Kast', click: () => showMain() },
      { label: `Швидкий запис    ${prettyHotkey(settings.load().hotkey)}`, click: toggleCapture },
      { type: 'separator' },
      {
        label: 'Вийти',
        click: () => {
          quitting = true
          app.quit()
        },
      },
    ]),
  )
}

function applyLoginItem(enabled: boolean) {
  if (!app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] })
}

function setupIpc() {
  const offset = Number(process.env.KAST_NOW ? Date.parse(process.env.KAST_NOW) - Date.now() : 0)
  const info: AppInfo = { version: app.getVersion(), nowOffset: Number.isFinite(offset) ? offset : 0 }
  ipcMain.on('app:info', (e) => {
    e.returnValue = info
  })
  ipcMain.handle('settings:get', () => settings.publicSettings())
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
    const prev = settings.load()
    if (patch.hotkey && patch.hotkey !== prev.hotkey && !registerHotkey(patch.hotkey)) {
      registerHotkey(prev.hotkey)
      throw new Error('Ця комбінація вже зайнята іншою програмою')
    }
    if (patch.launchAtLogin !== undefined) applyLoginItem(patch.launchAtLogin)
    settings.save(patch)
    if (patch.hotkey) setTrayMenu()
    return settings.publicSettings()
  })
  ipcMain.on('notify', (_e, title: string, body: string, target?: NavTarget) => notify(title, body, target))
  ipcMain.on('capture:hide', () => capture?.hide())
}

app.on('second-instance', () => showMain())
app.on('before-quit', () => {
  quitting = true
})
app.on('will-quit', () => globalShortcut.unregisterAll())
app.on('window-all-closed', () => {
  // Kast лишається у треї
})

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url)
    const file = normalize(join(RENDERER_DIR, decodeURIComponent(pathname)))
    if (!file.startsWith(RENDERER_DIR)) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })
  Menu.setApplicationMenu(null)
  setupIpc()
  setupUpdater()
  createMain()
  createCapture()
  createTray()
  if (!registerHotkey(settings.load().hotkey)) console.warn('hotkey registration failed')
})
