/*
 * Вхід через Google (OAuth через Supabase, PKCE) для десктопу.
 * Kast на час входу слухає 127.0.0.1 і відкриває сторінку Google у браузері користувача.
 * Після вибору акаунта браузер повертається на локальну адресу з одноразовим кодом,
 * який renderer обмінює на сесію. Сервер закривається одразу після відповіді або за 5 хв.
 */
import { createServer, type Server } from 'node:http'
import { shell } from 'electron'
import type { OAuthResult } from '../shared/types'

const PORTS = [53682, 53683, 53684]
const TIMEOUT_MS = 5 * 60_000

let server: Server | null = null
let port = 0
let preparedTimer: ReturnType<typeof setTimeout> | undefined
let pending: { resolve: (r: OAuthResult) => void; timer: ReturnType<typeof setTimeout> } | null = null
let onReturn: () => void = () => {}

const page = (title: string, text: string) => `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>Kast</title>
<style>html,body{height:100%;margin:0;background:#090a0a;color:#f4f4f2;font-family:'Segoe UI',system-ui,sans-serif}
body{display:grid;place-items:center}main{text-align:center;padding:24px}
.k{display:inline-grid;place-items:center;width:64px;height:64px;border-radius:50%;background:#f4f4f2;color:#090a0a;margin-bottom:28px}
h1{margin:0;font-size:56px;line-height:.92;letter-spacing:-.035em;text-transform:uppercase;font-weight:800}
p{margin:18px 0 0;font-size:16px;font-weight:600;color:#a1a1a6}</style></head>
<body><main><span class="k"><svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M3 2h7v7h3V2h8v7l-4 4 4 4v5h-8v-7h-3v7H3z"/></svg></span>
<h1>${title}</h1><p>${text}</p></main></body></html>`

function finish(result: OAuthResult) {
  const current = pending
  pending = null
  stop()
  if (!current) return
  clearTimeout(current.timer)
  current.resolve(result)
}

function stop() {
  clearTimeout(preparedTimer)
  preparedTimer = undefined
  server?.close()
  server = null
  port = 0
}

async function listen(): Promise<void> {
  for (const p of PORTS) {
    const ok = await new Promise<boolean>((resolve) => {
      const s = createServer((req, res) => {
        const url = new URL(req.url ?? '/', `http://127.0.0.1:${p}`)
        if (url.pathname !== '/auth/callback') {
          res.writeHead(404).end()
          return
        }
        if (req.method !== 'GET' || !pending) {
          res.writeHead(400).end()
          return
        }
        const code = url.searchParams.get('code')
        const error = url.searchParams.get('error_description') ?? url.searchParams.get('error')
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(code ? page('Готово', 'Можна закрити цю вкладку й повернутися в Kast.') : page('Не вийшло', 'Поверніться в Kast і спробуйте ще раз.'))
        finish(code ? { code } : { error: error ?? 'Вхід скасовано' })
        onReturn()
      })
      s.once('error', () => resolve(false))
      s.listen(p, '127.0.0.1', () => {
        server = s
        port = p
        resolve(true)
      })
    })
    if (ok) return
  }
  throw new Error('Не вдалося відкрити локальну адресу для входу')
}

/** Крок 1: підняти локальну адресу й повернути redirect для Supabase */
export async function prepareOAuth(): Promise<string> {
  if (pending) finish({ error: 'Попередній вхід скасовано' })
  if (!server) await listen()
  clearTimeout(preparedTimer)
  preparedTimer = setTimeout(stop, TIMEOUT_MS)
  return `http://127.0.0.1:${port}/auth/callback`
}

/** Крок 2: відкрити сторінку входу в браузері й дочекатися повернення */
export function openOAuth(url: string, focusApp: () => void): Promise<OAuthResult> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') return Promise.resolve({ error: 'Небезпечна адреса входу' })
  if (!server || pending) return Promise.resolve({ error: 'Почніть вхід ще раз' })
  clearTimeout(preparedTimer)
  preparedTimer = undefined
  onReturn = focusApp
  return new Promise((resolve) => {
    const current = { resolve, timer: setTimeout(() => finish({ error: 'Час на вхід вийшов' }), TIMEOUT_MS) }
    pending = current
    shell.openExternal(url).catch(() => {
      if (pending === current) finish({ error: 'Не вдалося відкрити браузер. Спробуйте ще раз.' })
    })
  })
}

export function cancelOAuth() {
  finish({ error: 'cancelled' })
}
