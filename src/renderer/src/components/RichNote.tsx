import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { liveQuery } from 'dexie'
import { cn, ContextMenu, Icon, useToast, type IconName, type MenuAction } from '@/design-system'
import { SENT_MARK, TASK_LINE } from '@/data/notes'
import { db, type FileRec } from '@/data/db'
import { addImages, downloadImage } from '@/data/files'
import { VideoViewer, Viewer } from './Attachments'
import { adjacentMediaPoint, MEDIA_DRAG_TYPE, mediaDropPoint, moveMedia, type MediaDropPoint } from './mediaMove'
import './noteMedia.css'
import './noteLists.css'
import {
  alignBlocks,
  alignOf,
  applyStyle,
  applyStyles,
  BASE_SIZE,
  blockOf,
  blocksIn,
  chipText,
  findAll,
  FONTS,
  fontStack,
  MARKS,
  ownStyles,
  makeChip,
  makeImage,
  makeLinkChip,
  inBrowser,
  inOwnWindow,
  makeVideo,
  parseVideo,
  plainText,
  sanitize,
  serialize,
  styleAt,
  TEXT_COLORS,
  toggleNumbering,
  URL_RE,
  videoCover,
  WEIGHTS,
  type Align,
  type ImgSize,
  type ImgWrap,
  type StyleProp,
  type Styles,
} from './richText'

export interface RichNoteHandle {
  /** Перетворити рядок під курсором на задачу */
  convertCurrent(): void
  focusStart(): void
  /** Вставити фото туди, де курсор (або в кінець) */
  insertImages(files: File[]): void
}

interface MenuState {
  x: number
  y: number
  range: Range | null
  chip: HTMLElement | null
  img?: HTMLElement | null
}

/**
 * Редактор нотатки з контекстним меню Karkas: шрифт, розмір, товщина,
 * нумерація, копіювати, вставити, «кнопка копіювання», видалити.
 */
/** Підсвітка діапазонів без зміни тексту (CSS Highlight API): справжнє виділення в браузері лише одне */
function highlight(name: string, ranges: Range[]) {
  const reg = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
  const H = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight
  if (!reg || !H) return
  if (ranges.length) reg.set(name, new H(...ranges))
  else reg.delete(name)
}

