/*
 * Local-first синхронізація: усе пишеться в IndexedDB одразу, а сюди потрапляє у фоні.
 * push: усі записи з dirty=1 → upsert; pull: усе, що змінилося на сервері після курсора.
 * Конфлікти — last-write-wins по запису (updatedAt), і на клієнті, і на сервері.
 */
import { liveQuery } from 'dexie'
import { useSyncExternalStore } from 'react'
import type { RealtimeChannel, Session } from '@supabase/supabase-js'
import type { SyncState } from '@/design-system'
import { db, getMeta, setMeta, type Day, type FileRec, type Note, type Syncable, type Task } from '@/data/db'
import { supabase } from './client'

type Kind = 'task' | 'note' | 'day' | 'file'
type Row = (Task | Note | Day | FileRec) & Syncable

const tables = {
  task: { table: () => db.tasks, key: (r: Row) => (r as Task).id },
  note: { table: () => db.notes, key: (r: Row) => (r as Note).id },
  day: { table: () => db.days, key: (r: Row) => (r as Day).date },
  file: { table: () => db.files, key: (r: Row) => (r as FileRec).id },
} as const
const KINDS = Object.keys(tables) as Kind[]

interface Remote {
  kind: Kind
  id: string
  data: Row
  updated_at: number
  deleted: boolean
  server_ts: string
}

/* ───────── Стан для UI ───────── */

interface Snapshot {
  state: SyncState
  email: string | null
  name: string | null
  avatar: string | null
}
let snap: Snapshot = { state: 'local', email: null, name: null, avatar: null }
const listeners = new Set<() => void>()
function setSnap(patch: Partial<Snapshot>) {
  snap = { ...snap, ...patch }
  listeners.forEach((l) => l())
}
export function useSync() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => snap,
  )
}

/* ───────── Push / Pull ───────── */

const CURSOR = 'syncCursor'
const USER = 'syncUser'
const OVERLAP_MS = 5000
const PURGED = 'syncPurgedAt'
/** Скільки тримати позначки видалення: стільки інший ПК може бути офлайн і все одно дізнатися про видалення */
const TOMBSTONE_DAYS = 30
const DAY_MS = 86_400_000

/** Раз на добу прибирає старі позначки видалення — і на сервері, і локально (лише вже синхронізовані) */
async function purgeTombstones() {
  const last = await getMeta<number>(PURGED, 0)
  if (Date.now() - last < DAY_MS) return
  const cutoff = Date.now() - TOMBSTONE_DAYS * DAY_MS
  const { error } = await supabase!.from('records').delete().eq('deleted', true).lt('updated_at', cutoff)
  if (error) throw error
  for (const kind of KINDS) {
    const { table, key } = tables[kind]
    const old = ((await table().where('dirty').equals(0).toArray()) as Row[]).filter((r) => r.deleted && r.updatedAt < cutoff)
    await table().bulkDelete(old.map(key) as never)
  }
  await setMeta(PURGED, Date.now())
}

let session: Session | null = null
let running = false
let again = false

async function push(userId: string) {
  for (const kind of KINDS) {
    try {
      await pushKind(userId, kind)
    } catch (e) {
      // Сервер зі старою схемою не знає тип 'file' — фото лишаються на цьому ПК, решта синхронізується
      if (kind === 'file' && (e as { code?: string }).code === '23514') {
        console.warn('Фото не синхронізуються: оновіть схему Supabase (supabase/schema.sql)')
        continue
      }
      throw e
    }
  }
}

async function pushKind(userId: string, kind: Kind) {
  const { table, key } = tables[kind]
  const dirty = (await table().where('dirty').equals(1).toArray()) as Row[]
  // Фото важкі — відправляємо меншими пачками
  const size = kind === 'file' ? 10 : 500
  for (let i = 0; i < dirty.length; i += size) {
    const batch = dirty.slice(i, i + size)
    const { error } = await supabase!.from('records').upsert(
      batch.map((r) => {
        const { dirty: _d, ...data } = r
        return { user_id: userId, kind, id: key(r), data, updated_at: r.updatedAt, deleted: !!r.deleted }
      }),
      { onConflict: 'user_id,kind,id' },
    )
    if (error) throw error
    // Знімаємо dirty лише з тих записів, які не змінилися під час відправлення
    await db.transaction('rw', table(), async () => {
      for (const r of batch) {
        const cur = (await table().get(key(r) as never)) as Row | undefined
        if (cur && cur.updatedAt === r.updatedAt) await table().update(key(r) as never, { dirty: 0 } as never)
      }
    })
  }
}

