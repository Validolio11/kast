/*
 * Форматований текст нотатки: рядки — <div>, стилі — <span style> (шрифт, розмір, товщина),
 * «кнопка копіювання» — нередагований чип. Зберігаємо HTML для вигляду й простий текст для пошуку,
 * заголовків і синхронізації.
 */

export const FONTS = [
  'Inter', 'Segoe UI', 'Segoe UI Variable', 'Arial', 'Bahnschrift', 'Calibri', 'Cambria', 'Candara', 'Comic Sans MS', 'Consolas',
  'Constantia', 'Corbel', 'Courier New', 'Franklin Gothic Medium', 'Gabriola', 'Georgia', 'Impact', 'Lucida Console', 'Lucida Sans Unicode',
  'Palatino Linotype', 'Segoe Print', 'Segoe Script', 'Sitka Text', 'Sylfaen', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
]
export const WEIGHTS = [
  { value: 300, label: 'Тонкий' },
  { value: 500, label: 'Звичайний' },
  { value: 800, label: 'Жирний' },
]
export const BASE_SIZE = 17

const STYLE_PROPS = ['font-family', 'font-size', 'font-weight'] as const
const NUMBER_PREFIX = /^\d+\.\s/

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const COPY_ICON =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>'

const LINK_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>'
const OPEN_ICON =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>'

