// Run: node --experimental-vm-modules --test scripts/test-gtasks.mjs
// Синхронізація Kast → Google Tasks (src/main/gtasks.ts) з підміненими Electron і мережею: що видаляється, що створюється.
import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { tmpdir } from 'node:os'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'

const FILE = fileURLToPath(new URL('../src/main/gtasks.ts', import.meta.url))

/** Підроблений Google Tasks: список «Kast» (id L) з задачами remote; failPost — номер POST, на якому «зникає мережа» */
function google(remote, { failPost } = {}) {
  const calls = []
  let posts = 0
  const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body })
  const fetch = async (url, init = {}) => {
    const method = init.method ?? 'GET'
    const u = new URL(url)
    calls.push(`${method} ${u.pathname}`)
    if (u.host === 'oauth2.googleapis.com') return json({ access_token: 'token', expires_in: 3600 })
    if (u.pathname.endsWith('/users/@me/lists')) return json({ items: [{ id: 'L', title: 'Kast' }] })
    if (method === 'GET') return json({ items: remote })
    if (method === 'POST') {
      posts++
      if (posts === failPost) throw new TypeError('fetch failed')
      return json({ id: `new${posts}` })
    }
    if (method === 'DELETE') return { ok: true, status: 204, json: async () => ({}) }
    return json({})
  }
  return { fetch, calls }
}

async function load(stored, net) {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'kast-gtasks-'))
  fs.writeFileSync(path.join(dir, 'google-tasks.json'), JSON.stringify({ refresh: 'enc', kastList: 'L', ...stored }))
  const context = vm.createContext({ URL, URLSearchParams, Buffer, console, fetch: net.fetch })
  const mocks = {
    electron: { app: { getPath: () => dir }, safeStorage: { decryptString: () => 'refresh', encryptString: (s) => Buffer.from(s), isEncryptionAvailable: () => true } },
    'node:crypto': crypto,
    'node:fs': fs,
    'node:path': path,
    './auth': { openOAuth: async () => ({}), prepareOAuth: async () => '' },
  }
  const modules = new Map()
  const resolve = async (spec) => {
    if (!(spec in mocks)) throw new Error(`Unmocked dependency: ${spec}`)
    if (!modules.has(spec)) {
      const values = mocks[spec]
      const m = new vm.SyntheticModule(Object.keys(values), function () {
        for (const [k, v] of Object.entries(values)) this.setExport(k, v)
      }, { context })
      await m.link(() => {})
      await m.evaluate()
      modules.set(spec, m)
    }
    return modules.get(spec)
  }
  const source = ts.transpileModule(await readFile(FILE, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  const mod = new vm.SourceTextModule(source, {
    context,
    identifier: FILE,
    initializeImportMeta: (meta) => {
      meta.env = { MAIN_VITE_GOOGLE_CLIENT_ID: 'id', MAIN_VITE_GOOGLE_CLIENT_SECRET: 'secret' }
    },
  })
  await mod.link(resolve)
  await mod.evaluate()
  const links = () => JSON.parse(fs.readFileSync(path.join(dir, 'google-tasks.json'), 'utf8')).links
  return { api: mod.namespace, links }
}

const item = (id, title = id, done = false) => ({ id, title, done })
const linked = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, { g: `g${i}`, done: false, title: `k${i}` }]))
const task = (id, title = id) => ({ id, title, status: 'needsAction' })

test('зникло 6 із 10 пов’язаних — схоже на збій: у Kast нічого не видаляється, лише розв’язується', async () => {
  const net = google([0, 1, 2, 3].map((i) => task(`g${i}`, `k${i}`)))
  const { api, links } = await load({ links: linked(10) }, net)
  const actions = await api.syncKast(Array.from({ length: 10 }, (_, i) => item(`k${i}`)))
  assert.equal(actions.filter((a) => a.deleted).length, 0)
  assert.equal(links().k9.g, null)
})

test('порожній список від Kast при наявних зв’язках — у Google нічого не видаляється', async () => {
  const net = google([0, 1, 2, 3, 4].map((i) => task(`g${i}`, `k${i}`)))
  const { api } = await load({ links: linked(5) }, net)
  await api.syncKast([])
  assert.equal(net.calls.filter((c) => c.startsWith('DELETE')).length, 0)
})

test('мережа зникла посередині — створені задачі запам’ятовуються й не створюються вдруге', async () => {
  const first = google([], { failPost: 2 })
  const a = await load({ links: {} }, first)
  await assert.rejects(a.api.syncKast([item('a'), item('b'), item('c')]))
  assert.equal(a.links().a.g, 'new1', 'зв’язок з уже створеною задачею збережено')

  // Наступна синхронізація: у Google вже є new1 — створюються лише дві решта
  const second = google([task('new1', 'a')])
  const b = await load({ links: a.links() }, second)
  await b.api.syncKast([item('a'), item('b'), item('c')])
  assert.equal(second.calls.filter((c) => c.startsWith('POST /tasks/')).length, 2)
})

test('незв’язана відкрита задача з тією самою назвою (копія з іншого ПК) — прив’язка без двійника; виконану не беремо', async () => {
  const net = google([task('other', 'Кава'), { id: 'old', title: 'Звіт', status: 'completed' }])
  const { api, links } = await load({ links: {} }, net)
  await api.syncKast([item('k1', 'Кава'), item('k2', 'Звіт')])
  assert.equal(links().k1.g, 'other')
  assert.notEqual(links().k2.g, 'old')
  assert.equal(net.calls.filter((c) => c.startsWith('POST /tasks/')).length, 1)
})
