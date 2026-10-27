import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, ContextMenu, RoundButton, useToast } from '@/design-system'
import type { FileRec } from '@/data/db'
import { downloadImage, removeImage, restoreImage, useImages } from '@/data/files'

/**
 * Фото й скріншоти нотатки чи задачі: по три в рядок, клік — перегляд у повному розмірі
 * з кнопкою «Завантажити», правий клік — відкрити, завантажити або видалити.
 */
export function Attachments({ owner }: { owner: string }) {
  const images = useImages(owner)
  const toast = useToast()
  const [open, setOpen] = useState<number | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; file: FileRec; index: number } | null>(null)
  if (!images?.length) return null

  const remove = (file: FileRec) => {
    removeImage(file.id)
    toast({ kind: 'info', title: 'Фото видалено', action: { label: 'Скасувати', onClick: () => restoreImage(file.id) } })
  }

  return (
    <>
      <div className="mt-4 grid grid-cols-3 gap-3" contentEditable={false}>
        {images.map((f, i) => (
          <button
            key={f.id}
            onClick={() => setOpen(i)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ x: e.clientX, y: e.clientY, file: f, index: i })
            }}
            aria-label={`Відкрити фото ${i + 1}`}
            className="aspect-[4/3] overflow-hidden rounded-[24px] bg-paper-line transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
          >
            <img src={f.data} alt="" draggable={false} className="size-full object-cover" />
          </button>
        ))}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label="Дії з фото"
          onClose={() => setMenu(null)}
          items={[
            { label: 'Відкрити', icon: 'image', onSelect: () => (setMenu(null), setOpen(menu.index)) },
            { label: 'Завантажити', icon: 'download', onSelect: () => (setMenu(null), downloadImage(menu.file)) },
            { label: 'Видалити', icon: 'trashLines', tone: 'danger', onSelect: () => (setMenu(null), remove(menu.file)) },
          ]}
        />
      )}
      {open !== null && images[open] && (
        <Viewer images={images} index={open} onIndex={setOpen} onClose={() => setOpen(null)} onRemove={(f) => (setOpen(null), remove(f))} />
      )}
    </>
  )
}

/** Перегляд фото на весь екран: у натуральному розмірі (не більше вікна), стрілки — сусідні фото */
function Viewer({
  images,
  index,
  onIndex,
  onClose,
  onRemove,
}: {
  images: FileRec[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
  onRemove: (f: FileRec) => void
}) {
  const file = images[index]
  const many = images.length > 1
  const step = (d: number) => onIndex((index + d + images.length) % images.length)

  useEffect(() => {
    // Перехоплюємо раніше за інші (capture), щоб Esc закрив лише перегляд, а не весь Фокус
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
      if (many && e.key === 'ArrowRight') step(1)
      if (many && e.key === 'ArrowLeft') step(-1)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  return createPortal(
    <div
      role="dialog"
      aria-label="Перегляд фото"
      className="no-drag fixed inset-0 z-[90] flex animate-fade-in flex-col items-center justify-center gap-5 bg-canvas/90 p-8 backdrop-blur-sm"
      onClick={onClose}
    >
      <img
        src={file.data}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-h-[calc(100vh-160px)] max-w-full animate-modal-in rounded-[28px] object-contain shadow-[0_24px_60px_-12px_rgba(0,0,0,0.9)]"
        style={{ width: file.w, aspectRatio: `${file.w} / ${file.h}` }}
      />
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {many && <RoundButton icon="chevronLeft" label="Попереднє · ←" onClick={() => step(-1)} />}
        <Button size="md" variant="pulse" iconLeft="download" onClick={() => downloadImage(file)}>
          Завантажити
        </Button>
        <RoundButton icon="trash" label="Видалити фото" onClick={() => onRemove(file)} />
        {many && <RoundButton icon="chevronRight" label="Наступне · →" onClick={() => step(1)} />}
        <span className="px-2 text-[13px] font-bold text-muted tabular-nums">
          {many ? `${index + 1} / ${images.length} · ` : ''}
          {file.w}×{file.h}
        </span>
        <RoundButton icon="x" label="Закрити · Esc" onClick={onClose} />
      </div>
    </div>,
    document.body,
  )
}

/** Кнопка «Додати фото»: відкриває вибір файлів (кілька одразу) */
export function AddImageButton({ onFiles, tone = 'paper-line' }: { onFiles: (files: File[]) => void; tone?: 'tile' | 'paper' | 'paper-line' }) {
  const pick = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = true
    input.onchange = () => input.files && onFiles(Array.from(input.files))
    input.click()
  }
  return <RoundButton icon="image" tone={tone} label="Додати фото · або Ctrl+V скріншот" onClick={pick} />
}

