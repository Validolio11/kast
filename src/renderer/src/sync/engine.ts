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
import { isNativeMobile } from '@/lib/platform'
import { cancelGoogleMobile, signInWithGoogleMobile } from '@/lib/mobileAuth'

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
  /** Увійшли в інший акаунт, а на пристрої дані попереднього: чекаємо рішення людини */
  switching: { from: string | null; unsynced: number } | null
}
let snap: Snapshot = { state: 'local', email: null, name: null, avatar: null, switching: null }
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
const EPOCH = '1970-01-01T00:00:00Z'
const USER = 'syncUser'
const USER_EMAIL = 'syncEmail'
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

/** Скільки записів не вдалося відправити (вони лишаються dirty і підуть наступного разу) */
async function push(userId: string) {
  let failed = 0
  for (const kind of KINDS) {
    try {
      failed += await pushKind(userId, kind)
    } catch (e) {
      // Сервер зі старою схемою не знає тип 'file' — фото лишаються на цьому ПК, решта синхронізується
      if (kind === 'file' && (e as { code?: string }).code === '23514') {
        console.warn('Фото не синхронізуються: оновіть схему Supabase (supabase/schema.sql)')
        continue
      }
      throw e
    }
  }
  return failed
}

/** Немає мережі — немає сенсу пробувати записи по одному */
const isNetwork = (e: unknown) => !navigator.onLine || /fetch|network/i.test(String((e as { message?: string })?.message ?? e))

async function pushKind(userId: string, kind: Kind) {
  const { table } = tables[kind]
  const dirty = (await table().where('dirty').equals(1).toArray()) as Row[]
  // Фото важкі — відправляємо меншими пачками
  const size = kind === 'file' ? 10 : 500
  let failed = 0
  for (let i = 0; i < dirty.length; i += size) {
    const batch = dirty.slice(i, i + size)
    try {
      await sendBatch(userId, kind, batch)
    } catch (e) {
      if (isNetwork(e) || (kind === 'file' && (e as { code?: string }).code === '23514')) throw e
      // Пачку не прийняли — шлемо по одному, щоб один поганий запис не тримав усі інші
      for (const r of batch) {
        try {
          await sendBatch(userId, kind, [r])
        } catch (err) {
          if (isNetwork(err)) throw err
          console.error('sync: запис не прийнято', kind, tables[kind].key(r), err)
          failed++
        }
      }
    }
  }
  return failed
}

