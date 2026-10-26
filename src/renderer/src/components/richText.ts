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

/** Чип «кнопка копіювання»: текст + кругла кнопка копіювання */
export function makeChip(text: string) {
  const chip = document.createElement('span')
  chip.className = 'note-chip'
  chip.contentEditable = 'false'
  chip.innerHTML = `<span class="note-chip-text">${esc(text)}</span><button type="button" class="note-chip-copy" tabindex="-1" aria-label="Копіювати">${COPY_ICON}</button>`
  return chip
}
export const chipText = (chip: Element) => chip.querySelector('.note-chip-text')?.textContent ?? ''

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
      if (el.classList.contains('note-chip')) return void to.appendChild(makeChip(el.querySelector('.note-chip-text')?.textContent ?? el.textContent ?? ''))
      if (el.tagName === 'DIV') {
        const div = document.createElement('div')
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
    if (el.classList.contains('note-chip')) return chipText(el)
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
