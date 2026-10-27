import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { cn, ContextMenu, Icon, useToast, type MenuAction } from '@/design-system'
import { SENT_MARK, TASK_LINE } from '@/data/notes'
import {
  applyStyle,
  BASE_SIZE,
  blockOf,
  blocksIn,
  chipText,
  FONTS,
  fontStack,
  makeChip,
  plainText,
  sanitize,
  styleAt,
  toggleNumbering,
  WEIGHTS,
} from './richText'

export interface RichNoteHandle {
  /** Перетворити рядок під курсором на задачу */
  convertCurrent(): void
  focusStart(): void
}

interface MenuState {
  x: number
  y: number
  range: Range | null
  chip: HTMLElement | null
}

/**
 * Редактор нотатки з контекстним меню Karkas: шрифт, розмір, товщина,
 * нумерація, копіювати, вставити, «кнопка копіювання», видалити.
 */
export const RichNote = forwardRef<RichNoteHandle, {
  html: string
  placeholder: string
  onChange: (html: string, text: string) => void
  onLineToTask: (title: string) => Promise<void>
  /** Редагування заблоковане: лише читати, виділяти й копіювати */
  readOnly?: boolean
}>(function RichNote({ html, placeholder, onChange, onLineToTask, readOnly }, ref) {
  const editor = useRef<HTMLDivElement>(null)
  const lastHtml = useRef<string | null>(null)
  const [empty, setEmpty] = useState(false)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const toast = useToast()

  const el = () => editor.current!

  const emit = useCallback(() => {
    const e = editor.current
    if (!e) return
    if (!e.firstChild || e.innerHTML === '<br>') e.innerHTML = '<div><br></div>'
    // Фокус і blur без змін не зберігаємо — інакше нотатка «оновлюється» і стрибає вгору списку
    if (e.innerHTML === lastHtml.current) return
    const text = plainText(e)
    setEmpty(!text.trim() && !e.querySelector('.note-chip'))
    lastHtml.current = e.innerHTML
    onChange(e.innerHTML, text)
  }, [onChange])

  // Зовнішні зміни (синхронізація, швидкий запис) підхоплюємо, якщо ви зараз не друкуєте
  useLayoutEffect(() => {
    const e = editor.current
    if (!e || html === lastHtml.current) return
    if (lastHtml.current !== null && document.activeElement === e) return
    e.innerHTML = sanitize(html)
    lastHtml.current = e.innerHTML
    setEmpty(!plainText(e).trim() && !e.querySelector('.note-chip'))
  }, [html])

  const select = (range: Range) => {
    const sel = getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }
  const snapshot = () => el().innerHTML
  /** Після дії — коротке сповіщення; для змін тексту — зі «Скасувати» */
  const done = (title: string, before?: string) => {
    emit()
    toast(
      before === undefined
        ? { title }
        : {
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
    if (!block) return
    const raw = block.textContent ?? ''
    if (raw.startsWith(SENT_MARK)) return
    const title = raw.replace(TASK_LINE, '').replace(/^[-•*]\s+/, '').replace(/^\d+\.\s/, '').trim()
    if (!title) return
    await onLineToTask(title)
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
    return sel?.anchorNode && el().contains(sel.anchorNode) ? blockOf(el(), sel.anchorNode) : null
  }

  useImperativeHandle(ref, () => ({
    convertCurrent: () => convert(currentBlock(), false),
    focusStart: () => {
      el().focus()
      const r = document.createRange()
      r.setStart(el(), 0)
      r.collapse(true)
      select(r)
    },
  }))

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      e.preventDefault()
      const sel = getSelection()
      const range = sel?.rangeCount ? sel.getRangeAt(0) : null
      const rect = range?.getBoundingClientRect()
      openMenu(rect?.left ?? 0, rect?.bottom ?? 0, null)
      return
    }
    if (readOnly) return
    // Браузерні Ctrl+B/I/U вставляють <b>/<i>/<u>, які Kast не зберігає. Жирний — нашим стилем, решта вимкнена.
    if (e.ctrlKey && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
      e.preventDefault()
      const sel = getSelection()
      if (e.key.toLowerCase() !== 'b' || !sel?.rangeCount || sel.isCollapsed) return
      const range = sel.getRangeAt(0)
      const bold = styleAt(range).weight >= 700
      const before = snapshot()
      select(applyStyle(el(), range, 'font-weight', bold ? '500' : '800'))
      emit()
      toast({ title: bold ? 'Звичайна товщина' : 'Жирний', action: { label: 'Скасувати', onClick: () => ((el().innerHTML = before), emit()) } })
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
    }
  }

  // Вставляємо лише текст, без чужої розмітки
  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
  }

  // Перетягнутий текст — теж лише текстом
  const onDrop = (e: React.DragEvent) => {
    if (readOnly) return e.preventDefault()
    const text = e.dataTransfer.getData('text/plain')
    if (!text) return
    e.preventDefault()
    const range = document.caretRangeFromPoint?.(e.clientX, e.clientY)
    if (range) select(range)
    document.execCommand('insertText', false, text)
  }

  // Кнопка копіювання в чипі
  const onClick = async (e: React.MouseEvent) => {
    const btn = (e.target as HTMLElement).closest('.note-chip-copy')
    if (!btn) return
    e.preventDefault()
    const chip = btn.closest('.note-chip') as HTMLElement
    await copy(chipText(chip))
    chip.classList.add('is-copied')
    setTimeout(() => chip.classList.remove('is-copied'), 1200)
  }

  /* ───────── Меню ───────── */
  const openMenu = (x: number, y: number, chip: HTMLElement | null) => {
    const sel = getSelection()
    const range = sel?.rangeCount && el().contains(sel.getRangeAt(0).commonAncestorContainer) ? sel.getRangeAt(0).cloneRange() : null
    setMenu({ x, y, range, chip })
  }

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const chip = (e.target as HTMLElement).closest('.note-chip') as HTMLElement | null
    openMenu(e.clientX, e.clientY, chip)
  }

  const close = useCallback(() => setMenu(null), [])

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast({ title: 'Скопійовано' })
    } catch {
      toast({ kind: 'error', title: 'Не вдалося скопіювати', text: 'Виділіть текст і натисніть Ctrl+C' })
    }
  }

  const hasText = !!menu?.range && !menu.range.collapsed && !!menu.range.toString().trim()

  const restyle = (prop: 'font-family' | 'font-size' | 'font-weight', value: string) => {
    if (!menu?.range || menu.range.collapsed) return
    const next = applyStyle(el(), menu.range, prop, value)
    select(next)
    setMenu({ ...menu, range: next.cloneRange() })
    emit()
  }

  const copyItem: MenuAction = menu?.chip
    ? { label: 'Копіювати', icon: 'copy', onSelect: () => (copy(chipText(menu.chip!)), close()) }
    : { label: 'Копіювати', icon: 'copy', disabled: !hasText, onSelect: () => (copy(menu!.range!.toString()), close()) }

  // Заблокована нотатка: з меню лишається тільки копіювання
  const items: MenuAction[] = readOnly
    ? [copyItem]
    : menu?.chip
    ? [
        copyItem,
        {
          label: 'Звичайний текст',
          icon: 'removeFormat',
          onSelect: () => {
            const before = snapshot()
            menu.chip!.replaceWith(document.createTextNode(chipText(menu.chip!)))
            close()
            done('Кнопку прибрано', before)
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
            done(on ? 'Нумерацію додано' : 'Нумерацію прибрано', before)
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
              done('Вставлено', before)
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
            const space = document.createTextNode(' ')
            chip.after(space)
            const r = document.createRange()
            r.setStartAfter(space)
            r.collapse(true)
            select(r)
            close()
            done('Кнопку додано', before)
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
            select(menu!.range!)
            document.execCommand('delete')
            close()
            done('Видалено', before)
          },
        },
      ]

  return (
    <>
      <div
        ref={editor}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        spellCheck
        role="textbox"
        aria-multiline
        aria-label="Текст нотатки"
        aria-readonly={readOnly || undefined}
        data-placeholder={placeholder}
        data-empty={(empty && !readOnly) || undefined}
        onInput={emit}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onDrop={onDrop}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onBlur={emit}
        className="note-editor min-h-0 w-full flex-1 overflow-y-auto text-[17px] leading-[1.6] font-medium text-ink outline-none"
      />
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={menu.chip ? 'Дії з кнопкою копіювання' : 'Дії з виділеним'}
          items={items}
          onClose={close}
          header={hasText && !menu.chip && !readOnly ? <FormatBar range={menu.range!} onStyle={restyle} /> : undefined}
        />
      )}
    </>
  )
})

/** Верх меню: шрифт (зі списком і пошуком), розмір, товщина — як у Karkas */
function FormatBar({ range, onStyle }: { range: Range; onStyle: (prop: 'font-family' | 'font-size' | 'font-weight', value: string) => void }) {
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
    </div>
  )
}
