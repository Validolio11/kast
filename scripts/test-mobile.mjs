// Run: node --experimental-vm-modules --test scripts/test-mobile.mjs
// Native plugins and Supabase are mocked. No .env, real credentials, network or device APIs are used.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { webcrypto } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'

const ROOT = new URL('../', import.meta.url)
const CALLBACK = 'com.kast.app://auth/callback'
const ATTEMPT = 'kast.oauth.attempt.v1'
const SETTINGS = 'kast.settings.v1'
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(setImmediate) }
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function clock() {
  let now = 1_800_000_000_000
  let next = 0
  const timers = new Map()
  return {
    Date: class extends Date { static now() { return now } },
    now: () => now,
    setTimeout(callback, delay = 0) { const id = ++next; timers.set(id, { at: now + delay, callback }); return id },
    clearTimeout(id) { timers.delete(id) },
    async advance(ms) {
      const end = now + ms
      for (;;) {
        const due = [...timers.entries()].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        now = due[1].at
        timers.delete(due[0])
        due[1].callback()
        await flush()
      }
      now = end
      await flush()
    },
  }
}

async function loadModule(relativePath, mocks, globals = {}) {
  const context = vm.createContext({ URL, Event, EventTarget, CustomEvent, Error, Blob, crypto: webcrypto, console, setTimeout, clearTimeout,
    document: new EventTarget(), window: new EventTarget(), ...globals })
  const mockModules = new Map()
  const resolve = async (specifier) => {
    if (!(specifier in mocks)) throw new Error(`Unmocked dependency: ${specifier}`)
    if (!mockModules.has(specifier)) {
      const values = mocks[specifier]
      const mock = new vm.SyntheticModule(Object.keys(values), function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value)
      }, { context, identifier: `mock:${specifier}` })
      mockModules.set(specifier, mock)
      await mock.link(() => { throw new Error('Mocks must not import modules') })
      await mock.evaluate()
    }
    return mockModules.get(specifier)
  }
  const file = fileURLToPath(new URL(relativePath, ROOT))
  const source = ts.transpileModule(await readFile(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }, fileName: file,
  }).outputText
  const module = new vm.SourceTextModule(source, { context, identifier: file, importModuleDynamically: resolve })
  await module.link(resolve)
  await module.evaluate()
  return { api: module.namespace, context }
}

function preferences(store = new Map(), hooks = {}) {
  return {
    async get({ key }) { await hooks.get?.(key); return { value: store.get(key) ?? null } },
    async set({ key, value }) { await hooks.set?.(key, value); store.set(key, value) },
    async remove({ key }) { await hooks.remove?.(key); store.delete(key) },
  }
}

async function authHarness({ saved, launchUrl, prefsHooks = {}, oauth, exchange, open, close } = {}) {
  const time = clock()
  const store = new Map(saved ? [[ATTEMPT, JSON.stringify({ id: 'cold-attempt', startedAt: time.now() - 100, flowId: 'flow-1', ...saved })]] : [])
  const appEvents = new Map(), browserEvents = new Map(), calls = []
  const app = {
    async addListener(name, callback) { appEvents.set(name, callback) },
    async getState() { return { isActive: true } },
    async getLaunchUrl() { return launchUrl ? { url: launchUrl } : undefined },
  }
  const browser = {
    async addListener(name, callback) { browserEvents.set(name, callback) },
    async open(options) { calls.push(['open', options]); await open?.(options) },
    async close() { calls.push(['close']); await close?.() },
  }
  const auth = {
    async signInWithOAuth(options) {
      calls.push(['oauth', options])
      return oauth ? oauth(options) : { data: { url: 'https://test.invalid/auth/v1/authorize?provider=google', flowId: 'flow-1' }, error: null }
    },
    async exchangeCodeForSession(code, options) { calls.push(['exchange', code, options]); return exchange ? exchange(code, options) : { error: null } },
    startAutoRefresh() { calls.push(['refresh-start']) },
    stopAutoRefresh() { calls.push(['refresh-stop']) },
  }
  const loaded = await loadModule('src/renderer/src/lib/mobileAuth.ts', {
    '@capacitor/app': { App: app }, '@capacitor/browser': { Browser: browser },
    '@capacitor/preferences': { Preferences: preferences(store, prefsHooks) },
    '@/sync/client': { supabase: { auth } }, './platform': { isNativeMobile: true },
  }, { Date: time.Date, setTimeout: time.setTimeout, clearTimeout: time.clearTimeout })
  const h = { ...loaded, store, calls, time, appEvents, browserEvents,
    async emit(url) { appEvents.get('appUrlOpen')?.({ url }); await flush() },
    async begin() { const promise = loaded.api.signInWithGoogleMobile(); await flush(); return { promise } },
  }
  await h.api.initMobileAuth()
  return h
}