/** Посилання цілком (http/https без пробілів) */
export const URL_RE = /^https?:\/\/[^\s<>"]+$/i

/** Чип-посилання в стилі «кнопки копіювання»: іконка, коротка адреса, кругла кнопка «Відкрити» */
export function makeLinkChip(url: string) {
  const chip = document.createElement('span')
  chip.className = 'note-chip note-link'
  chip.contentEditable = 'false'
  chip.dataset.url = url
  const label = url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')
  chip.innerHTML = `<span class="note-link-icon">${LINK_ICON}</span><span class="note-chip-text">${esc(label)}</span><button type="button" class="note-chip-copy note-chip-open" tabindex="-1" aria-label="Відкрити посилання">${OPEN_ICON}</button>`
  chip.title = url
  return chip
}

export type Align = 'left' | 'center' | 'right'
const ALIGNS: Align[] = ['center', 'right']

/** Вирівняти рядки: ліворуч — прибрати стиль, по центру чи праворуч — записати */
export function alignBlocks(blocks: HTMLElement[], align: Align) {
  for (const b of blocks) b.style.textAlign = align === 'left' ? '' : align
}

/** Поточне вирівнювання рядка */
export const alignOf = (block: HTMLElement | null): Align => (block?.style.textAlign === 'center' || block?.style.textAlign === 'right' ? block.style.textAlign : 'left')

export type ImgSize = 's' | 'm' | 'l'
export type ImgWrap = 'left' | 'right' | 'inline' | 'block'
const SIZES: ImgSize[] = ['s', 'm', 'l']
const WRAPS: ImgWrap[] = ['left', 'right', 'inline', 'block']
const FILE_ID = /^[0-9a-f-]{36}$/i

/** Окрема ручка лишається доступною навіть коли всередині відео вже працює iframe. */
function mediaDragHandle() {
  return '<button type="button" class="note-media-drag" draggable="true" aria-label="Перемістити медіа" title="Перетягніть, щоб перемістити · Alt+↑ / Alt+↓"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg></button>'
}

/**
 * Фото всередині тексту, як у Word: розмір (третина / половина / уся ширина) і обтікання.
 * У HTML зберігаємо лише id файлу — саме зображення підставляється з бази при показі.
 */
export function makeImage(id: string, size: ImgSize = 'm', wrap: ImgWrap = 'left') {
  const box = document.createElement('span')
  box.className = 'note-img'
  box.contentEditable = 'false'
  box.dataset.file = id
  box.dataset.size = size
  box.dataset.wrap = wrap
  box.draggable = true
  box.innerHTML = '<img alt="" draggable="false">' + mediaDragHandle()
  return box
}

/** HTML для збереження: без вбудованих зображень і плеєрів (лише посилання на файли й відео) */
export function serialize(editor: HTMLElement) {
  const copy = editor.cloneNode(true) as HTMLElement
  copy.querySelectorAll('.note-media-drag').forEach((handle) => handle.remove())
  copy.querySelectorAll<HTMLElement>('.note-img').forEach((box) => {
    box.removeAttribute('draggable')
    box.classList.remove('is-moving', 'is-playing')
  })
  copy.querySelectorAll('.note-video').forEach((v) => (v.innerHTML = ''))
  copy.querySelectorAll('.note-img img').forEach((img) => img.removeAttribute('src'))
  return copy.innerHTML
}

/* ───────── Відео за посиланням ───────── */

export interface VideoInfo {
  label: string
  /** Адреса вбудованого плеєра; host — домен сторінки (його вимагає Twitch) */
  embed: (host: string) => string
  thumb?: string
  /** Пряме посилання на файл — грає звичайний <video> */
  file?: boolean
  /** Плеєр не вбудовується в застосунок (Twitch) — відкривається окремим вікном */
  window?: boolean
  /** Плеєр не працює в Electron узагалі (Vimeo) — у застосунку відкривається в браузері */
  browser?: boolean
}

const inApp = () => location.protocol === 'app:' && !!window.kast
/** У застосунку (app://) Twitch грає окремим вікном; у браузері — як усі, в тексті */
export const inOwnWindow = (info: VideoInfo) => !!info.window && inApp()
/** У застосунку Vimeo відкривається у звичайному браузері (свій плеєр він Electron не віддає) */
export const inBrowser = (info: VideoInfo) => !!info.browser && inApp()

/** YouTube (зокрема Shorts і live), Vimeo, Twitch (канал, запис, кліп) і прямі .mp4/.webm/.mov */
export function parseVideo(raw: string): VideoInfo | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  const host = u.hostname.replace(/^(www\.|m\.)/, '')
  const path = u.pathname.split('/').filter(Boolean)
  const yt = (id: string | null | undefined): VideoInfo | null =>
    id && /^[\w-]{11}$/.test(id)
      ? {
          label: 'YouTube',
          thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          embed: () => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
        }
      : null
  if (host === 'youtu.be') return yt(path[0])
  if (host === 'youtube.com' || host === 'music.youtube.com') {
    if (path[0] === 'watch') return yt(u.searchParams.get('v'))
    if (['shorts', 'embed', 'live', 'v'].includes(path[0])) return yt(path[1])
    return null
  }
  if (host === 'vimeo.com' && /^\d+$/.test(path[0] ?? '')) {
    const id = path[0]
    return { label: 'Vimeo', browser: true, embed: () => `https://player.vimeo.com/video/${id}?autoplay=1` }
  }
  if (host === 'clips.twitch.tv' && path[0]) {
    const clip = path[0]
    return { label: 'Twitch', window: true, embed: (h) => `https://clips.twitch.tv/embed?clip=${clip}&parent=${h}&autoplay=true` }
  }
  if (host === 'twitch.tv' && path[0]) {
    if (path[0] === 'videos' && /^\d+$/.test(path[1] ?? '')) {
      const id = path[1]
      return { label: 'Twitch', window: true, embed: (h) => `https://player.twitch.tv/?video=${id}&parent=${h}&autoplay=true` }
    }
    if (path[1] === 'clip' && path[2]) {
      const clip = path[2]
      return { label: 'Twitch', window: true, embed: (h) => `https://clips.twitch.tv/embed?clip=${clip}&parent=${h}&autoplay=true` }
    }
    if (path.length === 1 && /^\w+$/.test(path[0])) {
      const channel = path[0]
      return { label: 'Twitch', window: true, embed: (h) => `https://player.twitch.tv/?channel=${channel}&parent=${h}&autoplay=true` }
    }
    return null
  }
  if (/^https:$/.test(u.protocol) && /\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) return { label: 'Відео', file: true, embed: () => raw }
  return null
}

const PLAY_ICON =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z"/></svg>'

/** Обкладинка відео: картинка (якщо є), назва сервісу й кругла кнопка ▶ */
export function videoCover(box: HTMLElement) {
  const info = parseVideo(box.dataset.url ?? '')
  if (!info) return
  box.innerHTML = `<span class="note-video-frame">${info.thumb ? `<img src="${info.thumb}" alt="" draggable="false">` : ''}<span class="note-video-badge">${esc(info.label)}</span><span class="note-video-play">${PLAY_ICON}</span></span>` + mediaDragHandle()
}

/**
 * Відео в тексті виглядає як фото: ті самі розміри, обтікання й вирівнювання,
 * але з обкладинкою і кнопкою ▶. Зберігаємо лише посилання.
 */
