import { useLiveQuery } from 'dexie-react-hooks'
import { dayKey } from '@/lib/time'
import { db, type Note, type Task } from './db'
import { WHEN_ORDER } from './tasks'

const alive = <T extends { deleted: 0 | 1 }>(rows: T[]) => rows.filter((r) => !r.deleted)

export function sortToday(a: Task, b: Task) {
  return WHEN_ORDER[a.when] - WHEN_ORDER[b.when] || a.order - b.order
}

export function useToday(date: string) {
  return useLiveQuery(async () => {
    const rows = alive(await db.tasks.where('planDate').equals(date).toArray())
    const open = rows.filter((t) => t.status === 'today').sort(sortToday)
    return {
      main: open.filter((t) => t.kind === 'main'),
      small: open.filter((t) => t.kind === 'small'),
      done: rows.filter((t) => t.status === 'done').sort((a, b) => (a.doneAt ?? 0) - (b.doneAt ?? 0)),
    }
  }, [date])
}

/** Заплановані на минулі дні й не закриті */
export function useLeftovers(date: string) {
  return useLiveQuery(
    async () =>
      alive(await db.tasks.where('planDate').below(date).toArray())
        .filter((t) => t.status === 'today')
        .sort((a, b) => a.order - b.order),
    [date],
  )
}

export function useStatus(status: Task['status']) {
  return useLiveQuery(async () => alive(await db.tasks.where('status').equals(status).toArray()), [status])
}

export function useDone() {
  return useLiveQuery(async () =>
    alive(await db.tasks.where('status').equals('done').toArray()).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)),
  )
}

export function useTask(id: string | null) {
  return useLiveQuery(async () => (id ? ((await db.tasks.get(id)) ?? null) : null), [id])
}

export function useDay(date: string = dayKey()) {
  return useLiveQuery(() => db.days.get(date), [date])
}

export function useNotes() {
  return useLiveQuery(async () =>
    alive(await db.notes.toArray()).sort((a: Note, b: Note) => b.pinned - a.pinned || b.updatedAt - a.updatedAt),
  )
}