async function pull() {
  const cursor = await getMeta<string>(CURSOR, '1970-01-01T00:00:00Z')
  const since = new Date(new Date(cursor).getTime() - OVERLAP_MS).toISOString()
  let maxTs = cursor
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase!
      .from('records')
      .select('kind,id,data,updated_at,deleted,server_ts')
      .gt('server_ts', since)
      .order('server_ts')
      .range(from, from + 999)
    if (error) throw error
    const rows = (data ?? []) as Remote[]
    for (const kind of KINDS) {
      const { table } = tables[kind]
      const mine = rows.filter((r) => r.kind === kind)
      if (!mine.length) continue
      await db.transaction('rw', table(), async () => {
        for (const r of mine) {
          const local = (await table().get(r.id as never)) as Row | undefined
          if (local && local.updatedAt >= r.updated_at) continue
          await table().put({ ...r.data, deleted: r.deleted ? 1 : 0, updatedAt: r.updated_at, dirty: 0 } as never)
        }
      })
    }
    for (const r of rows) if (r.server_ts > maxTs) maxTs = r.server_ts
    if (rows.length < 1000) break
  }
  await setMeta(CURSOR, maxTs)
}

export async function syncNow() {
  if (!supabase || !session) return
  if (running) {
    again = true
    return
  }
  if (!navigator.onLine) return setSnap({ state: 'offline' })
  running = true
  setSnap({ state: 'syncing' })
  try {
    await push(session.user.id)
    await pull()
    await purgeTombstones().catch((e) => console.warn('purge skipped', e))
    setSnap({ state: 'synced' })
  } catch (e) {
    console.error('sync failed', e)
    setSnap({ state: navigator.onLine ? 'error' : 'offline' })
  } finally {
    running = false
    if (again) {
      again = false
      syncNow()
    }
  }
}

/* ───────── Життєвий цикл ───────── */

let channel: RealtimeChannel | null = null
let debounce: ReturnType<typeof setTimeout> | undefined
const schedule = (ms = 1500) => {
  clearTimeout(debounce)
  debounce = setTimeout(syncNow, ms)
}

/** Коли в Kast з'являється інший акаунт — відправити йому все локальне й почати pull з нуля */
async function adoptUser(userId: string) {
  if ((await getMeta<string | null>(USER, null)) === userId) return
  await db.transaction('rw', db.tasks, db.notes, db.days, db.files, async () => {
    await db.tasks.toCollection().modify({ dirty: 1 })
    await db.notes.toCollection().modify({ dirty: 1 })
    await db.days.toCollection().modify({ dirty: 1 })
    await db.files.toCollection().modify({ dirty: 1 })
  })
  await setMeta(CURSOR, '1970-01-01T00:00:00Z')
  await setMeta(USER, userId)
}

async function onSession(s: Session | null) {
  session = s
  channel?.unsubscribe()
  channel = null
  if (!s) return setSnap({ state: 'local', email: null, name: null, avatar: null })
  const meta = s.user.user_metadata ?? {}
  setSnap({ email: s.user.email ?? null, name: meta.full_name ?? meta.name ?? null, avatar: meta.avatar_url ?? meta.picture ?? null })
  await adoptUser(s.user.id)
  channel = supabase!
    .channel('records')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `user_id=eq.${s.user.id}` }, () => schedule(300))
    .subscribe()
  syncNow()
}

let started = false

/** Запускається один раз у головному вікні */
export function startSync() {
  if (!supabase || started) return
  started = true
  supabase.auth.getSession().then(({ data }) => onSession(data.session))
  supabase.auth.onAuthStateChange((event, s) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') onSession(s)
    else session = s
  })
  // Будь-яка локальна зміна (у т. ч. з вікна швидкого запису) → push через 1.5 с
  liveQuery(async () => {
    const counts = await Promise.all([db.tasks, db.notes, db.days, db.files].map((t) => t.where('dirty').equals(1).count()))
    return counts.reduce((a, b) => a + b, 0)
  }).subscribe((n) => n > 0 && schedule())
  window.addEventListener('online', () => schedule(100))
  window.addEventListener('offline', () => session && setSnap({ state: 'offline' }))
  setInterval(() => schedule(0), 5 * 60_000)
}

/* ───────── Вхід кодом з пошти ───────── */

/**
 * Вхід через Google: Supabase дає адресу сторінки Google, main відкриває її в браузері
 * й чекає повернення на 127.0.0.1, далі одноразовий код обмінюємо на сесію (PKCE).
 */
export async function signInWithGoogle() {
  if (!supabase) throw new Error('Синхронізацію ще не налаштовано')
  const redirectTo = await window.kast.auth.prepare()
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
    })
    if (error) throw error
    const result = await window.kast.auth.open(data.url)
    if (result.error !== undefined) throw new Error(result.error)
    const { error: exchange } = await supabase.auth.exchangeCodeForSession(result.code)
    if (exchange) throw exchange
  } finally {
    window.kast.auth.cancel()
  }
}

export const cancelGoogle = () => window.kast?.auth.cancel()

export async function sendCode(email: string) {
  const { error } = await supabase!.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
  if (error) throw error
}

export async function verifyCode(email: string, token: string) {
  const { error } = await supabase!.auth.verifyOtp({ email, token, type: 'email' })
  if (error) throw error
}

export const signOut = () => supabase?.auth.signOut()