export function makeVideo(url: string, size: ImgSize = 'm', wrap: ImgWrap = 'left') {
  const box = document.createElement('span')
  box.className = 'note-img note-video'
  box.contentEditable = 'false'
  box.dataset.url = url
  box.dataset.size = size
  box.dataset.wrap = wrap
  box.draggable = true
  videoCover(box)
  return box
}

/** Чип «кнопка копіювання»: текст + кругла кнопка копіювання */
export function makeChip(text: string) {
  const chip = document.createElement('span')
  chip.className = 'note-chip'
  chip.contentEditable = 'false'
  chip.innerHTML = `<span class="note-chip-text">${esc(text)}</span><button type="button" class="note-chip-copy" tabindex="-1" aria-label="Копіювати">${COPY_ICON}</button>`
  return chip
}
export const chipText = (chip: Element) =>
  (chip as HTMLElement).dataset?.url ?? chip.querySelector('.note-chip-text')?.textContent ?? ''

export function textToHtml(text: string) {
  if (!text) return '<div><br></div>'
  return text
    .split('\n')
    .map((l) => `<div>${l ? esc(l) : '<br>'}</div>`)
    .join('')
}

/** Лишаємо тільки свою розмітку: рядки, стилі шрифту й чипи (дані можуть прийти із синхронізації) */
export function sanitize(html: string) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const out = document.createElement('div')
  const walk = (from: Node, to: Node) => {
    from.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) return void to.appendChild(document.createTextNode(n.textContent ?? ''))
      if (n.nodeType !== Node.ELEMENT_NODE) return
      const el = n as HTMLElement
      if (el.tagName === 'BR') return void to.appendChild(document.createElement('br'))
      if (el.classList.contains('note-video')) {
        const { url = '', size = 'm', wrap = 'left' } = el.dataset
        if (parseVideo(url))
          to.appendChild(makeVideo(url, SIZES.includes(size as ImgSize) ? (size as ImgSize) : 'm', WRAPS.includes(wrap as ImgWrap) ? (wrap as ImgWrap) : 'left'))
        return
      }
      if (el.classList.contains('note-img')) {
        const { file = '', size = 'm', wrap = 'left' } = el.dataset
        if (FILE_ID.test(file))
          to.appendChild(makeImage(file, SIZES.includes(size as ImgSize) ? (size as ImgSize) : 'm', WRAPS.includes(wrap as ImgWrap) ? (wrap as ImgWrap) : 'left'))
        return
      }
      if (el.classList.contains('note-link')) {
        const url = el.dataset.url ?? ''
        return void to.appendChild(URL_RE.test(url) ? makeLinkChip(url) : document.createTextNode(url))
      }
      if (el.classList.contains('note-chip')) return void to.appendChild(makeChip(el.querySelector('.note-chip-text')?.textContent ?? el.textContent ?? ''))
      if (el.tagName === 'DIV') {
        const div = document.createElement('div')
        // Вирівнювання рядка: лише по центру чи праворуч (ліворуч — типове)
        if (ALIGNS.includes(el.style.textAlign as Align)) div.style.textAlign = el.style.textAlign
        walk(el, div)
        return void to.appendChild(div)
      }
      if (el.tagName === 'SPAN' && el.getAttribute('style')) {
        const span = document.createElement('span')
        for (const p of STYLE_PROPS) {
          const v = el.style.getPropertyValue(p)
          if (v) span.style.setProperty(p, v)
        }
        walk(el, span)
        return void to.appendChild(span)
      }
      walk(el, to)
    })
  }
  walk(doc.body, out)
  return out.innerHTML || '<div><br></div>'
}

/** Рядок (блок) верхнього рівня, у якому лежить вузол; голий текст угорі загортаємо в <div> */
export function blockOf(editor: HTMLElement, node: Node | null): HTMLElement | null {
  let n: Node | null = node
  if (n === editor) n = editor.childNodes[Math.min(editor.childNodes.length - 1, 0)] ?? null
  while (n && n.parentNode !== editor) n = n.parentNode
  if (!n) return null
  if (n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName === 'DIV') return n as HTMLElement
  const div = document.createElement('div')
  editor.insertBefore(div, n)
  div.appendChild(n)
  return div
}

export function blocksIn(editor: HTMLElement, range: Range) {
  const all = Array.from(editor.children).filter((b) => range.intersectsNode(b)) as HTMLElement[]
  if (all.length) return all
  const one = blockOf(editor, range.startContainer)
  return one ? [one] : []
}

