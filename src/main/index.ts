import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, net, Notification, protocol, screen, session, shell, Tray } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join, normalize } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AppInfo, NavTarget, Settings } from '../shared/types'
import * as settings from './settings'
import { installUpdate, setupUpdater } from './updater'
import { cancelOAuth, openOAuth, prepareOAuth } from './auth'

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
/** Версія, що вже завантажена й чекає перезапуску */
let updateReady: string | null = null

// Налагодження: KAST_CDP=9333 відкриває порт DevTools (знімки вікна, автотести)
if (process.env.KAST_CDP) app.commandLine.appendSwitch('remote-debugging-port', process.env.KAST_CDP)
if (!app.requestSingleInstanceLock()) app.quit()
// Деякі сайти й плеєри відсіюють «Electron» в User-Agent як «непідтримуваний браузер» — показуємося звичайним Chrome
app.userAgentFallback = app.userAgentFallback.replace(/\s(Electron|kast)\/\S+/gi, '')
// У розробці запускається electron.exe: окремий ID, щоб Windows не закешувала його значок для встановленого Kast
app.setAppUserModelId(app.isPackaged ? 'com.kast.app' : 'com.kast.app.dev')

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
    // Рамку малює шапка Pulse: кнопки вікна в капсулі, як у Karkas
    frame: false,
    webPreferences: webPreferences(),
  })
  if (b?.maximized) main.maximize()
  main.loadURL(pageUrl('index'))
  main.once('ready-to-show', () => {
    if (!startHidden) main?.show()
  })

  // Розмір і місце пишемо один раз, коли перетягування стихло, а не на кожен піксель руху
  let boundsTimer: ReturnType<typeof setTimeout> | undefined
  const saveBounds = () => {
    clearTimeout(boundsTimer)
    boundsTimer = setTimeout(() => {
      if (!main || main.isDestroyed() || main.isMinimized()) return
      settings.save({ bounds: { ...main.getNormalBounds(), maximized: main.isMaximized() } })
    }, 400)
  }
  main.on('resize', saveBounds)
  main.on('move', saveBounds)
  main.on('maximize', () => main?.webContents.send('window:maximized', true))
  main.on('unmaximize', () => main?.webContents.send('window:maximized', false))

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
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  // Файл, кинутий повз зону фото, не має відкритися у вікні замість Kast
  main.webContents.on('will-navigate', (e, url) => {
    if (url !== main?.webContents.getURL()) e.preventDefault()
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
  // Windows не віддає фокус вікну з фону: рівень «поверх усього», moveTop і фокус самого вмісту
  capture!.setAlwaysOnTop(true, 'screen-saver')
  capture!.show()
  capture!.moveTop()
  capture!.focus()
  capture!.webContents.focus()
  capture!.webContents.send('capture:open')
}

function prettyHotkey(acc: string) {
  return acc.replace('Control', 'Ctrl').replace('CommandOrControl', 'Ctrl')
}

/**
 * Twitch не дає вбудовувати плеєр у сторінки app://, тож він відкривається окремим вікном,
 * де плеєр — сама сторінка (так Twitch дозволяє). Лише адреси плеєрів Twitch.
 */
function openVideoWindow(url: string) {
  let host = ''
  try {
    const u = new URL(url)
    if (u.protocol === 'https:') host = u.hostname
  } catch {
    return
  }
  if (host !== 'player.twitch.tv' && host !== 'clips.twitch.tv') return
  const win = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 480,
    minHeight: 300,
    title: 'Kast · відео',
    icon: ICON,
    backgroundColor: '#090a0a',
    autoHideMenuBar: true,
    webPreferences: { sandbox: true, contextIsolation: true },
  })
  win.webContents.setWindowOpenHandler(({ url: next }) => {
    if (/^https?:\/\//i.test(next)) shell.openExternal(next)
    return { action: 'deny' }
  })
  win.loadURL(url)
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
      ...(updateReady
        ? ([{ type: 'separator' }, { label: `Перезапустити й оновити до ${updateReady}`, click: installUpdate }] as const)
        : []),
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
  ipcMain.on('video:window', (_e, url: string) => openVideoWindow(url))
  ipcMain.handle('auth:prepare', () => prepareOAuth())
  ipcMain.handle('auth:open', (_e, url: string) => openOAuth(url, () => showMain()))
  ipcMain.on('auth:cancel', () => cancelOAuth())

  // Резервна копія: файл обирає людина через стандартні вікна Windows
  ipcMain.handle('backup:save', async (_e, json: string, name: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog(main!, {
      title: 'Зберегти резервну копію Kast',
      defaultPath: join(app.getPath('documents'), name),
      filters: [{ name: 'Резервна копія Kast', extensions: ['json'] }],
    })
    if (canceled || !filePath) return null
    await writeFile(filePath, json, 'utf8')
    return filePath
  })
  ipcMain.handle('backup:open', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(main!, {
      title: 'Відновити з резервної копії',
      properties: ['openFile'],
      filters: [{ name: 'Резервна копія Kast', extensions: ['json'] }],
    })
    if (canceled || !filePaths[0]) return null
    return readFile(filePaths[0], 'utf8')
  })
  ipcMain.on('window:minimize', () => main?.minimize())
  ipcMain.on('window:toggleMaximize', () => (main?.isMaximized() ? main.unmaximize() : main?.maximize()))
  ipcMain.on('window:close', () => main?.close())
  ipcMain.handle('window:isMaximized', () => !!main?.isMaximized())
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
  // Вбудований плеєр YouTube відмовляє без Referer (помилка 153), а сторінки app:// його не надсилають
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://www.youtube-nocookie.com/*'] }, (details, done) => {
    if (!details.requestHeaders.Referer) details.requestHeaders.Referer = 'https://kast.app/'
    done({ requestHeaders: details.requestHeaders })
  })
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url)
    const file = normalize(join(RENDERER_DIR, decodeURIComponent(pathname)))
    if (!file.startsWith(RENDERER_DIR)) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })
  Menu.setApplicationMenu(null)
  setupIpc()
  setupUpdater((version) => {
    updateReady = version
    setTrayMenu()
    notify('Оновлення Kast готове', `Версія ${version}. Перезапустіть Kast, щоб оновитись, або воно встановиться, коли закриєте програму.`, 'update')
  })
  createMain()
  createCapture()
  createTray()
  if (!registerHotkey(settings.load().hotkey)) console.warn('hotkey registration failed')
})
