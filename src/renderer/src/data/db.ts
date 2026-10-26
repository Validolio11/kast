import Dexie, { type Table } from 'dexie'

export type TaskStatus = 'inbox' | 'today' | 'someday' | 'done' | 'dropped'
export type TaskKind = 'main' | 'small'
/** Намір реалізації: коли саме я це зроблю */
export type When = 'any' | 'morning' | 'afternoon' | 'evening'

/** Спільні поля для синхронізації */
export interface Syncable {
  updatedAt: number
  deleted: 0 | 1
  /** 1 — змінено локально й ще не відправлено */
  dirty: 0 | 1
}

export interface Task extends Syncable {
  id: string
  title: string
  notes: string
  status: TaskStatus
  kind: TaskKind
  when: When
  firstStep: string
  order: number
  /** День, на який задача запланована (YYYY-MM-DD) */
  planDate: string | null
  /** Коли задача востаннє потрапила у Вхідні — для тихого «старіння» */
  inboxAt: number
  /** Коли задачу автоматично перенесено в «Колись» */
  staleAt: number | null
  doneAt: number | null
  sourceNoteId: string | null
  createdAt: number
}

export interface Note extends Syncable {
  id: string
  /** Простий текст: заголовок — перший рядок; для пошуку й синхронізації */
  body: string
  /** Форматований текст першої сторінки (шрифти, нумерація, кнопки копіювання) */
  html?: string
  /** Усі сторінки нотатки (HTML); перша дублюється в html для старих версій */
  pages?: string[]
  pinned: 0 | 1
  createdAt: number
}

export interface Day extends Syncable {
  date: string
  plannedAt: number | null
  closedAt: number | null
}

export interface Meta {
  key: string
  value: unknown
}

class KastDB extends Dexie {
  tasks!: Table<Task, string>
  notes!: Table<Note, string>
  days!: Table<Day, string>
  meta!: Table<Meta, string>

  constructor() {
    super('kast')
    this.version(1).stores({
      tasks: 'id, status, planDate, doneAt, dirty',
      notes: 'id, updatedAt, dirty',
      days: 'date, dirty',
      meta: 'key',
    })
  }
}

export const db = new KastDB()

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key)
  return row ? (row.value as T) : fallback
}
export const setMeta = (key: string, value: unknown) => db.meta.put({ key, value })