export const RichNote = forwardRef<RichNoteHandle, {
  html: string
  placeholder: string
  onChange: (html: string, text: string) => void
  onLineToTask: (title: string) => Promise<void>
  /** Редагування заблоковане: лише читати, виділяти й копіювати */
  readOnly?: boolean
  /** Куди прикріплювати фото (id нотатки чи задачі); без нього фото вставити не можна */
  imageOwner?: string
}>(function RichNote({ html, placeholder, onChange, onLineToTask, readOnly, imageOwner }, ref) {
  const editor = useRef<HTMLDivElement>(null)
  /** Шматки, додані з Ctrl: стиль із меню застосовується до всіх разом */
  const extra = useRef<Range[]>([])
  const paintExtra = () => highlight('kast-multi', extra.current)
  /** Пензлик формату: стилі, які переносимо на наступне виділення (до Esc чи «Готово») */
  const [painter, setPainter] = useState<Styles | null>(null)
  /** Пошук у нотатці (Ctrl+F): null — закритий */
  const [find, setFind] = useState<string | null>(null)
  const [hit, setHit] = useState({ i: 0, n: 0 })
  const found = useRef<Range[]>([])
  const findInput = useRef<HTMLInputElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const clearExtra = () => {
    if (!extra.current.length) return
    extra.current = []
    paintExtra()
  }
  const lastHtml = useRef<string | null>(null)
  const lastRange = useRef<Range | null>(null)
  const [empty, setEmpty] = useState(false)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [viewer, setViewer] = useState<{ files: FileRec[]; index: number } | null>(null)
  const [video, setVideo] = useState<string | null>(null)
  const mediaDrag = useRef<HTMLElement | null>(null)
  const [mediaMoving, setMediaMoving] = useState(false)
  const [dropMarker, setDropMarker] = useState<MediaDropPoint['marker'] | null>(null)
  const suppressMediaClickUntil = useRef(0)
  const toast = useToast()

  const el = () => editor.current!
  const isEmpty = (e: HTMLElement) => !plainText(e).trim() && !e.querySelector('.note-chip, .note-img')

  /** Підставити зображення у фото, яких ще не видно (після завантаження або коли файл приїхав із синхронізації) */
  const hydrate = useCallback(async () => {
    const e = editor.current
    if (!e) return
    for (const img of Array.from(e.querySelectorAll<HTMLImageElement>('.note-img[data-file] img:not([src])'))) {
      const id = (img.parentElement as HTMLElement).dataset.file!
      const file = await db.files.get(id)
      if (file && !file.deleted) img.src = file.data
    }
  }, [])

  const emit = useCallback(() => {
    const e = editor.current
    if (!e) return
    if (!e.firstChild || e.innerHTML === '<br>') e.innerHTML = '<div><br></div>'
    // Фокус і blur без змін не зберігаємо — інакше нотатка «оновлюється» і стрибає вгору списку
    const out = serialize(e)
    if (out === lastHtml.current) return
    setEmpty(isEmpty(e))
    lastHtml.current = out
    onChange(out, plainText(e))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChange])

  // Зовнішні зміни (синхронізація, швидкий запис) підхоплюємо, якщо ви зараз не друкуєте
  useLayoutEffect(() => {
    const e = editor.current
    if (!e || html === lastHtml.current) return
    if (lastHtml.current !== null && document.activeElement === e) return
    e.innerHTML = sanitize(html)
    lastHtml.current = serialize(e)
    setEmpty(isEmpty(e))
    hydrate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, hydrate])

  // Файли нотатки змінилися (додали, приїхали з іншого ПК) — показуємо зображення
  useEffect(() => {
    if (!imageOwner) return
    const sub = liveQuery(() => db.files.where('owner').equals(imageOwner).count()).subscribe(() => hydrate())
    return () => sub.unsubscribe()
  }, [imageOwner, hydrate])

  // Запам'ятовуємо місце курсора, щоб кнопка «Додати фото» вставляла саме туди
  useEffect(() => {
    const onSel = () => {
      const sel = getSelection()
      if (sel?.rangeCount && editor.current?.contains(sel.getRangeAt(0).startContainer)) lastRange.current = sel.getRangeAt(0).cloneRange()
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [])

  /** Фото — у текст, туди, де курсор: одне — половина ширини з обтіканням, кілька — по три в рядок */
  const insertImages = async (files: File[], at?: Range | null) => {
    if (!imageOwner || readOnly) return
    const ids = await addImages(imageOwner, files)
    if (!ids.length) return toast({ kind: 'error', title: 'Не вдалося додати фото', text: 'Підтримуються PNG, JPG, WebP, GIF' })
    let range = at ?? lastRange.current
    if (!range || !el().contains(range.startContainer)) {
      range = document.createRange()
      range.selectNodeContents(el().lastElementChild ?? el())
      range.collapse(false)
    }
    const many = ids.length > 1
    let last: Node | null = null
    for (const id of ids) {
      const box = makeImage(id, many ? 's' : 'm', many ? 'inline' : 'left')
      range.insertNode(box)
      range.setStartAfter(box)
      range.collapse(true)
      last = box
    }
    if (last) {
      const r = document.createRange()
      r.setStartAfter(last)
      r.collapse(true)
      el().focus()
      select(r)
    }
    await hydrate()
    emit()
  }

  /** Відео грає прямо в тексті; кнопка в куті розгортає великий плеєр */
  const playInline = (box: HTMLElement) => {
    const info = parseVideo(box.dataset.url ?? '')
    const frame = box.querySelector('.note-video-frame')
    if (!info || !frame) return
    // Twitch у застосунку — окремим вікном (вбудовувати в app:// він не дозволяє), Vimeo — у браузері
    if (inOwnWindow(info)) return window.kast.video.window(info.embed('player.twitch.tv'))
    if (inBrowser(info)) return void window.open(box.dataset.url, '_blank')
    const player = info.file
      ? `<video src="${encodeURI(box.dataset.url!)}" controls autoplay playsinline></video>`
      : `<iframe src="${info.embed(location.hostname || 'localhost')}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`
    frame.innerHTML = `${player}<button type="button" class="note-video-expand" aria-label="Розгорнути плеєр" title="Розгорнути"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg></button>`
    box.classList.add('is-playing')
  }
  /** Великий плеєр поверх усього; вбудований у тексті зупиняємо, щоб не грали двоє */
  const expandVideo = (box: HTMLElement) => {
    box.classList.remove('is-playing')
    videoCover(box)
    const info = parseVideo(box.dataset.url ?? '')
    if (info && inOwnWindow(info)) return window.kast.video.window(info.embed('player.twitch.tv'))
    if (info && inBrowser(info)) return void window.open(box.dataset.url, '_blank')
    setVideo(box.dataset.url ?? null)
  }

  /** Перегляд усіх фото нотатки в порядку тексту, починаючи з клікнутого */
  const openViewer = async (box: HTMLElement) => {
    const boxes = Array.from(el().querySelectorAll<HTMLElement>('.note-img[data-file]'))
    const files = (await Promise.all(boxes.map((b) => db.files.get(b.dataset.file!)))).filter((f): f is FileRec => !!f && !f.deleted)
    const index = Math.max(0, files.findIndex((f) => f.id === box.dataset.file))
    if (files.length) setViewer({ files, index })
  }

  const select = (range: Range) => {
    const sel = getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }
  const snapshot = () => el().innerHTML

  /** Знайти й підсвітити збіги; i — котрий із них поточний (по колу) */
  const runFind = (q: string, i = 0, reveal = true) => {
    found.current = findAll(el(), q)
    const n = found.current.length
    const k = n ? ((i % n) + n) % n : 0
    setHit({ i: k, n })
    highlight('kast-find', found.current)
    highlight('kast-find-now', n ? [found.current[k]] : [])
    if (n && reveal) revealRange(found.current[k])
  }
  /** Прокрутити так, щоб збіг було видно (спершу текст нотатки, потім сторінку) */
  const revealRange = (range: Range) => {
    const box = range.getBoundingClientRect()
    const s = scroller.current
    if (s) {
      const view = s.getBoundingClientRect()
      if (box.top < view.top || box.bottom > view.bottom) s.scrollTop += box.top - view.top - view.height / 3
    }
    const after = range.getBoundingClientRect()
    if (after.top < 0 || after.bottom > innerHeight) range.startContainer.parentElement?.scrollIntoView({ block: 'center' })
  }
  const openFind = () => {
    const sel = getSelection()
    const picked = sel?.rangeCount && el().contains(sel.anchorNode) ? sel.toString().trim() : ''
    const q = picked && !picked.includes('\n') && picked.length <= 60 ? picked : find ?? ''
    setFind(q)
    runFind(q, 0)
    requestAnimationFrame(() => findInput.current?.select())
  }
  /** Закрити пошук; з Esc — виділити поточний збіг, щоб одразу його правити */
  const closeFind = (pick: boolean) => {
    const cur = found.current[hit.i]
    setFind(null)
    found.current = []
    highlight('kast-find', [])
    highlight('kast-find-now', [])
    if (pick && cur && !cur.collapsed && !readOnly) {
      el().focus()
      select(cur)
    }
  }

  // Ctrl+F (і в українській розкладці): відкриває пошук у тій нотатці, яку зараз видно
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey || e.code !== 'KeyF') return
      const s = scroller.current
      if (!s) return
      const box = s.getBoundingClientRect()
      const y = (Math.max(box.top, 0) + Math.min(box.bottom, innerHeight)) / 2
      const top = document.elementFromPoint(box.left + box.width / 2, y)
      if (!top || !s.contains(top)) return
      e.preventDefault()
      openFind()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })
  // Підсвітки живуть у глобальному реєстрі — прибираємо, коли нотатку закрили
  useEffect(() => () => ['kast-multi', 'kast-find', 'kast-find-now'].forEach((name) => highlight(name, [])), [])

  /** Пензлик: застосувати збережений формат до щойно виділеного (і до шматків, доданих з Ctrl) */
  const paintSelection = () => {
    if (!painter) return
    const sel = getSelection()
    if (!sel?.rangeCount || sel.isCollapsed || !el().contains(sel.getRangeAt(0).commonAncestorContainer)) return
    const results = [...extra.current, sel.getRangeAt(0)].map((x) => applyStyles(el(), x, painter))
    clearExtra()
    select(results[results.length - 1])
    emit()
  }
  /** Після дії — коротке сповіщення; для змін тексту — зі «Скасувати» */
  /** quiet — рутинне форматування: без сповіщення (повторна дія або меню повертають як було) */
  const done = (title: string, before?: string, quiet = false) => {
    emit()
    if (quiet) return
    toast(
      before === undefined
        ? { kind: 'info', title }
        : {
            kind: 'info',
            title,
            action: {
              label: 'Скасувати',
              onClick: () => {
                el().innerHTML = before
                emit()
              },
            },
          },
    )
  }

  /* ───────── Рядок → задача ───────── */
  const convert = async (block: HTMLElement | null, addLine: boolean) => {
    if (!block || readOnly) return
    const raw = block.textContent ?? ''
    if (raw.startsWith(SENT_MARK)) return
    const title = raw.replace(TASK_LINE, '').replace(/^[-•*]\s+/, '').replace(/^\d+\.\s/, '').trim()
    if (!title) return
    await onLineToTask(title)
    block.removeAttribute('data-list')
    block.textContent = SENT_MARK + title
    if (addLine) {
      const next = document.createElement('div')
      next.appendChild(document.createElement('br'))
      block.after(next)
      const r = document.createRange()
      r.setStart(next, 0)
      r.collapse(true)
      select(r)
    }
    emit()
    toast({ title: 'Задачу додано у Вхідні' })
  }

  const currentBlock = () => {
    const sel = getSelection()
    if (!sel?.anchorNode || !el().contains(sel.anchorNode)) return null
    const node = sel.anchorNode === el() ? el().childNodes[sel.anchorOffset] ?? el().lastChild : sel.anchorNode
    return blockOf(el(), node)
  }

  useImperativeHandle(ref, () => ({
    insertImages: (files) => insertImages(files),
    convertCurrent: () => convert(currentBlock(), false),
    focusStart: () => {
      el().focus()
      const r = document.createRange()
      r.setStart(el(), 0)
      r.collapse(true)
      select(r)
    },
  }))

  /** Набране посилання стає чипом, щойно після нього ставлять пробіл чи Enter */
  const linkifyBeforeCaret = (addSpace: boolean) => {
    const sel = getSelection()
    if (!sel?.isCollapsed || sel.anchorNode?.nodeType !== Node.TEXT_NODE || !el().contains(sel.anchorNode)) return false
    const node = sel.anchorNode as Text
    const before = node.data.slice(0, sel.anchorOffset)
    const m = before.match(/(https?:\/\/[^\s<>"]+)$/i)
    if (!m) return false
    const r = document.createRange()
    r.setStart(node, sel.anchorOffset - m[1].length)
    r.setEnd(node, sel.anchorOffset)
    r.deleteContents()
    const chip = parseVideo(m[1]) ? makeVideo(m[1]) : makeLinkChip(m[1])
    r.insertNode(chip)
    const tail = document.createTextNode(addSpace ? '\u00a0' : '')
    chip.after(tail)
    const c = document.createRange()
    c.setStart(tail, tail.length)
    c.collapse(true)
    select(c)
    emit()
    return true
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && extra.current.length) return clearExtra()
    if (e.key === 'Escape' && painter) return setPainter(null)
    const handle = (e.target as HTMLElement).closest('.note-media-drag')
    if (handle && !readOnly && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      e.stopPropagation()
      const box = handle.closest<HTMLElement>('.note-img')
      if (box) moveAdjacent(box, e.key === 'ArrowUp' ? -1 : 1)
      return
    }
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      e.preventDefault()
      const sel = getSelection()
      const range = sel?.rangeCount ? sel.getRangeAt(0) : null
      const rect = range?.getBoundingClientRect()
      openMenu(rect?.left ?? 0, rect?.bottom ?? 0, null)
      return
    }
    if (readOnly || e.nativeEvent.isComposing) return
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === ' ' && listKey(' ')) return e.preventDefault()
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === 'Backspace' && listKey('Backspace')) return e.preventDefault()
    if (e.key === ' ' && linkifyBeforeCaret(true)) return e.preventDefault()
    if (e.key === 'Enter' && !e.ctrlKey) linkifyBeforeCaret(false)
    // Браузерні Ctrl+B/I/U вставляють <b>/<i>/<u>, які Kast не зберігає. Жирний — нашим стилем, решта вимкнена.
    if (e.ctrlKey && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
      e.preventDefault()
      const sel = getSelection()
      if (e.key.toLowerCase() !== 'b' || !sel?.rangeCount || sel.isCollapsed) return
      const range = sel.getRangeAt(0)
      const bold = styleAt(range).weight >= 700
      select(applyStyle(el(), range, 'font-weight', bold ? '500' : '800'))
      emit()
      return
    }
    if (e.key !== 'Enter' || e.shiftKey) return
    const block = currentBlock()
    if (!block) return
    const text = block.textContent ?? ''
    const sel = getSelection()!
    const atEnd = (() => {
      const r = document.createRange()
      r.selectNodeContents(block)
      r.setStart(sel.focusNode!, sel.focusOffset)
      return !r.toString()
    })()
    if (e.ctrlKey || (TASK_LINE.test(text) && text.replace(TASK_LINE, '').trim() && atEnd)) {
      e.preventDefault()
      convert(block, !e.ctrlKey)
      return
    }
    if (!e.metaKey && !e.altKey && listKey('Enter')) e.preventDefault()
  }

  /** Маркер — властивість рядка: Enter продовжує список, Backspace на початку знімає її. */
  const listKey = (key: ' ' | 'Enter' | 'Backspace') => {
    const sel = getSelection()
    if (!sel?.isCollapsed || !sel.rangeCount || !el().contains(sel.anchorNode)) return false
    const block = currentBlock()
    if (!block) return false
    const caret = sel.getRangeAt(0)
    // Після focusStart чи виділення всього тексту курсор може стояти між блоками редактора.
    if (caret.startContainer === el()) {
      const atEnd = caret.startOffset === el().childNodes.length
      caret.selectNodeContents(block)
      caret.collapse(!atEnd)
    }
    const before = document.createRange()
    before.selectNodeContents(block)
    before.setEnd(caret.startContainer, caret.startOffset)
    const hasContent = (node: ParentNode) => !!node.textContent?.trim() || !!node.querySelector('.note-chip, .note-img')
    if (key === ' ') {
      if (block.dataset.list === 'ol' || !/^1[.)]$/.test(before.toString()) || block.textContent !== before.toString() || block.querySelector('.note-chip, .note-img, div')) return false
      before.deleteContents()
      block.dataset.list = 'ol'
      if (!block.querySelector('br')) block.appendChild(document.createElement('br'))
      caret.setStart(block, 0)
    } else {
      if (block.dataset.list !== 'ol') return false
      if (key === 'Backspace') {
        if (before.toString() || before.cloneContents().querySelector('br, .note-chip, .note-img')) return false
        block.removeAttribute('data-list')
      } else if (!hasContent(block)) {
        block.removeAttribute('data-list')
      } else {
        const tail = document.createRange()
        tail.selectNodeContents(block)
        tail.setStart(caret.startContainer, caret.startOffset)
        const next = document.createElement('div')
        next.dataset.list = 'ol'
        next.style.textAlign = block.style.textAlign
        next.appendChild(tail.extractContents())
        if (!hasContent(next) && !next.querySelector('br')) {
          let empty: HTMLElement = next
          while (empty.lastElementChild?.tagName === 'SPAN' && (empty.lastElementChild as HTMLElement).contentEditable !== 'false') empty = empty.lastElementChild as HTMLElement
          empty.appendChild(document.createElement('br'))
        }
        if (!hasContent(block) && !block.querySelector('br')) block.appendChild(document.createElement('br'))
        block.after(next)
        // Курсор лишається всередині успадкованого стилю, а не перед порожнім спаном.
        let start: Node = next
        while (start.firstChild && (start.firstChild.nodeType === Node.TEXT_NODE || (start.firstChild instanceof HTMLElement && start.firstChild.tagName === 'SPAN' && start.firstChild.contentEditable !== 'false'))) start = start.firstChild
        caret.setStart(start, 0)
      }
    }
    caret.collapse(true)
    select(caret)
    emit()
    return true
  }

  // CSS-номери не потрапляють у Range.toString(), тому копіюємо їх разом із текстом.
  const onCopy = (e: React.ClipboardEvent) => {
    const sel = getSelection()
    if (!sel?.rangeCount || sel.isCollapsed) return
    const range = sel.getRangeAt(0)
    if (!el().contains(range.commonAncestorContainer)) return
    e.preventDefault()
    e.clipboardData.setData('text/plain', plainText(el(), range))
  }

  // Вставляємо лише текст, без чужої розмітки; скріншот — у фото, одне посилання — чипом
  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    if (readOnly) return
    const images = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'))
    if (images.length && imageOwner) {
      const sel = getSelection()
      return void insertImages(images, sel?.rangeCount ? sel.getRangeAt(0) : null)
    }
    const text = e.clipboardData.getData('text/plain')
    if (URL_RE.test(text.trim())) {
      const sel = getSelection()
      if (!sel?.rangeCount) return
      const range = sel.getRangeAt(0)
      range.deleteContents()
      const video = !!parseVideo(text.trim())
      const chip = video ? makeVideo(text.trim()) : makeLinkChip(text.trim())
      range.insertNode(chip)
      // \u041f\u0456\u0441\u043b\u044f \u0447\u0438\u043f\u0430 \u2014 \u043f\u0440\u043e\u0431\u0456\u043b, \u0449\u043e\u0431 \u043f\u0438\u0441\u0430\u0442\u0438 \u0434\u0430\u043b\u0456; \u043f\u0456\u0441\u043b\u044f \u0432\u0456\u0434\u0435\u043e \u2014 \u043d\u0456: \u0442\u043e\u0434\u0456 \u043d\u0430\u0441\u0442\u0443\u043f\u043d\u0435 \u0432\u0456\u0434\u0435\u043e \u0441\u0442\u0430\u043d\u0435 \u043f\u043e\u0440\u0443\u0447, \u0440\u0456\u0432\u043d\u043e \u043f\u043e \u0432\u0435\u0440\u0445\u0443
      const tail = document.createTextNode(video ? '' : '\u00a0')
      chip.after(tail)
      const c = document.createRange()
      c.setStart(tail, tail.length)
      c.collapse(true)
      select(c)
      return emit()
    }
    document.execCommand('insertText', false, text)
  }

  const clearMediaDrag = () => {
    mediaDrag.current?.classList.remove('is-moving')
    mediaDrag.current = null
    setMediaMoving(false)
    setDropMarker(null)
  }

  const moveAndNotify = (box: HTMLElement, destination: Range) => {
    const root = el()
    const original = document.createRange()
    original.setStartBefore(box)
    original.collapse(true)
    if (!moveMedia(root, box, destination)) return false
    emit()
    toast({
      kind: 'info',
      icon: 'menu',
      title: box.classList.contains('note-video') ? 'Відео переміщено' : 'Фото переміщено',
      action: {
        label: 'Скасувати',
        onClick: () => {
          // Повертаємо лише медіа: текст, дописаний після переміщення, не втрачається.
          if (!root.isConnected || root.getAttribute('aria-readonly') === 'true' || !root.contains(box) || !root.contains(original.startContainer)) return
          if (moveMedia(root, box, original.cloneRange())) emit()
        },
      },
    })
    return true
  }

  const onDragStart = (e: React.DragEvent) => {
    const box = (e.target as HTMLElement).closest<HTMLElement>('.note-img')
    if (!box || !el().contains(box)) return
    if (readOnly) return e.preventDefault()
    mediaDrag.current = box
    setMediaMoving(true)
    setMenu(null)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.clearData()
    e.dataTransfer.setData(MEDIA_DRAG_TYPE, 'move')
    e.dataTransfer.setDragImage(box, Math.min(30, box.clientWidth / 2), 20)
    box.classList.add('is-moving')
  }

  const onDragOver = (e: React.DragEvent) => {
    if (readOnly && (e.dataTransfer.types.includes(MEDIA_DRAG_TYPE) || e.dataTransfer.types.includes('Files'))) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'none'
      return
    }
    if (!e.dataTransfer.types.includes(MEDIA_DRAG_TYPE)) {
      if (e.dataTransfer.types.includes('Files')) e.preventDefault()
      return
    }
    e.preventDefault()
    if (readOnly || !mediaDrag.current) {
      e.dataTransfer.dropEffect = 'none'
      return
    }
    e.dataTransfer.dropEffect = 'move'
    const point = mediaDropPoint(el(), mediaDrag.current, e.target, e.clientX, e.clientY)
    setDropMarker(point?.marker ?? null)
    const scroll = e.currentTarget as HTMLElement
    const rect = scroll.getBoundingClientRect()
    if (e.clientY < rect.top + 40) scroll.scrollTop -= 14
    else if (e.clientY > rect.bottom - 40) scroll.scrollTop += 14
  }

  const moveAdjacent = (box: HTMLElement, direction: -1 | 1) => {
    const destination = adjacentMediaPoint(el(), box, direction)
    if (!destination) return
    if (!moveAndNotify(box, destination)) return
    box.querySelector<HTMLButtonElement>('.note-media-drag')?.focus()
    box.scrollIntoView({ block: 'nearest' })
  }

  // Медіа переноситься як атомарний вузол; чужий текст — лише без розмітки.
  const onDrop = (e: React.DragEvent) => {
    if (readOnly) return e.preventDefault()
    if (e.dataTransfer.types.includes(MEDIA_DRAG_TYPE)) {
      e.preventDefault()
      const moving = mediaDrag.current
      // Не копіюємо внутрішній drag у іншу нотатку: фото належить своїй нотатці.
      if (!moving) return
      const point = mediaDropPoint(el(), moving, e.target, e.clientX, e.clientY)
      clearMediaDrag()
      suppressMediaClickUntil.current = performance.now() + 250
      if (!point || !moveAndNotify(moving, point.range)) return
      const range = document.createRange()
      range.setStartAfter(moving)
      range.collapse(true)
      lastRange.current = range.cloneRange()
      return
    }
    const images = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    if (images.length && imageOwner) {
      e.preventDefault()
      // Фото лягає туди, куди його кинули
      return void insertImages(images, mediaDropPoint(el(), null, e.target, e.clientX, e.clientY)?.range)
    }
    const text = e.dataTransfer.getData('text/plain')
    if (!text) return
    e.preventDefault()
    const range = mediaDropPoint(el(), null, e.target, e.clientX, e.clientY)?.range
    if (range) select(range)
    document.execCommand('insertText', false, text)
  }

  // Кнопка копіювання в чипі
  const onClick = async (e: React.MouseEvent) => {
    // Клік по фото — перегляд у повному розмірі
    const target = e.target as HTMLElement
    const handle = target.closest('.note-media-drag')
    if (handle || performance.now() < suppressMediaClickUntil.current) {
      e.preventDefault()
      if (handle && !readOnly && matchMedia('(hover: none), (pointer: coarse)').matches) {
        const media = handle.closest('.note-img') as HTMLElement | null
        if (media) openMenu(e.clientX, e.clientY, null, media)
      }
      return
    }
    const vid = target.closest('.note-video') as HTMLElement | null
    if (vid) {
      e.preventDefault()
      if (target.closest('.note-video-expand')) return expandVideo(vid)
      if (!vid.classList.contains('is-playing')) playInline(vid)
      return
    }
    const box = target.closest('.note-img') as HTMLElement | null
    if (box) return void openViewer(box)
    // Посилання відкривається в браузері кліком по чипу
    const link = (e.target as HTMLElement).closest('.note-link') as HTMLElement | null
    if (link?.dataset.url) {
      e.preventDefault()
      return void window.open(link.dataset.url, '_blank')
    }
    const btn = (e.target as HTMLElement).closest('.note-chip-copy')
    if (!btn) return
    e.preventDefault()
    const chip = btn.closest('.note-chip') as HTMLElement
    await copy(chipText(chip), true)
    chip.classList.add('is-copied')
    setTimeout(() => chip.classList.remove('is-copied'), 1200)
  }

  /* ───────── Меню ───────── */
  const openMenu = (x: number, y: number, chip: HTMLElement | null, img: HTMLElement | null = null) => {
    const sel = getSelection()
    const range = sel?.rangeCount && el().contains(sel.getRangeAt(0).commonAncestorContainer) ? sel.getRangeAt(0).cloneRange() : null
    setMenu({ x, y, range, chip, img })
  }

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const target = e.target as HTMLElement
    const img = target.closest('.note-img') as HTMLElement | null
    if (img) return openMenu(e.clientX, e.clientY, null, img)
    openMenu(e.clientX, e.clientY, target.closest('.note-chip') as HTMLElement | null)
  }

  /** Рядки, яких стосується вирівнювання: рядок фото, виділені рядки або рядок із курсором */
  const alignTargets = (): HTMLElement[] => {
    if (menu?.img) return [blockOf(el(), menu.img)].filter((b): b is HTMLElement => !!b)
    if (menu?.range) return blocksIn(el(), menu.range)
    return [currentBlock()].filter((b): b is HTMLElement => !!b)
  }
  const align = (value: Align) => {
    alignBlocks(alignTargets(), value)
    emit()
    setMenu((m) => (m ? { ...m } : m))
  }

  /** Фото прибирається з тексту (зі «Скасувати») */
  const removeImageBox = (box: HTMLElement) => {
    const before = snapshot()
    const title = box.classList.contains('note-video') ? 'Відео прибрано' : 'Фото прибрано'
    box.remove()
    done(title, before)
  }
  /** Розмір чи обтікання фото змінюється одразу, меню лишається відкритим */
  const restyleImage = (box: HTMLElement, patch: { size?: ImgSize; wrap?: ImgWrap }) => {
    if (patch.size) box.dataset.size = patch.size
    if (patch.wrap) box.dataset.wrap = patch.wrap
    emit()
    setMenu((m) => (m ? { ...m } : m))
  }

  const close = useCallback(() => setMenu(null), [])

  const copy = async (text: string, quiet = false) => {
    try {
      await navigator.clipboard.writeText(text)
      if (!quiet) toast({ title: 'Скопійовано' })
    } catch {
      toast({ kind: 'error', title: 'Не вдалося скопіювати', text: 'Виділіть текст і натисніть Ctrl+C' })
    }
  }

  const hasText = (!!menu?.range && !menu.range.collapsed && !!menu.range.toString().trim()) || extra.current.length > 0

  /** Усі виділені шматки: додані з Ctrl і поточне виділення */
  const allRanges = () =>
    [...extra.current, ...(menu?.range && !menu.range.collapsed ? [menu.range] : [])].filter((x) => !x.collapsed && x.toString().trim())

  const restyle = (styles: Styles) => {
    const ranges = allRanges()
    if (!ranges.length) return
    // Діапазони «живі»: після зміни одного решта підлаштовуються під новий DOM
    const results = ranges.map((x) => applyStyles(el(), x, styles))
    const last = results[results.length - 1]
    extra.current = results.slice(0, -1)
    paintExtra()
    select(last)
    setMenu((m) => (m ? { ...m, range: last.cloneRange() } : m))
    emit()
  }

  const copyItem: MenuAction = menu?.chip
    ? { label: menu.chip.classList.contains('note-link') ? 'Копіювати посилання' : 'Копіювати', icon: 'copy', onSelect: () => (copy(chipText(menu.chip!)), close()) }
    : {
        label: 'Копіювати',
        icon: 'copy',
        disabled: !hasText,
        onSelect: () => (copy(allRanges().map((x) => plainText(el(), x)).join('\n')), clearExtra(), close()),
      }

  // Заблокована нотатка: з меню лишається тільки копіювання
  const isLink = !!menu?.chip?.classList.contains('note-link')
  const openItem: MenuAction = { label: 'Відкрити', icon: 'arrowUpRight', onSelect: () => (window.open(chipText(menu!.chip!), '_blank'), close()) }
  const imgBox = menu?.img ?? null
  const imageItems: MenuAction[] = imgBox
    ? [
        { label: 'Відкрити', icon: 'image', onSelect: () => (close(), openViewer(imgBox)) },
        {
          label: 'Завантажити',
          icon: 'download',
          onSelect: async () => {
            close()
            const file = await db.files.get(imgBox.dataset.file!)
            if (file) downloadImage(file)
          },
        },
        ...(readOnly ? [] : [{ label: 'Прибрати з нотатки', icon: 'trashLines', tone: 'danger', onSelect: () => (close(), removeImageBox(imgBox)) } as MenuAction]),
      ]
    : []
  const isVideo = !!imgBox?.classList.contains('note-video')
  const moveItems: MenuAction[] = imgBox && !readOnly
    ? [
        { label: 'Перемістити вище', icon: 'arrowUp', disabled: !adjacentMediaPoint(el(), imgBox, -1), onSelect: () => (close(), moveAdjacent(imgBox, -1)) },
        { label: 'Перемістити нижче', icon: 'arrowDown', disabled: !adjacentMediaPoint(el(), imgBox, 1), onSelect: () => (close(), moveAdjacent(imgBox, 1)) },
      ]
    : []
  const videoItems: MenuAction[] = isVideo
    ? [
        { label: 'Розгорнути плеєр', icon: 'play', onSelect: () => (close(), expandVideo(imgBox!)) },
        { label: 'Відкрити в браузері', icon: 'arrowUpRight', onSelect: () => (close(), window.open(imgBox!.dataset.url, '_blank')) },
        { label: 'Копіювати посилання', icon: 'copy', onSelect: () => (copy(imgBox!.dataset.url ?? ''), close()) },
        ...(readOnly
          ? []
          : [
              {
                label: 'Показати як посилання',
                icon: 'link',
                onSelect: () => {
                  const before = snapshot()
                  imgBox!.replaceWith(makeLinkChip(imgBox!.dataset.url ?? ''))
                  close()
                  done('Відео стало посиланням', before, true)
                },
              } as MenuAction,
              { label: 'Прибрати з нотатки', icon: 'trashLines', tone: 'danger', onSelect: () => (close(), removeImageBox(imgBox!)) } as MenuAction,
            ]),
      ]
    : []
  const items: MenuAction[] = isVideo
    ? [...videoItems, ...moveItems]
    : imgBox
    ? [...imageItems, ...moveItems]
    : readOnly
    ? isLink
      ? [openItem, copyItem]
      : [copyItem]
    : menu?.chip
    ? [
        ...(isLink ? [openItem] : []),
        ...(isLink && parseVideo(chipText(menu!.chip!))
          ? [
              {
                label: 'Показати як відео',
                icon: 'play',
                onSelect: () => {
                  const before = snapshot()
                  menu!.chip!.replaceWith(makeVideo(chipText(menu!.chip!)))
                  close()
                  done('Посилання стало відео', before, true)
                },
              } as MenuAction,
            ]
          : []),
        copyItem,
        {
          label: 'Звичайний текст',
          icon: 'removeFormat',
          onSelect: () => {
            const before = snapshot()
            menu.chip!.replaceWith(document.createTextNode(chipText(menu.chip!)))
            close()
            done('Кнопку прибрано', before, true)
          },
        },
        {
          label: 'Видалити',
          icon: 'trashLines',
          tone: 'danger',
          onSelect: () => {
            const before = snapshot()
            menu.chip!.remove()
            close()
            done('Видалено', before)
          },
        },
      ]
    : [
        {
          label: 'Нумерація',
          icon: 'listOrdered',
          onSelect: () => {
            const range = menu?.range ?? null
            const blocks = range ? blocksIn(el(), range) : [currentBlock()].filter((b): b is HTMLElement => !!b)
            if (!blocks.length) return close()
            const before = snapshot()
            const on = toggleNumbering(blocks)
            close()
            done(on ? 'Нумерацію додано' : 'Нумерацію прибрано', before, true)
          },
        },
        {
          label: 'Пензлик формату',
          icon: 'brush',
          onSelect: () => {
            const range = menu?.range ?? lastRange.current
            if (range) setPainter(ownStyles(el(), range))
            clearExtra()
            close()
          },
        },
        copyItem,
        {
          label: 'Вставити',
          icon: 'clipboardPaste',
          onSelect: async () => {
            const range = menu?.range
            close()
            try {
              const text = await navigator.clipboard.readText()
              if (!text) return
              el().focus()
              if (range) select(range)
              const before = snapshot()
              document.execCommand('insertText', false, text)
              done('Вставлено', before, true)
            } catch {
              toast({ kind: 'error', title: 'Не вдалося вставити', text: 'Скористайтеся Ctrl+V у нотатці' })
            }
          },
        },
        {
          label: 'Кнопка копіювання',
          icon: 'copyPlus',
          tone: 'growth',
          disabled: !hasText,
          onSelect: () => {
            const range = menu!.range!
            const text = range.toString().replace(/\s+/g, ' ').trim()
            const before = snapshot()
            range.deleteContents()
            const chip = makeChip(text)
            range.insertNode(chip)
            const space = document.createTextNode('\u00a0')
            chip.after(space)
            const r = document.createRange()
            r.setStartAfter(space)
            r.collapse(true)
            select(r)
            close()
            done('Кнопку додано', before, true)
          },
        },
        {
          label: 'Видалити',
          icon: 'trashLines',
          tone: 'danger',
          disabled: !hasText,
          onSelect: () => {
            const before = snapshot()
            el().focus()
            for (const x of allRanges()) {
              select(x)
              document.execCommand('delete')
            }
            clearExtra()
            close()
            done('Видалено', before)
          },
        },
      ]

  return (
    <>
      {find !== null && (
        <div className="mb-3 flex h-11 shrink-0 items-center gap-1 rounded-[22px] bg-canvas p-1 pl-4 text-white">
          <Icon name="search" size={16} className="shrink-0 text-muted" />
          <input
            ref={findInput}
            value={find}
            onChange={(e) => {
              setFind(e.target.value)
              runFind(e.target.value, 0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                runFind(find, hit.i + (e.shiftKey ? -1 : 1))
              } else if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                closeFind(true)
              }
            }}
            placeholder="Пошук у нотатці"
            aria-label="Пошук у нотатці"
            className="h-full min-w-0 flex-1 bg-transparent px-2 text-[15px] font-semibold caret-growth outline-none placeholder:text-muted"
          />
          {find.trim() && (
            <span aria-live="polite" className="shrink-0 px-1.5 text-[13px] font-bold whitespace-nowrap text-muted tabular-nums">
              {hit.n ? `${hit.i + 1} з ${hit.n}` : 'Немає'}
            </span>
          )}
          <button
            type="button"
            aria-label="Попередній збіг"
            data-tip="Попередній · Shift+Enter"
            disabled={!hit.n}
            onClick={() => runFind(find, hit.i - 1)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-steel disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Icon name="arrowUp" size={17} />
          </button>
          <button
            type="button"
            aria-label="Наступний збіг"
            data-tip="Наступний · Enter"
            disabled={!hit.n}
            onClick={() => runFind(find, hit.i + 1)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-steel disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Icon name="arrowDown" size={17} />
          </button>
          <button
            type="button"
            aria-label="Закрити пошук"
            onClick={() => closeFind(false)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-paper text-ink"
          >
            <Icon name="x" size={16} strokeWidth={2.4} />
          </button>
        </div>
      )}
      {painter && (
        <div className="mb-3 flex h-11 shrink-0 items-center gap-2.5 rounded-[22px] bg-canvas p-1 pl-4 text-white">
          <Icon name="brush" size={17} className="shrink-0 text-growth" />
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">Пензлик: виділіть текст, щоб перенести формат</span>
          <button type="button" onClick={() => setPainter(null)} className="h-9 shrink-0 rounded-full bg-paper px-4 text-[13px] font-bold text-ink">
            Готово
          </button>
        </div>
      )}
      {/* Текст і галерея фото гортаються разом; клік у порожнє місце під текстом ставить курсор у кінець */}
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto"
        onMouseDown={(e) => {
          if (e.target !== e.currentTarget || readOnly) return
          e.preventDefault()
          el().focus()
          const r = document.createRange()
          r.selectNodeContents(el())
          r.collapse(false)
          select(r)
        }}
        onDragOver={onDragOver}
        onDragLeave={(e) => {
          if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return
          setDropMarker(null)
        }}
        onDragEnd={() => {
          suppressMediaClickUntil.current = performance.now() + 250
          clearMediaDrag()
        }}
        onDrop={(e) => e.target === e.currentTarget && onDrop(e)}
      >
        <div
          ref={editor}
          contentEditable={!readOnly}
          suppressContentEditableWarning
          spellCheck
          role="textbox"
          aria-multiline
          aria-label="Текст нотатки"
          aria-readonly={readOnly || undefined}
          data-media-moving={mediaMoving || undefined}
          data-painting={painter ? '' : undefined}
          data-placeholder={placeholder}
          data-empty={(empty && !readOnly) || undefined}
          onInput={() => {
            clearExtra()
            emit()
            if (find !== null) runFind(find, hit.i, false)
          }}
          onMouseUp={() => painter && requestAnimationFrame(paintSelection)}
          onMouseDown={(e) => {
            if (e.button !== 0) return
            // Ctrl + виділення додає ще один шматок (як у Word); звичайний клік — починає наново
            if (e.ctrlKey || e.metaKey) {
              const sel = getSelection()
              if (sel?.rangeCount && !sel.isCollapsed && el().contains(sel.getRangeAt(0).commonAncestorContainer)) {
                extra.current = [...extra.current, sel.getRangeAt(0).cloneRange()]
                paintExtra()
              }
            } else clearExtra()
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onCopy={onCopy}
          onDragStart={onDragStart}
          onDrop={onDrop}
          onClick={onClick}
          onContextMenu={onContextMenu}
          onBlur={emit}
          className="note-editor min-h-full w-full text-[17px] leading-[1.6] font-medium text-ink outline-none"
        />
      </div>
      {dropMarker && <span aria-hidden className="note-media-drop-marker" style={dropMarker} />}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={isVideo ? 'Дії з відео' : imgBox ? 'Дії з фото' : menu.chip ? (isLink ? 'Дії з посиланням' : 'Дії з кнопкою копіювання') : 'Дії з виділеним'}
          items={items}
          onClose={close}
          header={
            readOnly || menu.chip ? undefined : (
              <div className="flex flex-col gap-2">
                {imgBox ? <ImageBar box={imgBox} onChange={(patch) => restyleImage(imgBox, patch)} /> : hasText && <FormatBar range={menu.range!} own={ownStyles(el(), menu.range!)} onStyle={(prop, value) => restyle({ [prop]: value })} />}
                <AlignBar value={alignOf(alignTargets()[0] ?? null)} onChange={align} />
              </div>
            )
          }
        />
      )}
      {video && <VideoViewer url={video} onClose={() => setVideo(null)} />}
      {viewer && (
        <Viewer
          images={viewer.files}
          index={viewer.index}
          onIndex={(index) => setViewer((v) => (v ? { ...v, index } : v))}
          onClose={() => setViewer(null)}
          onRemove={
            readOnly
              ? undefined
              : (file) => {
                  setViewer(null)
                  const box = el().querySelector<HTMLElement>(`.note-img[data-file="${file.id}"]`)
                  if (box) removeImageBox(box)
                }
          }
        />
      )}
    </>
  )
})

