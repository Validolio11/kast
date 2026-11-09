import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn, Icon } from '@/design-system'
import type { BlockItem } from './noteBlocks'

/**
 * Меню «/» біля курсора: типи блоків, як у Notion. Фокус лишається в тексті —
 * стрілки, Enter і Esc обробляє редактор, а меню лише показує й ловить клік.
 */
export function SlashMenu({
  items,
  index,
  x,
  y,
  title,
  onPick,
  onHover,
}: {
  items: BlockItem[]
  index: number
  x: number
  y: number
  title: string
  onPick: (item: BlockItem) => void
  onHover: (i: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // У межах вікна: не влазить знизу — над рядком
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPos({
      left: Math.max(8, Math.min(x, innerWidth - width - 8)),
      top: y + height > innerHeight - 8 ? Math.max(8, y - height - 34) : y,
    })
  }, [x, y, items.length])

  // Вибраний пункт завжди видно в списку
  useLayoutEffect(() => {
    const box = list.current
    const item = box?.children[index] as HTMLElement | undefined
    if (!box || !item) return
    if (item.offsetTop < box.scrollTop) box.scrollTop = item.offsetTop
    else if (item.offsetTop + item.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = item.offsetTop + item.offsetHeight - box.clientHeight
  }, [index])

  return createPortal(
    <div
      ref={ref}
      role="listbox"
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      className="slash-menu no-drag fixed z-[130] flex w-[300px] animate-menu-in flex-col rounded-[26px] bg-canvas p-1.5 text-white shadow-menu"
      style={pos}
    >
      <span className="px-3 pt-1.5 pb-1 text-[12px] font-bold text-muted">{title}</span>
      <div ref={list} className="relative flex max-h-[312px] flex-col gap-0.5 overflow-y-auto overscroll-contain">
        {items.map((item, i) => (
          <button
            key={item.kind}
            type="button"
            role="option"
            aria-selected={i === index}
            onMouseEnter={() => onHover(i)}
            onClick={() => onPick(item)}
            className={cn('flex h-12 shrink-0 items-center gap-3 rounded-[20px] px-1.5 pr-3.5 text-left', i === index && 'bg-tile')}
          >
            <span className={cn('grid size-9 shrink-0 place-items-center rounded-full', i === index ? 'bg-steel' : 'bg-tile')}>
              <Icon name={item.icon} size={18} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{item.label}</span>
            {item.hint && <span className="shrink-0 text-[12px] font-bold text-muted">{item.hint}</span>}
          </button>
        ))}
        {!items.length && <p className="px-3 py-3 text-[14px] font-semibold text-muted">Нічого не знайдено</p>}
      </div>
    </div>,
    document.body,
  )
}
