import { addDays, DAY, dayKey, now } from '@/lib/time'
import { db, getMeta, type Day, type Task, type TaskKind, type When } from './db'

/** Ліміти дня: вибір із ≤3 головних не перевантажує (метод Айві Лі / 1-3-5) */
export const MAIN_LIMIT = 3
export const SMALL_LIMIT = 5
/** Через скільки днів задача з Вхідних тихо йде в «Колись» */
export const STALE_DAYS = 14

export const WHEN_ORDER: Record<When, number> = { morning: 0, afternoon: 1, evening: 2, any: 3 }

const uid = () => crypto.randomUUID()

export function touch<T extends object>(patch: T) {
  return { ...patch, updatedAt: now(), dirty: 1 as const }
}

function newTask(title: string, patch: Partial<Task> = {}): Task {
  const t = now()
  return {
    id: uid(),
    title: title.trim(),
    notes: '',
    status: 'inbox',
    kind: 'main',
    when: 'any',
    firstStep: '',
    order: t,
    planDate: null,
    inboxAt: t,
    staleAt: null,
    doneAt: null,
    sourceNoteId: null,
    createdAt: t,
    updatedAt: t,
    deleted: 0,
    dirty: 1,
    ...patch,
  }
}

export const update = (id: string, patch: Partial<Task>) => db.tasks.update(id, touch(patch))

/**
 * Ковзний крок: поточний зроблено — піднімається наступний із черги (або поле звільняється),
 * лічильник +1. Повертає скасування.
 */
export async function finishStep(id: string) {
  const t = await db.tasks.get(id)
  if (!t?.firstStep.trim()) return undefined
  const queue = t.nextSteps ?? []
  const before = { firstStep: t.firstStep, stepsDone: t.stepsDone ?? 0, nextSteps: queue }
  await update(id, { firstStep: queue[0] ?? '', nextSteps: queue.slice(1), stepsDone: before.stepsDone + 1 })
  return () => update(id, before)
}

/** Додати кроки в чергу (кілька рядків — кілька кроків). Якщо поточного кроку немає, перший стає поточним. */
export async function addSteps(id: string, text: string) {
  const t = await db.tasks.get(id)
  const steps = text.split('\n').map((s) => s.trim()).filter(Boolean)
  if (!t || !steps.length) return
  const queue = [...(t.nextSteps ?? [])]
  let current = t.firstStep.trim()
  for (const s of steps) {
    if (!current) current = s
    else queue.push(s)
  }
  await update(id, { firstStep: current, nextSteps: queue })
}

/* ───────── Запис ───────── */

export async function captureToInbox(title: string, patch: Partial<Task> = {}) {
  const task = newTask(title, patch)
  await db.tasks.add(task)
  return task
}

/* ───────── Сьогодні ───────── */

export async function todayTasks(date = dayKey()) {
  const rows = await db.tasks.where('planDate').equals(date).toArray()
  return rows.filter((t) => !t.deleted && t.status === 'today')
}

export type Placement = 'main' | 'small' | 'inbox'

/** Куди лягає нова задача, щоб не перевищити ліміт дня. Ніколи не блокує введення. */
async function placement(date: string, prefer?: TaskKind): Promise<Placement> {
  const list = await todayTasks(date)
  const main = list.filter((t) => t.kind === 'main').length
  const small = list.length - main
  if (prefer !== 'small' && main < MAIN_LIMIT) return 'main'
  if (small < SMALL_LIMIT) return 'small'
  return 'inbox'
}

export async function addToToday(title: string, prefer?: TaskKind): Promise<Placement> {
  const date = dayKey()
  const p = await placement(date, prefer)
  await db.tasks.add(
    newTask(title, p === 'inbox' ? {} : { status: 'today', kind: p, planDate: date }),
  )
  return p
}

/** Взяти наявну задачу (з Вхідних чи незавершену) на сьогодні */
export async function takeToToday(id: string, prefer?: TaskKind): Promise<Placement> {
  const date = dayKey()
  const p = await placement(date, prefer)
  if (p === 'inbox') return p
  await update(id, { status: 'today', kind: p, planDate: date, order: now(), staleAt: null })
  return p
}

export async function setKind(id: string, kind: TaskKind): Promise<boolean> {
  const t = await db.tasks.get(id)
  if (!t || t.kind === kind) return true
  if ((await placement(t.planDate ?? dayKey(), kind)) !== kind) return false
  await update(id, { kind })
  return true
}

/**
 * Галочка. Виконана задача рахується в сьогоднішньому прогресі, звідки б її не взяли (Вхідні, Колись).
 * Зняття галочки повертає задачу на сьогодні в межах ліміту, а якщо день повний — у Вхідні.
 */