const ALIGN_OPTIONS: { value: Align; label: string; icon: 'alignLeft' | 'alignCenter' | 'alignRight' }[] = [
  { value: 'left', label: 'Ліворуч', icon: 'alignLeft' },
  { value: 'center', label: 'По центру', icon: 'alignCenter' },
  { value: 'right', label: 'Праворуч', icon: 'alignRight' },
]

/** Вирівнювання рядка (чи рядка з фото): ліворуч, по центру, праворуч */
function AlignBar({ value, onChange }: { value: Align; onChange: (v: Align) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="px-1 text-[12px] font-bold text-muted">Вирівнювання</span>
      <div role="group" aria-label="Вирівнювання" className="flex gap-0.5 rounded-[19px] bg-tile p-[3px]">
        {ALIGN_OPTIONS.map((o) => (
          <button
            key={o.value}
            aria-pressed={o.value === value}
            aria-label={o.label}
            data-tip={o.label}
            onClick={() => onChange(o.value)}
            className={cn('grid h-[34px] flex-1 place-items-center rounded-2xl', o.value === value ? 'bg-paper text-ink' : 'text-white hover:bg-steel')}
          >
            <Icon name={o.icon} size={17} />
          </button>
        ))}
      </div>
    </div>
  )
}

const IMG_SIZES: { value: ImgSize; label: string }[] = [
  { value: 's', label: 'Малий' },
  { value: 'm', label: 'Середній' },
  { value: 'l', label: 'Великий' },
]
const IMG_WRAPS: { value: ImgWrap; label: string; icon: IconName }[] = [
  { value: 'left', label: 'Ліворуч — текст праворуч', icon: 'wrapLeft' },
  { value: 'right', label: 'Праворуч — текст ліворуч', icon: 'wrapRight' },
  { value: 'inline', label: 'У рядку з текстом', icon: 'wrapInline' },
  { value: 'block', label: 'Окремим блоком', icon: 'wrapBlock' },
]

