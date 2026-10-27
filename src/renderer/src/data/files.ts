import { useLiveQuery } from 'dexie-react-hooks'
import { now } from '@/lib/time'
import { db, type FileRec } from './db'
import { touch } from './tasks'

/** Довша сторона після стиснення: скріншот лишається читабельним, а запис — легким для синхронізації */
const MAX_SIDE = 1600
const QUALITY = 0.82

/** Стискає зображення у WebP (або JPEG, якщо WebP недоступний) і повертає data URL з розмірами */
async function compress(file: Blob): Promise<{ data: string; w: number; h: number }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  let data = canvas.toDataURL('image/webp', QUALITY)
  if (!data.startsWith('data:image/webp')) data = canvas.toDataURL('image/jpeg', QUALITY)
  return { data, w, h }
}

/** Прикріпити фото чи скріншоти до нотатки або задачі; нечитабельні файли пропускаються */
export async function addImages(owner: string, files: Iterable<Blob>) {
  let added = 0
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue
    try {
      const { data, w, h } = await compress(file)
      const t = now()
      await db.files.add({ id: crypto.randomUUID(), owner, data, w, h, createdAt: t, updatedAt: t, deleted: 0, dirty: 1 })
      added++
    } catch (e) {
      console.warn('image skipped', e)
    }
  }
  return added
}

export const removeImage = (id: string) => db.files.update(id, touch({ deleted: 1 as const }))
export const restoreImage = (id: string) => db.files.update(id, touch({ deleted: 0 as const }))

/** Фото нотатки чи задачі в порядку додавання */
export function useImages(owner: string): FileRec[] | undefined {
  return useLiveQuery(
    async () =>
      (await db.files.where('owner').equals(owner).toArray()).filter((f) => !f.deleted).sort((a, b) => a.createdAt - b.createdAt),
    [owner],
  )
}

/** Зберегти фото на диск: Electron покаже стандартне вікно «Зберегти як» */
export function downloadImage(file: FileRec, name = 'kast-photo') {
  const ext = file.data.startsWith('data:image/webp') ? 'webp' : 'jpg'
  const a = document.createElement('a')
  a.href = file.data
  a.download = `${name}.${ext}`
  a.click()
}