async function sendBatch(userId: string, kind: Kind, batch: Row[]) {
  const { table, key } = tables[kind]
  {
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

/** Записи з сервера — у локальну базу; ключ беремо з колонки id, а не з довільного JSON */
async function applyRemote(rows: Remote[]) {
  for (const kind of KINDS) {
    const { table } = tables[kind]
    const keyName = kind === 'day' ? 'date' : 'id'
    const mine = rows.filter((r) => r.kind === kind && r.data && typeof r.data === 'object')
    if (!mine.length) continue
    await db.transaction('rw', table(), async () => {
      for (const r of mine) {
        const local = (await table().get(r.id as never)) as Row | undefined
        if (local && local.updatedAt >= r.updated_at) continue
        await table().put({ ...r.data, [keyName]: r.id, deleted: r.deleted ? 1 : 0, updatedAt: r.updated_at, dirty: 0 } as never)
      }
    })
  }
}

/**
 * Сторінки за ключем (server_ts, kind, id), а не за зсувом: запис, змінений посеред завантаження,
 * не зсуває решту й не губиться. Одна пачка push має однаковий server_ts — сторінка має бути більшою
 * за пачку (500 записів, 10 фото). Повертає найбільший побачений server_ts або null, якщо застрягли.
 */
async function pullKinds(since: string, files: boolean, page: number) {
  let from = since
  let strict = true
  let maxTs = since
  const seen = new Set<string>()
  for (;;) {
    let q = supabase!.from('records').select('kind,id,data,updated_at,deleted,server_ts')
    q = files ? q.eq('kind', 'file') : q.neq('kind', 'file')
    q = strict ? q.gt('server_ts', from) : q.gte('server_ts', from)
    const { data, error } = await q.order('server_ts').order('kind').order('id').limit(page)
    if (error) throw error
    const all = (data ?? []) as Remote[]
    const rows = all.filter((r) => !seen.has(`${r.kind}:${r.id}:${r.server_ts}`))
    await applyRemote(rows)
    for (const r of rows) {
      seen.add(`${r.kind}:${r.id}:${r.server_ts}`)
      if (r.server_ts > maxTs) maxTs = r.server_ts
    }
    if (all.length < page) return maxTs
    // Повна сторінка з уже баченими записами — далі не просунутись; курсор не рухаємо
    if (!rows.length) {
      console.warn('sync: забагато записів з однаковим часом сервера')
      return null
    }
    from = all[all.length - 1].server_ts
    strict = false
  }
}

async function pull(userId: string) {
  const cursor = await getMeta<string>(CURSOR, EPOCH)
  const since = new Date(new Date(cursor).getTime() - OVERLAP_MS).toISOString()
  const a = await pullKinds(since, false, 1000)
  const b = await pullKinds(since, true, 50)
  // Акаунт змінився під час завантаження — курсор належить уже іншому
  if (session?.user.id !== userId) return
  if (a === null || b === null) return
  const maxTs = [cursor, a, b].reduce((m, t) => (t > m ? t : m))
  await setMeta(CURSOR, maxTs)
}

/** Перша синхронізація цього запуску: перенесення дня чекає її, щоб не перезаписати свіжіші зміни з інших пристроїв */
let markFirstPull: () => void = () => {}
const firstPull = new Promise<void>((done) => (markFirstPull = done))
export function afterFirstPull(timeout = 10_000) {
  if (!supabase) return Promise.resolve()
  return Promise.race([firstPull, new Promise<void>((done) => setTimeout(done, timeout))])
}
/** Чи бачить цей пристрій усе з хмари (або працює без акаунта): тоді можна прибирати «нічиї» фото */
let pulledOk = false
export const upToDate = () => !supabase || !session || pulledOk

export async function syncNow() {
  // Поки людина не вирішила, що робити з даними попереднього акаунта, нічого не відправляємо
  if (!supabase || !session || pendingSession) return
  if (running) {
    again = true
    return
  }
  if (!navigator.onLine) {
    markFirstPull()
    return setSnap({ state: 'offline' })
  }
  running = true
  setSnap({ state: 'syncing' })
  const userId = session.user.id
  let ok = true
  try {
    if ((await push(userId)) > 0) ok = false
  } catch (e) {
    console.error('sync: push failed', e)
    ok = false
  }
  // Навіть якщо щось не відправилось — забираємо зміни з інших пристроїв
  try {
    await pull(userId)
    pulledOk = true
  } catch (e) {
    console.error('sync: pull failed', e)
    ok = false
  }
  if (ok) await purgeTombstones().catch((e) => console.warn('purge skipped', e))
  setSnap({ state: ok ? 'synced' : navigator.onLine ? 'error' : 'offline' })
  running = false
  markFirstPull()
  if (again) {
    again = false
    syncNow()
  }
}

/* ───────── Життєвий цикл ───────── */

let channel: RealtimeChannel | null = null
let debounce: ReturnType<typeof setTimeout> | undefined
const schedule = (ms = 1500) => {
  clearTimeout(debounce)
  debounce = setTimeout(syncNow, ms)
}

const ALL = () => [db.tasks, db.notes, db.days, db.files] as const

/** Усе локальне — у цей акаунт: позначаємо до відправлення й починаємо pull з нуля */
async function moveToUser(s: Session) {
  await db.transaction('rw', [...ALL()], async () => {
    // Таблиці різних типів — modify з однаковою зміною підходить усім
    for (const t of ALL()) await (t.toCollection() as unknown as { modify: (c: { dirty: 1 }) => Promise<number> }).modify({ dirty: 1 })
  })
  await remember(s)
}
async function remember(s: Session) {
  await setMeta(CURSOR, EPOCH)
  await setMeta(USER, s.user.id)
  await setMeta(USER_EMAIL, s.user.email ?? null)
}

/** Сесія, що чекає рішення про дані попереднього акаунта */
let pendingSession: Session | null = null

/**
 * Перший вхід на пристрої — локальні записи переходять в акаунт (так працювали до входу).
 * Інший акаунт, а на пристрої дані попереднього, — спершу питаємо: інакше чужі нотатки опиняться в новому акаунті.
 */
async function adoptUser(s: Session) {
  const prev = await getMeta<string | null>(USER, null)
  if (prev === s.user.id) return true
  const counts = await Promise.all(ALL().map((t) => t.count()))
  if (prev && counts.some((n) => n > 0)) {
    const unsynced = (await Promise.all(ALL().map((t) => t.where('dirty').equals(1).count()))).reduce((a, b) => a + b, 0)
    pendingSession = s
    setSnap({ switching: { from: await getMeta<string | null>(USER_EMAIL, null), unsynced } })
    return false
  }
  await moveToUser(s)
  return true
}

/** Відповідь на запит про інший акаунт: перенести дані, прибрати їх з пристрою або вийти */
export async function resolveAccountSwitch(choice: 'move' | 'clear' | 'cancel') {
  const s = pendingSession
  pendingSession = null
  setSnap({ switching: null })
  if (!s) return
  if (choice === 'cancel') return void signOut()
  if (choice === 'move') await moveToUser(s)
  else {
    // Дані попереднього акаунта лишаються в його хмарі; з пристрою прибираємо лише локальні копії
    await db.transaction('rw', [...ALL()], async () => {
      for (const t of ALL()) await t.clear()
    })
    await setMeta('quickNoteId', null)
    await remember(s)
  }
  if (session?.user.id === s.user.id) begin(s)
}

function begin(s: Session) {
  channel?.unsubscribe()
  channel = supabase!
    .channel('records')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `user_id=eq.${s.user.id}` }, () => schedule(300))
    .subscribe()
  syncNow()
}

