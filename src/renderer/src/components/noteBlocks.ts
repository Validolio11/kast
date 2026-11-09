/*
 * Блоки, як у Notion: кожен рядок нотатки (<div> верхнього рівня) може мати тип.
 * Тип — атрибут рядка: data-block (заголовки, чекбокс, цитата, виноска, роздільник) або data-list (списки).
 */
import type { IconName } from '@/design-system'

export type BlockKind = 'text' | 'h1' | 'h2' | 'h3' | 'ul' | 'ol' | 'todo' | 'quote' | 'callout' | 'divider' | 'image' | 'task'

export interface BlockItem {
  kind: BlockKind
  label: string
  icon: IconName
  /** Скорочення, яке можна набрати на початку рядка */
  hint?: string
  /** Слова для пошуку після «/» — українською й англійською */
  keys: string
}

export const BLOCK_ITEMS: BlockItem[] = [
  { kind: 'text', label: 'Текст', icon: 'type', keys: 'текст звичайний абзац text paragraph' },
  { kind: 'h1', label: 'Заголовок 1', icon: 'heading1', hint: '#', keys: 'заголовок великий h1 heading title' },
  { kind: 'h2', label: 'Заголовок 2', icon: 'heading2', hint: '##', keys: 'заголовок середній h2 heading subtitle' },
  { kind: 'h3', label: 'Заголовок 3', icon: 'heading3', hint: '###', keys: 'заголовок малий h3 heading' },
  { kind: 'ul', label: 'Список', icon: 'list', hint: '-', keys: 'список маркований крапки bullet list ul' },
  { kind: 'ol', label: 'Нумерований список', icon: 'listOrdered', hint: '1.', keys: 'список нумерований номери numbered list ol' },
  { kind: 'todo', label: 'Чекбокс', icon: 'listChecks', keys: 'чекбокс галочка справа todo checkbox check' },
  { kind: 'quote', label: 'Цитата', icon: 'quote', hint: '>', keys: 'цитата quote' },
  { kind: 'callout', label: 'Виноска', icon: 'lightbulb', keys: 'виноска підказка важливо callout note' },
  { kind: 'divider', label: 'Роздільник', icon: 'minus', hint: '---', keys: 'роздільник лінія divider line hr' },
  { kind: 'image', label: 'Фото', icon: 'image', keys: 'фото зображення картинка скріншот image photo picture' },
  { kind: 'task', label: 'Задача у Вхідні', icon: 'arrowUpRight', hint: 'Ctrl+Enter', keys: 'задача вхідні task inbox todo' },
]

export function matchBlocks(query: string, withImage: boolean) {
  const q = query.trim().toLowerCase()
  return BLOCK_ITEMS.filter((b) => (withImage || b.kind !== 'image') && (!q || b.label.toLowerCase().includes(q) || b.keys.includes(q)))
}

/** Тип рядка: як його бачить меню (зручно для «Перетворити на» й Enter/Backspace) */
export function kindOf(block: HTMLElement): BlockKind {
  const list = block.dataset.list
  if (list === 'ol' || list === 'ul') return list
  const b = block.dataset.block
  return b === 'h1' || b === 'h2' || b === 'h3' || b === 'todo' || b === 'quote' || b === 'callout' || b === 'divider' ? b : 'text'
}

export const hasContent = (node: ParentNode) => !!node.textContent?.trim() || !!node.querySelector('.note-chip, .note-img')

/**
 * Змінити тип рядка. Повертає рядок, у який ставити курсор:
 * роздільник ставиться перед порожнім рядком (або після заповненого) — писати далі можна одразу.
 */
export function setBlock(block: HTMLElement, kind: BlockKind): HTMLElement {
  if (kind === 'divider') {
    const line = document.createElement('div')
    line.dataset.block = 'divider'
    line.contentEditable = 'false'
    if (!hasContent(block)) {
      block.before(line)
      clearKind(block)
      keepLine(block)
      return block
    }
    const next = document.createElement('div')
    next.appendChild(document.createElement('br'))
    block.after(line)
    line.after(next)
    return next
  }
  clearKind(block)
  if (kind === 'ul' || kind === 'ol') block.dataset.list = kind
  else if (kind !== 'text' && kind !== 'image' && kind !== 'task') block.dataset.block = kind
  keepLine(block)
  return block
}

/** Порожній рядок тримає <br>: інакше він сплющується, а набраний текст іде повз нього */
export function keepLine(block: HTMLElement) {
  if (!hasContent(block) && !block.querySelector('br')) block.replaceChildren(document.createElement('br'))
}

export function clearKind(block: HTMLElement) {
  for (const a of ['data-block', 'data-checked', 'data-list', 'data-level']) block.removeAttribute(a)
}

/** Діапазон за позиціями у тексті рядка (текст може бути розбитий стилями на кілька вузлів) */
export function textRange(block: HTMLElement, from: number, to: number) {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('.note-chip, .note-img') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  })
  const r = document.createRange()
  let at = 0
  let started = false
  while (walker.nextNode()) {
    const t = walker.currentNode as Text
    if (!started && from <= at + t.length) {
      r.setStart(t, from - at)
      started = true
    }
    if (started && to <= at + t.length) {
      r.setEnd(t, to - at)
      return r
    }
    at += t.length
  }
  return null
}
