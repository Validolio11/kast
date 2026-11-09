/*
 * Google Tasks: власний вхід (OAuth для десктопу, PKCE + локальна адреса 127.0.0.1).
 * Окремо від входу Supabase: тут потрібен дозвіл саме на завдання і токен, що оновлюється сам.
 * Ключ оновлення зберігається зашифрованим (safeStorage — DPAPI у Windows) і ніколи не йде в renderer.
 */
import { app, safeStorage } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GTask, GTasksStatus, KastSyncAction, KastSyncItem } from '../shared/types'
import { openOAuth, prepareOAuth } from './auth'

const CLIENT_ID = import.meta.env.MAIN_VITE_GOOGLE_CLIENT_ID ?? ''
// Для десктопних клієнтів Google секрет не є таємницею (його видно в кожній копії програми) — захищає PKCE
const CLIENT_SECRET = import.meta.env.MAIN_VITE_GOOGLE_CLIENT_SECRET ?? ''
const SCOPES = 'openid email https://www.googleapis.com/auth/tasks'
const API = 'https://tasks.googleapis.com/tasks/v1'

/** Зв'язок задачі Kast із завданням у списку «Kast»: g — id у Google (null — видалено там, більше не чіпаємо) */
interface Link {
  g: string | null
  /** Стан, про який обидві сторони домовились на останній синхронізації — так видно, хто змінив */
  done: boolean
  title: string
}

interface Stored {
  email?: string
  /** Зашифрований ключ оновлення, base64 */
  refresh: string
  /** Список «Kast» у Google Tasks */
  kastList?: string
  links?: Record<string, Link>
}

const file = () => join(app.getPath('userData'), 'google-tasks.json')
let stored: Stored | null | undefined
let access: { token: string; until: number } | null = null

export const configured = () => !!CLIENT_ID && !!CLIENT_SECRET

function load(): Stored | null {
  if (stored !== undefined) return stored
  try {
    const s = JSON.parse(readFileSync(file(), 'utf8')) as Stored
    stored = typeof s.refresh === 'string' && s.refresh ? s : null
  } catch {
    stored = null
  }
  return stored
}

function persist(s: Stored | null) {
  stored = s
  access = null
  try {
    if (s) writeFileSync(file(), JSON.stringify(s))
    else rmSync(file(), { force: true })
  } catch (e) {
    console.error('google tasks store failed', e)
  }
}

export function status(): GTasksStatus {
  const s = load()
  return { configured: configured(), connected: !!s, email: s?.email }
}

const b64url = (b: Buffer) => b.toString('base64url')

/** Пошта з id_token (лише щоб показати, який акаунт підключено) */
function emailOf(idToken?: string): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(idToken!.split('.')[1], 'base64url').toString('utf8'))
    return typeof payload.email === 'string' ? payload.email : undefined
  } catch {
    return undefined
  }
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...body }),
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, string | number | undefined>
  if (!res.ok) throw Object.assign(new Error(String(json.error_description ?? json.error ?? `Google: ${res.status}`)), { code: json.error })
  return json
}

export async function connect(focusApp: () => void): Promise<GTasksStatus> {
  if (!configured()) throw new Error('Google Tasks ще не налаштовано в цій збірці Kast')
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows не дає зашифрувати ключ — підключення не збережеться')
  const verifier = b64url(randomBytes(48))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  const redirect = await prepareOAuth()
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirect,
    response_type: 'code',
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    // consent — щоб Google щоразу видав ключ оновлення, навіть якщо доступ уже давали
    prompt: 'consent',
  }).toString()
  const result = await openOAuth(url.toString(), focusApp)
  if (!result.code) throw new Error(result.error === 'cancelled' ? 'Скасовано' : result.error)
  const t = await tokenRequest({ code: result.code, code_verifier: verifier, redirect_uri: redirect, grant_type: 'authorization_code' })
  if (typeof t.refresh_token !== 'string') throw new Error('Google не видав ключ оновлення. Спробуйте ще раз.')
  persist({ email: emailOf(t.id_token as string | undefined), refresh: safeStorage.encryptString(t.refresh_token).toString('base64') })
  access = { token: String(t.access_token), until: Date.now() + (Number(t.expires_in) - 60) * 1000 }
  return status()
}