let sessionSeq = 0
async function onSession(s: Session | null) {
  // Кілька подій поспіль (вхід, оновлення токена) — актуальна лише остання
  const seq = ++sessionSeq
  session = s
  pendingSession = null
  channel?.unsubscribe()
  channel = null
  if (!s) {
    setSnap({ state: 'local', email: null, name: null, avatar: null, switching: null })
    markFirstPull()
    return
  }
  const meta = s.user.user_metadata ?? {}
  setSnap({ email: s.user.email ?? null, name: meta.full_name ?? meta.name ?? null, avatar: meta.avatar_url ?? meta.picture ?? null, switching: null })
  try {
    const ready = await adoptUser(s)
    if (seq !== sessionSeq) return
    if (!ready) return markFirstPull()
  } catch (e) {
    console.error('sync: account check failed', e)
    return markFirstPull()
  }
  begin(s)
}

let started = false

/** Запускається один раз у головному вікні */
export function startSync() {
  if (!supabase || started) return
  started = true
  supabase.auth.getSession().then(({ data }) => onSession(data.session)).catch((e) => {
    console.error('sync: session failed', e)
    markFirstPull()
  })
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
  window.addEventListener('kast:resume', () => schedule(100))
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
  if (isNativeMobile) return signInWithGoogleMobile()
  if (!window.kast?.auth) throw new Error('Для входу відкрийте Kast на телефоні або комп’ютері')
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

export const cancelGoogle = () => isNativeMobile ? cancelGoogleMobile() : window.kast?.auth.cancel()

export async function sendCode(email: string) {
  const { error } = await supabase!.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
  if (error) throw error
}

export async function verifyCode(email: string, token: string) {
  const { error } = await supabase!.auth.verifyOtp({ email, token, type: 'email' })
  if (error) throw error
}

/** Вихід лише на цьому пристрої: на телефоні й інших ПК синхронізація триває */
export const signOut = () => supabase?.auth.signOut({ scope: 'local' }).catch((e) => console.error('sign out failed', e))
