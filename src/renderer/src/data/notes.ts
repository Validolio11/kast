import { fmtTime, now } from '@/lib/time'
import { db, getMeta, setMeta, type Note } from './db'
import { captureToInbox, touch } from './tasks'

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

/**
 * Перетворює рядок нотатки на задачу у Вхідних.
 * Повертає новий текст нотатки (рядок позначено «↗»), або null, якщо рядок порожній чи вже відправлений.
 */
export async function lineToTask(noteId: string, body: string, lineIndex: number): Promise<string | null> {
  const lines = body.split('\n')
  const raw = lines[lineIndex] ?? ''
  if (raw.startsWith(SENT_MARK)) return null
  const title = raw.replace(TASK_LINE, '').replace(/^[-•*]\s+/, '').trim()
  if (!title) return null
  await captureToInbox(title, { sourceNoteId: noteId })
  lines[lineIndex] = SENT_MARK + title
  const next = lines.join('\n')
  await updateNote(noteId, { body: next })
  return next
}

const QUICK_KEY = 'quickNoteId'

/** Швидкий запис у блокнот: дописує рядок у закріплену нотатку «Швидкі записи» */
export async function appendToQuickNote(text: string) {
  const id = await getMeta<string | null>(QUICK_KEY, null)
  const note = id ? await db.notes.get(id) : undefined
  const line = `${fmtTime(now())}  ${text.trim()}`
  if (note && !note.deleted) {
    await updateNote(note.id, { body: `${note.body.trimEnd()}\n${line}` })
    return
  }
  const created = await createNote(`Швидкі записи\n${line}`, { pinned: 1 })
  await setMeta(QUICK_KEY, created.id)
}
