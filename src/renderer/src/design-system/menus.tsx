import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { cn, useEscape, useOutsideClick, useUid } from './utils'

/* ───────────── Popover ───────────── */
export function Popover({
  trigger,
  children,
  align = 'start',
  panelClassName,
}: {
  trigger: (p: { open: boolean; toggle: () => void; props: { 'aria-expanded': boolean; 'aria-haspopup': 'dialog' } }) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'start' | 'end'
  panelClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useOutsideClick(ref, close, open)
  useEscape(close, open)
  return (
    <div ref={ref} className="relative inline-block">
      {trigger({ open, toggle: () => setOpen((o) => !o), props: { 'aria-expanded': open, 'aria-haspopup': 'dialog' } })}
      {open && (
        <div
          className={cn(
            'absolute top-full z-40 mt-3 origin-top animate-menu-in rounded-tile bg-graphite p-3 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/10',
            align === 'end' ? 'right-0' : 'left-0',
            panelClassName,
          )}
        >
          {children(close)}
        </div>
      )}
    </div>
  )
}

/* ───────────── Select (listbox) ───────────── */
export interface SelectOption<T extends string> {
  value: T
  label: string
  hint?: string
  icon?: IconName
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
  placeholder = 'Оберіть…',
  searchable,
  className,
}: {
  value: T | null
  onChange: (v: T) => void
  options: SelectOption<T>[]
  label: string
  placeholder?: string
  searchable?: boolean
  className?: string
}) {
  const uid = useUid('sel')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])
  useOutsideClick(ref, close, open)

  const filtered = options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    if (open) setCursor(Math.max(0, filtered.findIndex((o) => o.value === value)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const pick = (o: SelectOption<T>) => {
    onChange(o.value)
    close()
    btn.current?.focus()
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(filtered.length - 1, c + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(0, c - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[cursor]) pick(filtered[cursor])
    } else if (e.key === 'Escape') {
      close()
      btn.current?.focus()
    } else if (e.key === 'Home') setCursor(0)
    else if (e.key === 'End') setCursor(filtered.length - 1)
  }

  return (
    <div ref={ref} className={cn('relative flex flex-col gap-2', className)} onKeyDown={onKey}>
      <span id={`${uid}-label`} className="px-1 text-[12px] font-bold tracking-[0.08em] text-fog uppercase">
        {label}
      </span>
      <button
        ref={btn}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={`${uid}-list`}
        aria-labelledby={`${uid}-label`}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-14 items-center gap-3 rounded-field bg-graphite px-5 text-left ring-1 ring-inset transition-[box-shadow,background-color] duration-200 ease-pulse active:scale-[0.99]',
          open ? 'ring-2 ring-volt-glow' : 'ring-white/10 hover:ring-white/25',
        )}
      >
        {selected?.icon && <Icon name={selected.icon} size={20} className="text-fog" />}
        <span className={cn('flex-1 truncate text-[16px]', selected ? 'text-paper' : 'text-fog/60')}>
          {selected?.label ?? placeholder}
        </span>
        <Icon
          name="chevronDown"
          size={20}
          className={cn('text-fog transition-transform duration-300 ease-spring', open && 'rotate-180 text-paper')}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-40 mt-2 w-full origin-top animate-menu-in overflow-hidden rounded-tile bg-graphite p-2 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/10">
          {searchable && (
            <div className="mb-1 flex items-center gap-2 rounded-field bg-night px-4">
              <Icon name="search" size={16} className="text-fog" />
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setCursor(0)
                }}
                aria-label="Пошук у списку"
                placeholder="Пошук…"
                className="h-11 w-full bg-transparent text-[15px] outline-none placeholder:text-fog/60"
              />
            </div>
          )}
          <ul id={`${uid}-list`} role="listbox" aria-labelledby={`${uid}-label`} className="max-h-64 overflow-y-auto">
            {filtered.length === 0 && <li className="px-4 py-3 text-[14px] text-fog">Нічого не знайдено</li>}
            {filtered.map((o, i) => {
              const isSel = o.value === value
              return (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={isSel}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => pick(o)}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-field px-4 py-3 transition-colors duration-150',
                    cursor === i && 'bg-steel/70',
                  )}
                >
                  {o.icon && <Icon name={o.icon} size={18} className="text-fog" />}
                  <span className="flex flex-1 flex-col">
                    <span className="text-[15px] font-semibold">{o.label}</span>
                    {o.hint && <span className="text-[13px] text-fog">{o.hint}</span>}
                  </span>
                  {isSel && <Icon name="check" size={18} className="text-pulse" />}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

/* ───────────── Menu ───────────── */
export interface MenuItem {
  label: string
  icon?: IconName
  danger?: boolean
  shortcut?: string
  onSelect: () => void
}

export function Menu({ trigger, items, align = 'start' }: {
  trigger: (p: { open: boolean; toggle: () => void; props: { 'aria-expanded': boolean; 'aria-haspopup': 'dialog' } }) => ReactNode
  items: (MenuItem | 'separator')[]
  align?: 'start' | 'end'
}) {
  return (
    <Popover trigger={trigger} align={align} panelClassName="w-64 p-2">
      {(close) => <MenuList items={items} close={close} />}
    </Popover>
  )
}

function MenuList({ items, close }: { items: (MenuItem | 'separator')[]; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus()
  }, [])
  const onKey = (e: React.KeyboardEvent) => {
    const els = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])
    const i = els.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      els[(i + 1) % els.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      els[(i - 1 + els.length) % els.length]?.focus()
    }
  }
  return (
    <div ref={ref} role="menu" onKeyDown={onKey} className="flex flex-col">
      {items.map((it, i) =>
        it === 'separator' ? (
          <div key={i} role="separator" className="my-1.5 h-px bg-white/10" />
        ) : (
          <button
            key={it.label}
            role="menuitem"
            onClick={() => {
              it.onSelect()
              close()
            }}
            className={cn(
              'flex items-center gap-3 rounded-field px-4 py-3 text-left text-[15px] font-semibold transition-all duration-150 ease-pulse hover:pl-5 focus-visible:pl-5',
              it.danger ? 'text-signal hover:bg-signal/12' : 'hover:bg-steel/70',
            )}
          >
            {it.icon && <Icon name={it.icon} size={18} />}
            <span className="flex-1">{it.label}</span>
            {it.shortcut && <span className="text-[12px] font-bold text-fog">{it.shortcut}</span>}
          </button>
        ),
      )}
    </div>
  )
}