/** Верх меню фото: розмір і обтікання текстом, як у Word */
function ImageBar({ box, onChange }: { box: HTMLElement; onChange: (patch: { size?: ImgSize; wrap?: ImgWrap }) => void }) {
  const [, redraw] = useState(0)
  const row = <T extends string>(label: string, options: { value: T; label: string; icon?: IconName }[], cur: string, set: (v: T) => void) => (
    <div className="flex flex-col gap-1">
      <span className="px-1 text-[12px] font-bold text-muted">{label}</span>
      <div role="group" aria-label={label} className="flex gap-0.5 rounded-[19px] bg-tile p-[3px]">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-label={o.label}
            title={o.label}
            aria-pressed={o.value === cur}
            onClick={() => (set(o.value), redraw((n) => n + 1))}
            className={cn('grid h-[34px] min-w-0 flex-1 place-items-center rounded-2xl px-2 text-[13px] font-bold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-growth', o.value === cur ? 'bg-paper text-ink' : 'text-white hover:bg-steel')}
          >
            {o.icon ? <Icon name={o.icon} size={21} /> : o.label}
          </button>
        ))}
      </div>
    </div>
  )
  return (
    <div className="flex flex-col gap-2">
      {row('Розмір', IMG_SIZES, box.dataset.size ?? 'm', (size) => onChange({ size }))}
      {row('Обтікання текстом', IMG_WRAPS, box.dataset.wrap ?? 'left', (wrap) => onChange({ wrap }))}
    </div>
  )
}

