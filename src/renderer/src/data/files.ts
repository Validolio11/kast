import { now } from '@/lib/time'
import { db, type FileRec } from './db'

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

/** Прикріпити фото чи скріншоти до нотатки або задачі; повертає id доданих (нечитабельні пропускаються) */
export async function addImages(owner: string, files: Iterable<Blob>) {
  const added: string[] = []
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue
    try {
      const { data, w, h } = await compress(file)
      const t = now()
      const id = crypto.randomUUID()
      await db.files.add({ id, owner, data, w, h, createdAt: t, updatedAt: t, deleted: 0, dirty: 1 })
      added.push(id)
    } catch (e) {
      console.warn('image skipped', e)
    }
  }
  return added
}

/** Зберегти фото на диск: Electron покаже стандартне вікно «Зберегти як» */
export function downloadImage(file: FileRec, name = 'kast-photo') {
  const ext = file.data.startsWith('data:image/webp') ? 'webp' : 'jpg'
  const a = document.createElement('a')
  a.href = file.data
  a.download = `${name}.${ext}`
  a.click()
}