test('callback validation rejects similar locations, credentials and token fragments', async () => {
  const h = await authHarness()
  for (const value of ['not a URL', 'https://auth/callback?code=x', 'com.kast.app.evil://auth/callback',
    'com.kast.app://auth.evil/callback', 'com.kast.app://auth/callback/extra', 'com.kast.app://auth/callback/',
    'com.kast.app://auth:99/callback', 'com.kast.app://user@auth/callback', 'com.kast.app://auth/callback#access_token=forged']) {
    assert.equal(h.api.parseMobileAuthCallback(value), null, value)
  }
  assert.equal(h.api.parseMobileAuthCallback(`${CALLBACK}?code=ok`).pathname, '/callback')
})

test('OAuth uses external HTTPS browser, PKCE flow and one matching callback', async () => {
  const h = await authHarness()
  const { promise } = await h.begin()
  const options = h.calls.find(([name]) => name === 'oauth')[1]
  assert.equal(options.options.redirectTo, CALLBACK)
  assert.equal(options.options.skipBrowserRedirect, true)
  assert.match(h.calls.find(([name]) => name === 'open')[1].url, /^https:/)
  await h.emit('com.kast.app://wrong/callback?code=ignored')
  assert.equal(h.calls.filter(([name]) => name === 'exchange').length, 0)
  await h.emit(`${CALLBACK}?code=valid&sb_flow_id=flow-1`)
  await promise
  assert.equal(h.calls.find(([name]) => name === 'exchange')[1], 'valid')
  assert.equal(h.calls.find(([name]) => name === 'exchange')[2].flowId, 'flow-1')
  assert.equal(h.store.has(ATTEMPT), false)
  await h.emit(`${CALLBACK}?code=valid&sb_flow_id=flow-1`)
  assert.equal(h.calls.filter(([name]) => name === 'exchange').length, 1)
})

test('forged flow IDs and duplicate or missing codes never reach exchange', async () => {
  for (const query of ['code=x&sb_flow_id=other-flow', 'code=x&sb_flow_id=flow-1&sb_flow_id=flow-1', 'code=a&code=b', '', 'code=']) {
    const h = await authHarness()
    const { promise } = await h.begin()
    const rejected = assert.rejects(promise)
    await h.emit(`${CALLBACK}?${query}`)
    await rejected
    assert.equal(h.calls.filter(([name]) => name === 'exchange').length, 0, query)
    assert.equal(h.store.has(ATTEMPT), false)
  }
})

test('callbacks require a locally initiated attempt', async () => {
  const h = await authHarness()
  await h.emit(`${CALLBACK}?code=unsolicited`)
  assert.equal(h.calls.filter(([name]) => name === 'exchange').length, 0)
})

test('cold resume exchanges the persisted flow once; expired/future attempts are rejected', async () => {
  const valid = await authHarness({ saved: {}, launchUrl: `${CALLBACK}?code=cold-code` })
  assert.equal(valid.calls.find(([name]) => name === 'exchange')[1], 'cold-code')
  assert.equal(valid.store.has(ATTEMPT), false)
  for (const startedAt of [1_800_000_000_000 - 360_000, 1_800_000_000_000 + 100]) {
    const h = await authHarness({ saved: { startedAt }, launchUrl: `${CALLBACK}?code=expired` })
    assert.equal(h.calls.filter(([name]) => name === 'exchange').length, 0)
    assert.match(h.api.takeMobileAuthError(), /Час/)
    assert.equal(h.api.takeMobileAuthError(), null)
    assert.equal(h.store.has(ATTEMPT), false)
  }
})

