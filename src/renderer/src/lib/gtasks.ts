/*
 * Google Tasks у renderer: один спільний стан для «Сьогодні» й Налаштувань.
 * Самі запити йдуть через головний процес (там токени), тут — лише список і статус.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { liveQuery } from 'dexie'
import type { GTask, GTasksStatus, KastSyncItem } from '../../../shared/types'
import { db, type Task } from '@/data/db'
import { complete, update } from '@/data/tasks'
import { DAY, now } from './time'
import { isDesktop } from './platform'

interface State {
  status: GTasksStatus
  items: GTask[]
  loading: boolean
  error?: string
}

const REFRESH_MS = 5 * 60_000

let state: State = { status: { configured: false, connected: false }, items: [], loading: false }
const listeners = new Set<() => void>()
let lastLoad = 0
let inFlight: Promise<void> | null = null

function set(patch: Partial<State>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

const readable = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/** Оновити статус і список. Повторні виклики під час завантаження чекають той самий запит. */
export function refreshGTasks(force = false): Promise<void> {
  if (!isDesktop) return Promise.resolve()
  if (inFlight) return inFlight
  if (!force && Date.now() - lastLoad < 30_000) return Promise.resolve()
  inFlight = (async () => {
    set({ loading: true })
    try {
      const status = await window.kast.gtasks.status()
      if (!status.connected) return set({ status, items: [], error: undefined })
      await syncKastToGoogle().catch((e) => console.warn('kast → google failed', e))
      const items = await window.kast.gtasks.list()
      lastLoad = Date.now()
      set({ status, items, error: undefined })
    } catch (e) {
      const msg = readable(e)
      // Доступ відкликали в Google — головний процес уже забув ключ, показуємо «Підключити»
      if (msg === 'not-connected') set({ status: await window.kast.gtasks.status(), items: [], error: undefined })
      else set({ error: msg })
    } finally {
      set({ loading: false })
      inFlight = null
    }
  })()
  return inFlight
}

export async function connectGTasks() {
  const status = await window.kast.gtasks.connect().catch((e) => {
    throw new Error(readable(e))
  })
  set({ status })
  await refreshGTasks(true)
}

export async function disconnectGTasks() {
  set({ status: await window.kast.gtasks.disconnect(), items: [], error: undefined })
}

/** Позначити виконаним у Google. Рядок зникає одразу; якщо не вдалося — повертається. */
export async function completeGTask(task: GTask) {
  set({ items: state.items.filter((t) => t.id !== task.id) })
  try {
    await window.kast.gtasks.complete(task.listId, task.id)
  } catch (e) {
    set({ items: [...state.items, task] })
    throw new Error(readable(e))
  }
}

/** Стан Google Tasks; поки компонент на екрані — оновлюється раз на 5 хв і при поверненні у вікно */
export function useGTasks(): State {
  const s = useSyncExternalStore(subscribe, () => state)
  useEffect(() => {
    if (!isDesktop) return
    refreshGTasks()
    const t = setInterval(() => refreshGTasks(true), REFRESH_MS)
    const onFocus = () => refreshGTasks()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', onFocus)
    }
  }, [])
  return s
}

/* ───────────── Kast → Google: список «Kast» ───────────── */

/** Скільки днів виконана задача ще лишається в Google (потім — прибирається зі списку «Kast») */
const KEEP_DONE_DAYS = 30

function toItem(t: Task): KastSyncItem | null {
  if (t.deleted || !t.title.trim() || t.repeatOf) return null
  const open = t.status === 'today' || t.status === 'inbox' || t.status === 'scheduled'
  const done = t.status === 'done' && !!t.doneAt && t.doneAt > now() - KEEP_DONE_DAYS * DAY
  if (!open && !done) return null
  return {
    id: t.id,
    title: t.title.trim(),
    notes: [t.firstStep && `Крок: ${t.firstStep}`, t.notes].filter(Boolean).join('\n\n') || undefined,
    due: t.status === 'inbox' ? undefined : (t.planDate ?? undefined),
    done,
  }
}

let kastSync: Promise<void> | null = null

/** Звести задачі Kast зі списком «Kast» у Google і застосувати зміни, зроблені там */
export function syncKastToGoogle(): Promise<void> {
  if (!isDesktop || !state.status.connected) return Promise.resolve()
  kastSync ??= (async () => {
    const items = (await db.tasks.toArray()).map(toItem).filter((i): i is KastSyncItem => !!i)
    const actions = await window.kast.gtasks.syncKast(items)
    for (const a of actions) {
      if (a.title) await update(a.id, { title: a.title })
      if (a.done !== undefined) await complete(a.id, a.done)
    }
  })().finally(() => {
    kastSync = null
  })
  return kastSync
}

let started = false

/**
 * Запустити зворотний напрям: кожна зміна задач Kast за кілька секунд доходить у Google.
 * Викликати після першого завантаження з хмари — інакше неповна база прибрала б задачі з Google.
 */
export function startGoogleSync() {
  if (!isDesktop || started) return
  started = true
  let timer: ReturnType<typeof setTimeout> | undefined
  let last = ''
  liveQuery(() => db.tasks.toArray()).subscribe((tasks) => {
    // Відбиток лише того, що йде в Google: інші зміни (кроки, порядок) запиту не викликають
    const print = JSON.stringify(tasks.map(toItem).filter(Boolean))
    if (print === last) return
    const first = !last
    last = print
    if (first) return
    clearTimeout(timer)
    timer = setTimeout(() => syncKastToGoogle().catch((e) => console.warn('kast → google failed', e)), 3000)
  })
  refreshGTasks(true)
}