export async function disconnect(): Promise<GTasksStatus> {
  const s = load()
  persist(null)
  if (s) {
    // Відкликаємо доступ і в Google; якщо мережі немає — локально все одно відключено
    try {
      const token = safeStorage.decryptString(Buffer.from(s.refresh, 'base64'))
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }),
      })
    } catch {
      /* ignore */
    }
  }
  return status()
}

async function accessToken(): Promise<string> {
  if (access && access.until > Date.now()) return access.token
  const s = load()
  if (!s) throw new Error('not-connected')
  try {
    const t = await tokenRequest({ refresh_token: safeStorage.decryptString(Buffer.from(s.refresh, 'base64')), grant_type: 'refresh_token' })
    access = { token: String(t.access_token), until: Date.now() + (Number(t.expires_in) - 60) * 1000 }
    return access.token
  } catch (e) {
    // Доступ відкликали або ключ застарів — просимо підключитись знову
    if ((e as { code?: string }).code === 'invalid_grant') {
      persist(null)
      throw new Error('not-connected')
    }
    throw e
  }
}

async function api<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json', ...init?.headers },
  })
  if (res.status === 401 && retry) {
    access = null
    return api(path, init, false)
  }
  if (!res.ok) throw new Error(`Google Tasks: ${res.status}`)
  // DELETE відповідає 204 без тіла
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

interface Page<T> {
  items?: T[]
  nextPageToken?: string
}

async function all<T>(path: string): Promise<T[]> {
  const out: T[] = []
  let token: string | undefined
  // Обмеження на випадок дивної відповіді: до 10 сторінок по 100
  for (let i = 0; i < 10; i++) {
    const sep = path.includes('?') ? '&' : '?'
    const page = await api<Page<T>>(`${path}${sep}maxResults=100${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`)
    out.push(...(page.items ?? []))
    token = page.nextPageToken
    if (!token) break
  }
  return out
}

/** Усі незавершені завдання з усіх списків, крім «Kast» (там копії задач самого Kast) */
export async function list(): Promise<GTask[]> {
  const lists = await all<{ id: string; title: string }>('/users/@me/lists')
  const kastList = load()?.kastList
  const perList = await Promise.all(
    lists.filter((l) => l.id !== kastList).map(async (l) => {
      const items = await all<{ id: string; title?: string; notes?: string; due?: string; parent?: string; status?: string }>(
        `/lists/${encodeURIComponent(l.id)}/tasks?showCompleted=false&showHidden=false`,
      )
      return items
        .filter((t) => t.status !== 'completed' && t.title?.trim())
        .map<GTask>((t) => ({
          id: t.id,
          listId: l.id,
          list: l.title,
          title: t.title!.trim(),
          notes: t.notes?.trim() || undefined,
          // Google зберігає лише дату: «2026-11-09T00:00:00.000Z»
          due: t.due ? t.due.slice(0, 10) : undefined,
          sub: !!t.parent,
        }))
    }),
  )
  return perList.flat()
}

