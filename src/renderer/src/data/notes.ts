import { fmtTime, now } from '@/lib/time'
import { db, getMeta, setMeta, type Note } from './db'
import { touch } from './tasks'

/** Рядок, що починається з «[]» або «- [ ]», — це задача */
export const TASK_LINE = /^\s*(?:-\s*)?\[\s?\]\s*/
/** Позначка рядка, вже перетвореного на задачу */
export const SENT_MARK = '↗ '

export function noteTitle(body: string) {
  const line = body.split('\n').find((l) => l.trim())
  return line ? line.replace(/^#+\s*/, '').trim().slice(0, 80) : 'Без назви'
}

export function notePreview(body: string) {
  const lines = body.split('\n').filter((l) => l.trim())
  return lines.slice(1).join(' · ').slice(0, 120)
}

export async function createNote(body = '', patch: Partial<Note> = {}) {
  const t = now()
  const note: Note = { id: crypto.randomUUID(), body, pinned: 0, createdAt: t, updatedAt: t, deleted: 0, dirty: 1, ...patch }
  await db.notes.add(note)
  return note
}

export const updateNote = (id: string, patch: Partial<Note>) => db.notes.update(id, touch(patch))
export const removeNote = (id: string) => updateNote(id, { deleted: 1 })

const QUICK_KEY = 'quickNoteId'

/** Нотатка «Швидкі записи», створена до позначки quick, отримує її (одноразово при старті) */
export async function markLegacyQuickNote() {
  const id = await getMeta<string | null>(QUICK_KEY, null)
  const note = id ? await db.notes.get(id) : undefined
  if (note && !note.quick && !note.deleted) await updateNote(note.id, { quick: 1 })
}

/** Швидкий запис у блокнот: дописує рядок у закріплену нотатку «Швидкі записи» */
export async function appendToQuickNote(text: string) {
  // Спершу локальна підказка, далі позначка quick — її приносить синхронізація з інших ПК
  const id = await getMeta<string | null>(QUICK_KEY, null)
  let note = id ? await db.notes.get(id) : undefined
  if (!note || note.deleted) note = (await db.notes.toArray()).find((n) => n.quick && !n.deleted)
  const line = `${fmtTime(now())}  ${text.trim()}`
  if (note && !note.deleted) {
    // Форматований текст теж доповнюємо (на останній сторінці), щоб відкрита нотатка показала новий рядок
    const row = `<div>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`
    const patch: Partial<Note> = { body: `${note.body.trimEnd()}\n${line}` }
    if (note.pages?.length) {
      const pages = [...note.pages]
      pages[pages.length - 1] += row
      Object.assign(patch, { pages, html: pages[0] })
    } else if (note.html !== undefined) patch.html = note.html + row
    await updateNote(note.id, patch)
    return
  }
  const created = await createNote(`Швидкі записи\n${line}`, { pinned: 1, quick: 1 })
  await setMeta(QUICK_KEY, created.id)
}
