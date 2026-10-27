/** Приватний drag payload: між редакторами його не перетворюємо на звичайний текст. */
export const MEDIA_DRAG_TYPE = 'application/x-kast-note-media'

export interface MediaDropPoint {
  range: Range
  marker: { left: number; top: number; width: number; height: number }
}

/** Розташування поряд з медіа, а не всередині його contentEditable=false вмісту. */
function beside(box: HTMLElement, after: boolean) {
  const range = document.createRange()
  if (after) range.setStartAfter(box)
  else range.setStartBefore(box)
  range.collapse(true)
  return range
}

export function mediaDropPoint(editor: HTMLElement, moving: HTMLElement | null, target: EventTarget | null, x: number, y: number): MediaDropPoint | null {
  const element = target instanceof Element ? target : null
  const hit = element?.closest<HTMLElement>('.note-img, .note-chip')
  if (hit && editor.contains(hit)) {
    if (hit === moving) return null
    const rect = hit.getBoundingClientRect()
    const block = hit.dataset.wrap === 'block' || hit.dataset.size === 'l'
    const after = block ? y > rect.top + rect.height / 2 : (x > rect.left + rect.width / 2) !== (hit.dataset.wrap === 'right')
    return {
      range: beside(hit, after),
      marker: block
        ? { left: rect.left, top: after ? rect.bottom + 4 : rect.top - 4, width: rect.width, height: 3 }
        : { left: after !== (hit.dataset.wrap === 'right') ? rect.right + 5 : rect.left - 5, top: rect.top, width: 3, height: rect.height },
    }
  }

  let range = document.caretRangeFromPoint(x, y)
  if (!range || !editor.contains(range.startContainer)) {
    range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(y < editor.getBoundingClientRect().top)
  }
  if (moving?.contains(range.startContainer)) return null
  // Chromium може повернути граничну точку всередині атомарного фото/плеєра.
  const parent = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement
  const media = parent?.closest<HTMLElement>('.note-img, .note-chip')
  if (media) return mediaDropPoint(editor, moving, media, x, y)
  range.collapse(true)
  const rect = range.getBoundingClientRect()
  const line = parent?.getBoundingClientRect() ?? editor.getBoundingClientRect()
  return {
    range,
    marker: { left: rect.height ? rect.left : line.left, top: rect.height ? rect.top : line.top, width: 3, height: rect.height || 28 },
  }
}

/** Переміщуємо саме наявний вузол: id фото, форматування й URL не клонуються. */
export function moveMedia(editor: HTMLElement, box: HTMLElement, destination: Range) {
  if (!editor.contains(box) || !editor.contains(destination.startContainer) || box.contains(destination.startContainer)) return false
  const container = destination.startContainer instanceof Element ? destination.startContainer : destination.startContainer.parentElement
  if (container?.closest('.note-img, .note-chip')) return false
  const parent = box.parentNode!
  const index = Array.prototype.indexOf.call(parent.childNodes, box) as number
  if (destination.startContainer === parent && (destination.startOffset === index || destination.startOffset === index + 1)) return false
  destination.insertNode(box)
  return true
}

/** Клавіатурний і контекстний варіант: на один елемент/абзац у потрібний бік. */
export function adjacentMediaPoint(editor: HTMLElement, box: HTMLElement, direction: -1 | 1): Range | null {
  let node: Node = box
  while (node !== editor) {
    let sibling = direction < 0 ? node.previousSibling : node.nextSibling
    // Порожні текстові вузли — лише наслідок splitText після insertNode.
    while (sibling?.nodeType === Node.TEXT_NODE && !sibling.textContent?.trim()) sibling = direction < 0 ? sibling.previousSibling : sibling.nextSibling
    if (sibling) {
      const range = document.createRange()
      if (direction < 0) range.setStartBefore(sibling)
      else range.setStartAfter(sibling)
      range.collapse(true)
      return range
    }
    if (!node.parentNode) return null
    node = node.parentNode
  }
  return null
}