/** Нумерація абзаців: якщо всі вже пронумеровані — прибрати, інакше пронумерувати 1, 2, 3… */
export function toggleNumbering(blocks: HTMLElement[]) {
  const all = blocks.every((b) => NUMBER_PREFIX.test(b.textContent ?? ''))
  blocks.forEach((b, i) => {
    stripNumber(b)
    if (!all) b.insertBefore(document.createTextNode(`${i + 1}. `), b.firstChild)
  })
  return !all
}

function stripNumber(block: HTMLElement) {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  const first = walker.nextNode() as Text | null
  if (first && NUMBER_PREFIX.test(first.data)) first.data = first.data.replace(NUMBER_PREFIX, '')
  if (first && !first.data && first.parentNode === block) first.remove()
}

/** Обгортає частину кожного рядка з діапазону в <span> зі стилем; повертає нове виділення */
export function applyStyle(editor: HTMLElement, range: Range, prop: (typeof STYLE_PROPS)[number], value: string) {
  const spans: HTMLSpanElement[] = []
  for (const block of blocksIn(editor, range)) {
    const sub = document.createRange()
    sub.selectNodeContents(block)
    if (block.contains(range.startContainer) || block === range.startContainer) sub.setStart(range.startContainer, range.startOffset)
    if (block.contains(range.endContainer) || block === range.endContainer) sub.setEnd(range.endContainer, range.endOffset)
    if (sub.collapsed || !sub.toString()) continue
    // Виділення вже точно збігається з одним стилізованим спаном — міняємо його, а не вкладаємо новий
    const own = ownSpan(sub, block)
    if (own) {
      own.style.setProperty(prop, value)
      own.querySelectorAll<HTMLSpanElement>('span[style]').forEach((s) => s.style.removeProperty(prop))
      spans.push(own)
      continue
    }
    const frag = sub.extractContents()
    // Вкладені спани з тією самою властивістю більше не потрібні
    frag.querySelectorAll<HTMLSpanElement>('span[style]').forEach((s) => {
      s.style.removeProperty(prop)
      if (!s.getAttribute('style')) s.replaceWith(...Array.from(s.childNodes))
    })
    const span = document.createElement('span')
    span.style.setProperty(prop, value)
    span.appendChild(frag)
    sub.insertNode(span)
    spans.push(span)
  }
  const next = document.createRange()
  if (spans.length) {
    next.setStart(spans[0], 0)
    const last = spans[spans.length - 1]
    next.setEnd(last, last.childNodes.length)
  }
  return spans.length ? next : range
}

function ownSpan(range: Range, block: HTMLElement): HTMLSpanElement | null {
  const text = range.toString()
  let n: Node | null = range.commonAncestorContainer
  let found: HTMLSpanElement | null = null
  while (n && n !== block) {
    if (n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName === 'SPAN' && (n as HTMLElement).getAttribute('style')) {
      if ((n as HTMLElement).textContent === text) found = n as HTMLSpanElement
      else break
    }
    n = n.parentNode
  }
  return found
}

/** Простий текст нотатки: рядок на блок, чип — своїм текстом (innerText ламає рядки на чипах) */
export function plainText(editor: HTMLElement) {
  const textOf = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/\u00a0/g, ' ')
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const el = node as HTMLElement
    if (el.classList.contains('note-chip') || el.classList.contains('note-video')) return chipText(el)
    if (el.tagName === 'BR') return ''
    return Array.from(el.childNodes).map(textOf).join('')
  }
  return Array.from(editor.childNodes)
    .map(textOf)
    .join('\n')
    .replace(/\s+$/, '')
}

/** Простий текст збереженої сторінки (без відкритого редактора) */
export function htmlToText(html: string) {
  const box = document.createElement('div')
  box.innerHTML = sanitize(html)
  return plainText(box)
}

/** Поточний стиль на початку виділення — для показу в меню */
export function styleAt(range: Range) {
  const node = range.startContainer
  const el = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) as HTMLElement | null
  if (!el) return { font: 'Inter', size: BASE_SIZE, weight: 500 }
  const cs = getComputedStyle(el)
  const family = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim()
  return {
    font: family === 'SF Pro Display' || family === 'Inter Variable' ? 'Inter' : family,
    size: Math.round(parseFloat(cs.fontSize)) || BASE_SIZE,
    weight: Number(cs.fontWeight) || 500,
  }
}

export const fontStack = (name: string) => (name === 'Inter' ? "'Inter Variable', 'Segoe UI', sans-serif" : `'${name}', 'Segoe UI', sans-serif`)