/* ───────────── Tooltip ───────────── */
export function Tooltip({ text, children, side = 'top' }: { text: string; children: ReactNode; side?: 'top' | 'bottom' }) {
  const id = useUid('tip')
  return (
    <span className="group/tip relative inline-flex" aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 rounded-full bg-paper px-3.5 py-1.5 text-[12px] font-bold whitespace-nowrap text-night opacity-0 shadow-xl',
          'scale-90 transition-all duration-200 ease-spring group-focus-within/tip:scale-100 group-focus-within/tip:opacity-100 group-hover/tip:scale-100 group-hover/tip:opacity-100',
          side === 'top' ? 'bottom-full mb-2.5' : 'top-full mt-2.5',
        )}
      >
        {text}
      </span>
    </span>
  )
}

/* ───────────── Accordion ───────────── */
export function Accordion({
  items,
  single = true,
}: {
  items: { id: string; title: string; icon?: IconName; content: ReactNode }[]
  single?: boolean
}) {
  const [openIds, setOpenIds] = useState<string[]>([items[0]?.id])
  const toggle = (id: string) =>
    setOpenIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : single ? [id] : [...cur, id]))
  return (
    <div className="flex flex-col gap-2">
      {items.map((it) => {
        const open = openIds.includes(it.id)
        return (
          <div key={it.id} className={cn('rounded-field transition-colors duration-300', open ? 'bg-steel/60' : 'bg-graphite')}>
            <button
              aria-expanded={open}
              aria-controls={`acc-${it.id}`}
              onClick={() => toggle(it.id)}
              className="flex w-full items-center gap-3 px-5 py-4 text-left text-[16px] font-bold"
            >
              {it.icon && <Icon name={it.icon} size={20} className="text-fog" />}
              <span className="flex-1">{it.title}</span>
              <span
                className={cn(
                  'grid size-8 place-items-center rounded-full transition-all duration-300 ease-spring',
                  open ? 'rotate-45 bg-paper text-night' : 'bg-steel text-paper',
                )}
              >
                <Icon name="plus" size={16} />
              </span>
            </button>
            <div
              id={`acc-${it.id}`}
              role="region"
              className={cn('grid transition-[grid-template-rows] duration-400 ease-pulse', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
            >
              <div className="overflow-hidden">
                <div className="px-5 pb-5 text-[15px] leading-relaxed text-fog">{it.content}</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
