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
  /** Поточний крок — завжди лише один (ковзний: зробили — питаємо наступний) */
  firstStep: string
  /** Форматовані нотатки задачі (посилання-чипи, кнопки копіювання); notes — простий текст для пошуку */
  notesHtml?: string
  /** Скільки кроків уже зроблено в цій задачі */
  stepsDone?: number
  /** Черга кроків після поточного: на екрані їх не видно, наступний піднімається, коли поточний зроблено */
  nextSteps?: string[]
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
  /** 1 — нотатка «Швидкі записи» (одна на акаунт; позначка синхронізується, тож другий ПК не створює дубль) */
  quick?: 1
  pinned: 0 | 1
  /** 1 — редагування заблоковане: текст можна лише читати й копіювати */
  locked?: 1
  createdAt: number
}

/** Фото чи скріншот, прикріплений до нотатки або задачі; стиснене зображення як data URL */
export interface FileRec extends Syncable {
  id: string
  /** id нотатки чи задачі, до якої прикріплено */
  owner: string
  data: string
  w: number
  h: number
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
  files!: Table<FileRec, string>
  meta!: Table<Meta, string>

  constructor() {
    super('kast')
    this.version(1).stores({
      tasks: 'id, status, planDate, doneAt, dirty',
      notes: 'id, updatedAt, dirty',
      days: 'date, dirty',
      meta: 'key',
    })
    // Фото та скріншоти в нотатках і задачах
    this.version(2).stores({ files: 'id, owner, dirty' })
  }
}

export const db = new KastDB()

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key)
  return row ? (row.value as T) : fallback
}
export const setMeta = (key: string, value: unknown) => db.meta.put({ key, value })