test('cancel and timeout reject and remove the persisted attempt', async () => {
  for (const timeout of [false, true]) {
    const h = await authHarness()
    const { promise } = await h.begin()
    const rejected = assert.rejects(promise, timeout ? /Час/ : /cancelled/)
    if (timeout) await h.time.advance(300_001)
    else h.api.cancelGoogleMobile()
    await rejected
    assert.equal(h.store.has(ATTEMPT), false)
  }
})

test('old browserFinished event cannot cancel a newer login', async () => {
  const h = await authHarness()
  const first = await h.begin()
  h.browserEvents.get('browserFinished')()
  const cancelled = assert.rejects(first.promise, /cancelled/)
  h.api.cancelGoogleMobile()
  await cancelled
  const second = await h.begin()
  await h.time.advance(301)
  assert.ok(h.store.has(ATTEMPT))
  await h.emit(`${CALLBACK}?code=new-login`)
  await second.promise
})

test('cancel during a delayed Preferences write cannot leave a resumable attempt', async () => {
  const gate = deferred()
  const h = await authHarness({ prefsHooks: { set: () => gate.promise } })
  const { promise } = await h.begin()
  const rejected = assert.rejects(promise, /cancelled/)
  h.api.cancelGoogleMobile()
  gate.resolve()
  await rejected
  await flush()
  assert.equal(h.store.has(ATTEMPT), false)
  assert.equal(h.calls.filter(([name]) => name === 'open').length, 0)
  await h.emit(`${CALLBACK}?code=cancelled-flow`)
  assert.equal(h.calls.filter(([name]) => name === 'exchange').length, 0)
})

test('retry waits for the old browser close and cannot be closed by stale cleanup', async () => {
  const closeGate = deferred()
  let closes = 0
  const h = await authHarness({ close: () => ++closes === 1 ? closeGate.promise : undefined })
  const first = await h.begin()
  const cancelled = assert.rejects(first.promise, /cancelled/)
  h.api.cancelGoogleMobile()
  await flush()
  const second = await h.begin()
  assert.equal(h.calls.filter(([name]) => name === 'open').length, 1, 'retry must wait for old Custom Tab to close')
  await h.emit(`${CALLBACK}?code=while-cancelling`)
  assert.equal(h.calls.filter(([name]) => name === 'exchange').length, 0)
  closeGate.resolve()
  await cancelled
  await flush()
  assert.equal(h.calls.filter(([name]) => name === 'open').length, 2)
  await h.emit(`${CALLBACK}?code=retry-code`)
  await second.promise
})

test('browser dismissal beside callback does not interrupt an in-flight exchange', async () => {
  const gate = deferred()
  const h = await authHarness({ exchange: () => gate.promise })
  const { promise } = await h.begin()
  await h.emit(`${CALLBACK}?code=valid`)
  h.browserEvents.get('browserFinished')()
  await h.time.advance(301)
  gate.resolve({ error: null })
  await promise
})

test('browser, provider and exchange errors reach the caller; cleanup failure does not replace them', async () => {
  for (const options of [
    { open: async () => { throw new Error('browser unavailable') }, expected: /browser unavailable/ },
    { oauth: async () => ({ data: null, error: new Error('provider unavailable') }), expected: /provider unavailable/ },
    { exchange: async () => ({ error: new Error('exchange rejected') }), expected: /exchange rejected/ },
  ]) {
    const h = await authHarness({ ...options, close: async () => { throw new Error('close failed') } })
    const promise = h.api.signInWithGoogleMobile()
    const rejected = assert.rejects(promise, options.expected)
    await flush()
    if (options.exchange) await h.emit(`${CALLBACK}?code=valid`)
    await rejected
  }
})

test('native resume starts refresh and schedules sync; pause stops refresh', async () => {
  const h = await authHarness()
  let resumed = 0
  h.context.window.addEventListener('kast:resume', () => resumed++)
  h.appEvents.get('appStateChange')({ isActive: false })
  h.appEvents.get('appStateChange')({ isActive: true })
  assert.equal(resumed, 1)
  assert.ok(h.calls.some(([name]) => name === 'refresh-start'))
  assert.ok(h.calls.some(([name]) => name === 'refresh-stop'))
})

