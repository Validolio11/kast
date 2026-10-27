/* Перегляд фото на весь екран і кнопка «Додати фото» — для фото всередині тексту нотаток */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, RoundButton } from '@/design-system'
import type { FileRec } from '@/data/db'
import { parseVideo } from './richText'
import { downloadImage } from '@/data/files'

/** Перегляд фото на весь екран: у натуральному розмірі (не більше вікна), стрілки — сусідні фото */
export function Viewer({
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
  /** Без нього (заблокована нотатка) кнопки «Видалити» немає */
  onRemove?: (f: FileRec) => void
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
        {onRemove && <RoundButton icon="trash" label="Прибрати з нотатки" onClick={() => onRemove(file)} />}
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


const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes('Files')

/**
 * Увесь аркуш приймає фото перетягуванням: підсвічується, поки файл над ним.
 * Кинуте прямо в текст обробляє редактор (фото лягає там, куди кинули), решту — onFiles.
 */
export function useImageDrop(onFiles: (files: File[]) => void, enabled = true) {
  const [over, setOver] = useState(false)
  const depth = useRef(0)
  if (!enabled) return { over: false, dropProps: {} }
  return {
    over,
    dropProps: {
      onDragEnter: (e: React.DragEvent) => {
        if (!hasFiles(e)) return
        depth.current++
        setOver(true)
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!hasFiles(e)) return
        depth.current = Math.max(0, depth.current - 1)
        if (!depth.current) setOver(false)
      },
      onDragOver: (e: React.DragEvent) => {
        if (hasFiles(e)) e.preventDefault()
      },
      onDrop: (e: React.DragEvent) => {
        depth.current = 0
        setOver(false)
        if (!hasFiles(e)) return
        const images = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
        if (e.defaultPrevented) return
        e.preventDefault()
        if (images.length) onFiles(images)
      },
    },
  }
}

/** Підказка поверх аркуша, поки над ним тягнуть фото */
export function DropHint({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div className="pointer-events-none absolute inset-2 z-10 grid animate-fade-in place-items-center rounded-[40px] bg-paper/85 shadow-[inset_0_0_0_3px_var(--color-growth)]">
      <span className="flex items-center gap-2 rounded-full bg-canvas px-5 py-3 text-[15px] font-extrabold text-white">
        Відпустіть, щоб додати фото
      </span>
    </div>
  )
}

/** Розгорнутий плеєр відео: великий, по центру вікна; Esc або клік повз — закрити */
export function VideoViewer({ url, onClose }: { url: string; onClose: () => void }) {
  const info = parseVideo(url)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  if (!info) return null
  return createPortal(
    <div
      role="dialog"
      aria-label="Плеєр відео"
      className="no-drag fixed inset-0 z-[90] flex animate-fade-in flex-col items-center justify-center gap-5 bg-canvas/90 p-8 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="aspect-video w-[min(100%,calc((100vh-160px)*16/9),1600px)] animate-modal-in overflow-hidden rounded-[28px] bg-canvas shadow-[0_24px_60px_-12px_rgba(0,0,0,0.9)]"
      >
        {info.file ? (
          <video src={url} controls autoPlay playsInline className="size-full" />
        ) : (
          <iframe
            src={info.embed(location.hostname || 'localhost')}
            title={info.label}
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="size-full border-0"
          />
        )}
      </div>
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <Button size="md" variant="steel" iconLeft="arrowUpRight" onClick={() => window.open(url, '_blank')}>
          Відкрити в {info.label === 'Відео' ? 'браузері' : info.label}
        </Button>
        <RoundButton icon="x" label="Закрити · Esc" onClick={onClose} />
      </div>
    </div>,
    document.body,
  )
}