/** Ряд кольорів: «без кольору» і палітра; кружечки з обідком, щоб темні кольори було видно на темному меню */
function Swatches({ label, options, value, onPick }: { label: string; options: { value: string; label: string }[]; value: string; onPick: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="px-1 text-[12px] font-bold text-muted">{label}</span>
      <div role="group" aria-label={label} className="flex gap-0.5 rounded-[19px] bg-tile p-[3px]">
        <button
          type="button"
          aria-label="Без кольору"
          data-tip="Без кольору"
          aria-pressed={!value}
          onClick={() => onPick('')}
          className={cn('grid h-[34px] flex-1 place-items-center rounded-2xl', !value ? 'bg-paper text-ink' : 'text-white hover:bg-steel')}
        >
          <Icon name="x" size={15} strokeWidth={2.6} />
        </button>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-label={o.label}
            data-tip={o.label}
            aria-pressed={o.value === value}
            onClick={() => onPick(o.value)}
            className={cn('grid h-[34px] flex-1 place-items-center rounded-2xl', o.value === value ? 'bg-paper' : 'hover:bg-steel')}
          >
            {/* Маркер напівпрозорий — показуємо, яким він буде на папері нотатки */}
            <span className="note-swatch" style={{ background: `linear-gradient(${o.value}, ${o.value}), var(--color-paper)` }} />
          </button>
        ))}
      </div>
    </div>
  )
}