export async function complete(id: string, done: boolean): Promise<Placement | undefined> {
  const t = await db.tasks.get(id)
  if (!t) return
  if (done) {
    await update(id, { status: 'done', doneAt: now(), planDate: dayKey() })
    return
  }
  const p = await placement(dayKey(), t.kind)
  if (p === 'inbox') await update(id, { status: 'inbox', doneAt: null, planDate: null, inboxAt: now() })
  else await update(id, { status: 'today', kind: p, doneAt: null, planDate: dayKey() })
  return p
}

export const toInbox = (id: string) => update(id, { status: 'inbox', planDate: null, inboxAt: now(), staleAt: null })
export const toSomeday = (id: string) => update(id, { status: 'someday', planDate: null })
/** «Відпустити» — свідомо відмовитися без провини (лишається в історії) */
export const letGo = (id: string) => update(id, { status: 'dropped', planDate: null })
export const remove = (id: string) => update(id, { deleted: 1 })

/* ───────── День ───────── */

async function patchDay(date: string, patch: Partial<Day>) {
  const cur = await db.days.get(date)
  await db.days.put(touch({ date, plannedAt: null, closedAt: null, deleted: 0 as const, ...cur, ...patch }))
}

export const markPlanned = () => patchDay(dayKey(), { plannedAt: now() })

/**
 * Новий день: незакриті задачі з минулих днів не зникають у нікуди, а повертаються у Вхідні.
 * Стара planDate лишається позначкою «не завершено раніше» — за нею їх показує «План на день».
 */
export async function rolloverLeftovers(date = dayKey()) {
  const stale = (await db.tasks.where('planDate').below(date).toArray()).filter((t) => !t.deleted && t.status === 'today')
  for (const t of stale) await update(t.id, { status: 'inbox', inboxAt: now(), staleAt: null })
  return stale.length
}

export type CloseChoice = 'tomorrow' | 'inbox' | 'letgo'

export async function closeDay(choices: Record<string, CloseChoice>, tomorrowNote: string) {
  const today = dayKey()
  const tomorrow = addDays(today, 1)
  await db.transaction('rw', db.tasks, db.days, async () => {
    // Завтра теж діє ліміт 3 + 5: що не влазить — у Вхідні, а не понад межу
    const planned = await todayTasks(tomorrow)
    let main = planned.filter((t) => t.kind === 'main').length
    let small = planned.length - main
    for (const [id, c] of Object.entries(choices)) {
      if (c === 'tomorrow') {
        const t = await db.tasks.get(id)
        const kind = t?.kind === 'main' && main < MAIN_LIMIT ? 'main' : small < SMALL_LIMIT ? 'small' : main < MAIN_LIMIT ? 'main' : null
        if (!kind) await toInbox(id)
        else {
          if (kind === 'main') main++
          else small++
          await update(id, { planDate: tomorrow, kind, order: now() })
        }
      } else if (c === 'inbox') await toInbox(id)
      else await letGo(id)
    }
    // Записати те, що крутиться в голові: кожен рядок — окрема задача у Вхідних
    for (const line of tomorrowNote.split('\n').map((l) => l.trim()).filter(Boolean)) {
      await db.tasks.add(newTask(line))
    }
    await patchDay(today, { closedAt: now() })
  })
}

/* ───────── Тихе старіння й тижневий перегляд ───────── */

/** Задачі, що лежать у Вхідних понад 14 днів, переходять у «Колись» */
export async function sweepStale() {
  const cutoff = now() - STALE_DAYS * DAY
  const stale = (await db.tasks.where('status').equals('inbox').toArray()).filter((t) => !t.deleted && t.inboxAt < cutoff)
  for (const t of stale) await update(t.id, { status: 'someday', staleAt: now() })
  return stale.length
}

/*
 * Час останнього тижневого перегляду — спільний для всіх ПК акаунта: зберігаємо його службовим
 * записом у таблиці днів (ключ 'review'), яка синхронізується. Старе локальне значення — запасне.
 */
const REVIEW_KEY = 'lastReviewAt'
const REVIEW_DAY = 'review'
async function lastReviewAt() {
  const synced = (await db.days.get(REVIEW_DAY))?.plannedAt
  return synced ?? (await getMeta<number>(REVIEW_KEY, 0))
}
const markReviewed = () => patchDay(REVIEW_DAY, { plannedAt: now() })

/** Задачі, що застаріли з часу останнього перегляду. Перегляд пропонується раз на тиждень. */
export async function reviewCandidates(): Promise<Task[]> {
  const last = await lastReviewAt()
  if (now() - last < 6 * DAY) return []
  const rows = await db.tasks.where('status').equals('someday').toArray()
  return rows.filter((t) => !t.deleted && t.staleAt && t.staleAt > last)
}

export type ReviewChoice = 'keep' | 'someday' | 'delete'

export async function finishReview(choices: Record<string, ReviewChoice>) {
  for (const [id, c] of Object.entries(choices)) {
    if (c === 'keep') await toInbox(id)
    else if (c === 'delete') await remove(id)
  }
  await markReviewed()
}

export const skipReview = () => markReviewed()
