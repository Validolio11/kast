import { dayKey, now } from '@/lib/time'
import { db, type Day, type Note, type Task } from './db'

/*
 * Резервна копія — один JSON-файл з усіма задачами, нотатками й днями (разом із позначками видалення,
 * щоб відновлення не «воскрешало» видалене). Не залежить від входу й синхронізації.
 */

interface Backup {
  app: 'kast'
  format: 1
  exportedAt: string
  tasks: Task[]
  notes: Note[]
  days: Day[]
}

export async function exportBackup() {
  const strip = <T extends { dirty: 0 | 1 }>(rows: T[]) => rows.map(({ dirty: _d, ...r }) => r)
  const data = {
    app: 'kast',
    format: 1,
    exportedAt: new Date(now()).toISOString(),
    tasks: strip(await db.tasks.toArray()),
    notes: strip(await db.notes.toArray()),
    days: strip(await db.days.toArray()),
  }
  return { json: JSON.stringify(data, null, 2), name: `kast-${dayKey()}.json`, count: data.tasks.length + data.notes.length }
}

const isRow = (r: unknown, key: string): r is Record<string, unknown> =>
  !!r && typeof r === 'object' && typeof (r as Record<string, unknown>)[key] === 'string' && typeof (r as Record<string, unknown>).updatedAt === 'number'

/**
 * Відновлення зливає копію з поточними даними: запис береться з файлу, лише якщо він новіший
 * за наявний або його ще немає. Відновлене позначається до синхронізації.
 */
export async function importBackup(text: string) {
  let parsed: Partial<Backup>
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Файл пошкоджений або це не JSON')
  }
  if (parsed.app !== 'kast' || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.notes)) {
    throw new Error('Це не резервна копія Kast')
  }
  const result = { tasks: 0, notes: 0, days: 0 }
  await db.transaction('rw', db.tasks, db.notes, db.days, async () => {
    for (const [name, table, key, rows] of [
      ['tasks', db.tasks, 'id', parsed.tasks],
      ['notes', db.notes, 'id', parsed.notes],
      ['days', db.days, 'date', parsed.days ?? []],
    ] as const) {
      for (const row of rows as unknown[]) {
        if (!isRow(row, key)) continue
        const cur = (await table.get(row[key] as never)) as { updatedAt: number } | undefined
        if (cur && cur.updatedAt >= (row.updatedAt as number)) continue
        await table.put({ ...row, dirty: 1 } as never)
        result[name]++
      }
    }
  })
  return result
}