/** Верх меню: шрифт (зі списком і пошуком), розмір, товщина, колір і маркер — як у Karkas */
function FormatBar({ range, own, onStyle }: { range: Range; own: Record<StyleProp, string>; onStyle: (prop: StyleProp, value: string) => void }) {
  const cur = styleAt(range)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const fonts = FONTS.filter((f) => f.toLowerCase().includes(q.trim().toLowerCase()))
  const size = (d: number) => onStyle('font-size', `${Math.max(8, Math.min(96, cur.size + d))}px`)
  const weight = WEIGHTS.reduce((a, b) => (Math.abs(b.value - cur.weight) < Math.abs(a.value - cur.weight) ? b : a)).value

  useEffect(() => setQ(''), [open])

  return (
    <div className="relative flex flex-col gap-1.5">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Шрифт"
        className="flex h-10 items-center justify-between gap-2 rounded-[19px] bg-tile pr-3 pl-4 text-[15px] font-semibold"
        style={{ fontFamily: fontStack(cur.font) }}
      >
        <span className="truncate">{cur.font}</span>
        <Icon name="chevronDown" size={12} strokeWidth={2.6} className={cn('shrink-0 opacity-70 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-[46px] z-10 flex flex-col gap-1 rounded-[18px] bg-tile p-1.5 shadow-menu">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Пошук шрифту"
            aria-label="Пошук шрифту"
            className="h-9 rounded-[14px] bg-canvas px-3 text-[14px] font-semibold text-white caret-growth outline-none placeholder:text-muted"
          />
          <div role="listbox" aria-label="Шрифти" className="flex h-[236px] flex-col gap-0.5 overflow-y-auto overscroll-contain">
            {fonts.map((f) => (
              <button
                key={f}
                role="option"
                aria-selected={f === cur.font}
                onClick={() => {
                  onStyle('font-family', fontStack(f))
                  setOpen(false)
                }}
                className={cn(
                  'h-9 shrink-0 truncate rounded-[12px] px-3 text-left text-[15px]',
                  f === cur.font ? 'bg-paper text-ink' : 'text-white hover:bg-steel',
                )}
                style={{ fontFamily: fontStack(f) }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-1.5">
        <div role="group" aria-label="Розмір шрифту" className="flex items-center gap-0.5 rounded-[19px] bg-tile p-[3px]">
          <button onClick={() => size(-1)} aria-label="Менше" className="h-[34px] w-[34px] rounded-2xl text-[18px] font-bold hover:bg-steel">
            −
          </button>
          <span aria-live="polite" className="min-w-[26px] text-center text-[14px] font-extrabold tabular-nums">
            {cur.size || BASE_SIZE}
          </span>
          <button onClick={() => size(1)} aria-label="Більше" className="h-[34px] w-[34px] rounded-2xl text-[18px] font-bold hover:bg-steel">
            +
          </button>
        </div>
        <div role="group" aria-label="Товщина" className="flex flex-1 gap-0.5 rounded-[19px] bg-tile p-[3px]">
          {WEIGHTS.map((w) => (
            <button
              key={w.value}
              aria-pressed={w.value === weight}
              aria-label={w.label}
              onClick={() => onStyle('font-weight', String(w.value))}
              className={cn('h-[34px] flex-1 rounded-2xl text-[15px]', w.value === weight ? 'bg-paper text-ink' : 'text-white hover:bg-steel')}
              style={{ fontWeight: w.value }}
            >
              Аа
            </button>
          ))}
        </div>
      </div>
      <Swatches label="Колір тексту" options={TEXT_COLORS} value={own.color} onPick={(v) => onStyle('color', v)} />
      <Swatches label="Маркер" options={MARKS} value={own['background-color']} onPick={(v) => onStyle('background-color', v)} />
    </div>
  )
}