async function platformHarness({ store = new Map(), native = true, desktop, prefsHooks = {}, writeFile, share, document } = {}) {
  const calls = [], appEvents = new Map()
  const loaded = await loadModule('src/renderer/src/lib/platform.ts', {
    '@capacitor/core': { Capacitor: { isNativePlatform: () => native } },
    '@capacitor/app': { App: {
      async getInfo() { return { version: '0.1.test' } },
      async addListener(name, callback) { appEvents.set(name, callback) },
      async minimizeApp() { calls.push(['minimize']) },
    } },
    '@capacitor/preferences': { Preferences: preferences(store, prefsHooks) },
    '@capacitor/filesystem': { Directory: { Cache: 'CACHE' }, Encoding: { UTF8: 'UTF8' }, Filesystem: {
      async writeFile(options) { calls.push(['write', options]); return writeFile ? writeFile(options) : { uri: 'file:///cache/backups/kast.json' } },
    } },
    '@capacitor/share': { Share: { async share(options) { calls.push(['share', options]); await share?.(options) } } },
    './mobileAuth': { async initMobileAuth() { calls.push(['init-auth']) } },
  }, { window: desktop ? { kast: desktop } : new EventTarget(), ...(document ? { document } : {}) })
  return { ...loaded, store, calls, appEvents }
}

test('settings persist across recreation, serialize writes and hide unsupported native options', async () => {
  const h = await platformHarness()
  await Promise.all([h.api.setPlatformSettings({ eveningHour: 19 }), h.api.setPlatformSettings({ eveningHour: 21 })])
  assert.equal(h.api.getPlatformSettingsSnapshot().eveningHour, 21)
  assert.equal(h.api.getPlatformSettingsSnapshot().notifyEvening, false)
  assert.equal(h.api.getPlatformSettingsSnapshot().launchAtLogin, false)
  const restored = await platformHarness({ store: h.store })
  await restored.api.loadPlatformSettings()
  assert.equal(restored.api.getPlatformSettingsSnapshot().eveningHour, 21)
})

test('settings write failures reach the caller without poisoning later saves', async () => {
  let shouldFail = true
  const h = await platformHarness({ prefsHooks: { set: () => { if (shouldFail) throw new Error('disk full') } } })
  await assert.rejects(h.api.setPlatformSettings({ eveningHour: 22 }), /disk full/)
  assert.equal(h.api.getPlatformSettingsSnapshot().eveningHour, 18)
  shouldFail = false
  await h.api.setPlatformSettings({ eveningHour: 20 })
  assert.equal(h.api.getPlatformSettingsSnapshot().eveningHour, 20)
})

test('invalid settings fall back to defaults, and invalid evening hours are rejected', async () => {
  for (const value of ['invalid JSON', '{"eveningHour":2}', 'null']) {
    const h = await platformHarness({ store: new Map([[SETTINGS, value]]) })
    await h.api.loadPlatformSettings()
    assert.equal(h.api.getPlatformSettingsSnapshot().eveningHour, 18)
  }
})

test('Promise auth storage persists and removes the verifier across module recreation', async () => {
  const gate = deferred()
  const h = await platformHarness({ prefsHooks: { set: () => gate.promise } })
  let completed = false
  const pending = h.api.mobileAuthStorage.setItem('test-verifier', 'fake-value').then(() => { completed = true })
  await flush()
  assert.equal(completed, false)
  gate.resolve()
  await pending
  const restored = await platformHarness({ store: h.store })
  assert.equal(await restored.api.mobileAuthStorage.getItem('test-verifier'), 'fake-value')
  await restored.api.mobileAuthStorage.removeItem('test-verifier')
  assert.equal(await restored.api.mobileAuthStorage.getItem('test-verifier'), null)
})

test('Android back is consumable; otherwise minimizes and never exits', async () => {
  const h = await platformHarness()
  await h.api.initMobilePlatform()
  assert.equal(h.api.getAppVersion(), '0.1.test')
  h.appEvents.get('backButton')()
  assert.equal(h.calls.filter(([name]) => name === 'minimize').length, 1)
  h.context.document.addEventListener('kast:back', (event) => event.preventDefault())
  h.appEvents.get('backButton')()
  assert.equal(h.calls.filter(([name]) => name === 'minimize').length, 1)
  await h.api.initMobilePlatform()
  assert.equal(h.calls.filter(([name]) => name === 'init-auth').length, 1)
})