export async function complete(listId: string, taskId: string): Promise<void> {
  await api(`/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'completed' }),
  })
}

/* ───────────── Kast → Google: список «Kast» ───────────── */

const KAST_LIST = 'Kast'
const iso = (date: string) => `${date}T00:00:00.000Z`

interface RawTask {
  id: string
  title?: string
  status?: string
  due?: string
  deleted?: boolean
}

async function kastListId(): Promise<string> {
  const s = load()!
  const lists = await all<{ id: string; title: string }>('/users/@me/lists')
  const found = lists.find((l) => l.id === s.kastList) ?? lists.find((l) => l.title === KAST_LIST)
  if (found) {
    // Список знайшли під іншим id (створили заново) — старі зв'язки вказують у нікуди
    if (found.id !== s.kastList) persistLinks({ kastList: found.id, links: {} })
    return found.id
  }
  const made = await api<{ id: string }>('/users/@me/lists', { method: 'POST', body: JSON.stringify({ title: KAST_LIST }) })
  // Новий список — старі зв'язки вказують у нікуди
  persistLinks({ kastList: made.id, links: {} })
  return made.id
}

function persistLinks(patch: Pick<Stored, 'kastList' | 'links'>) {
  const s = load()
  if (!s) return
  stored = { ...s, ...patch }
  try {
    writeFileSync(file(), JSON.stringify(stored))
  } catch (e) {
    console.error('google tasks store failed', e)
  }
}

let syncing: Promise<KastSyncAction[]> | null = null

/**
 * Звести задачі Kast зі списком «Kast» у Google. items — відкриті задачі й нещодавно виконані.
 * Повертає зміни, зроблені в Google, які Kast має застосувати в себе (виконання, перейменування).
 */
export function syncKast(items: KastSyncItem[]): Promise<KastSyncAction[]> {
  syncing ??= run(items).finally(() => {
    syncing = null
  })
  return syncing
}

async function run(items: KastSyncItem[]): Promise<KastSyncAction[]> {
  if (!load()) throw new Error('not-connected')
  const listId = await kastListId()
  const base = `/lists/${encodeURIComponent(listId)}/tasks`
  const remote = new Map((await all<RawTask>(`${base}?showCompleted=true&showHidden=true`)).map((t) => [t.id, t]))
  const links: Record<string, Link> = { ...load()!.links }
  const actions: KastSyncAction[] = []
  const patch = (gid: string, body: Record<string, unknown>) =>
    api(`${base}/${encodeURIComponent(gid)}`, { method: 'PATCH', body: JSON.stringify(body) })

  for (const it of items) {
    const link = links[it.id]
    if (!link) {
      // Уже виконане до підключення в Google не несемо
      if (it.done) continue
      const made = await api<{ id: string }>(base, {
        method: 'POST',
        body: JSON.stringify({ title: it.title, notes: it.notes || undefined, due: it.due ? iso(it.due) : undefined }),
      })
      links[it.id] = { g: made.id, done: false, title: it.title }
      continue
    }
    if (!link.g) continue
    const g = remote.get(link.g)
    if (!g || g.deleted) {
      // Видалили в Google — Kast задачу не чіпає, лише перестає її синхронізувати
      links[it.id] = { ...link, g: null }
      continue
    }
    const body: Record<string, unknown> = {}
    const gDone = g.status === 'completed'
    if (gDone !== it.done) {
      if (gDone !== link.done) {
        actions.push({ id: it.id, done: gDone })
        link.done = gDone
      } else {
        body.status = it.done ? 'completed' : 'needsAction'
        if (!it.done) body.completed = null
        link.done = it.done
      }
    } else link.done = it.done
    const gTitle = (g.title ?? '').trim()
    if (gTitle && gTitle !== it.title) {
      if (gTitle !== link.title) {
        actions.push({ id: it.id, title: gTitle })
        link.title = gTitle
      } else {
        body.title = it.title
        link.title = it.title
      }
    } else link.title = it.title
    // Дату веде Kast: «Сьогодні» — з датою, Вхідні — без
    const gDue = g.due?.slice(0, 10)
    if ((gDue ?? null) !== (it.due ?? null)) body.due = it.due ? iso(it.due) : null
    if (Object.keys(body).length) await patch(link.g, body)
    links[it.id] = link
  }

  // Задачі, яких більше немає серед відкритих чи нещодавно виконаних, прибираємо з Google.
  // Порожній список від Kast при наявних зв'язках — підозріло (база ще не завантажилась), нічого не видаляємо.
  const keep = new Set(items.map((i) => i.id))
  const gone = Object.keys(links).filter((id) => !keep.has(id))
  if (items.length || gone.length <= 3) {
    for (const id of gone) {
      const g = links[id].g
      if (g && remote.has(g)) await api(`${base}/${encodeURIComponent(g)}`, { method: 'DELETE' }).catch(() => undefined)
      delete links[id]
    }
  }
  persistLinks({ kastList: listId, links })
  return actions
}