test('backup writes UTF-8 to allowed cache before sharing a file URI', async () => {
  const h = await platformHarness()
  assert.equal(await h.api.saveBackupFile('{"app":"kast"}', 'kast.json'), 'kast.json')
  const options = h.calls.find(([name]) => name === 'write')[1]
  assert.equal(options.directory, 'CACHE')
  assert.equal(options.encoding, 'UTF8')
  assert.equal(options.data, '{"app":"kast"}')
  assert.equal(h.calls.find(([name]) => name === 'share')[1].files[0], 'file:///cache/backups/kast.json')
})

test('backup distinguishes share cancellation and real errors without losing failures', async () => {
  const cancelled = await platformHarness({ share: async () => { throw new Error('Share canceled') } })
  assert.equal(await cancelled.api.saveBackupFile('{}', 'kast.json'), null)
  const failed = await platformHarness({ share: async () => { throw new Error('permission denied') } })
  await assert.rejects(failed.api.saveBackupFile('{}', 'kast.json'), /permission denied/)
  const disk = await platformHarness({ writeFile: async () => { throw new Error('disk full') } })
  await assert.rejects(disk.api.saveBackupFile('{}', 'kast.json'), /disk full/)
  assert.equal(disk.calls.filter(([name]) => name === 'share').length, 0)
})

test('file import resolves text or cancellation and propagates file read errors', async () => {
  let input
  const document = { body: { append() {} }, createElement() {
    input = new EventTarget()
    input.remove = () => { input.removed = true }
    input.click = () => {}
    return input
  } }
  const h = await platformHarness({ document })
  let promise = h.api.openBackupFile()
  input.files = [{ text: async () => '{"app":"kast"}' }]
  input.dispatchEvent(new Event('change'))
  assert.equal(await promise, '{"app":"kast"}')
  assert.equal(input.removed, true)
  promise = h.api.openBackupFile()
  input.dispatchEvent(new Event('cancel'))
  assert.equal(await promise, null)
  promise = h.api.openBackupFile()
  input.files = [{ text: async () => { throw new Error('read failed') } }]
  input.dispatchEvent(new Event('change'))
  await assert.rejects(promise, /read failed/)
})

test('desktop settings and backup keep their original Electron IPC path', async () => {
  const ipc = []
  const settings = { hotkey: 'Control+Shift+Space', eveningHour: 18, notifyEvening: true, launchAtLogin: true }
  const desktop = {
    info: { version: 'desktop-test' },
    settings: { async get() { return settings }, async set(patch) { ipc.push('settings'); return { ...settings, ...patch } } },
    backup: { async save() { ipc.push('save'); return 'C:\\kast.json' }, async open() { ipc.push('open'); return '{}' } },
  }
  const h = await platformHarness({ native: false, desktop })
  await h.api.loadPlatformSettings()
  await h.api.setPlatformSettings({ eveningHour: 20 })
  assert.equal(h.api.getPlatformSettingsSnapshot().launchAtLogin, true)
  assert.equal(h.api.getPlatformSettingsSnapshot().eveningHour, 20)
  assert.equal(await h.api.saveBackupFile('{}', 'kast.json'), 'C:\\kast.json')
  assert.equal(await h.api.openBackupFile(), '{}')
  assert.deepEqual(ipc, ['settings', 'save', 'open'])
  assert.equal(h.calls.length, 0)
})

test('native manifest routes the same exact callback and keeps app-private backup sharing', async () => {
  const manifest = await readFile(new URL('android/app/src/main/AndroidManifest.xml', ROOT), 'utf8')
  const callback = new URL(CALLBACK)
  assert.match(manifest, /android:launchMode="singleTask"/)
  assert.match(manifest, /android:name="android\.intent\.category\.BROWSABLE"/)
  assert.ok(manifest.includes(`android:scheme="${callback.protocol.slice(0, -1)}" android:host="${callback.hostname}" android:path="${callback.pathname}"`))
  assert.match(manifest, /android:grantUriPermissions="true"/)
  assert.match(manifest, /android:allowBackup="false"/)
  const filePaths = await readFile(new URL('android/app/src/main/res/xml/file_paths.xml', ROOT), 'utf8')
  assert.match(filePaths, /<cache-path\b/)
})
