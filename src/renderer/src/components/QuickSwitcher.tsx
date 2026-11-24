/*
 * Ctrl+P: знайти нотатку за кілька літер і відкрити її з будь-якої вкладки.
 * Без запиту — нещодавні; немає збігу за назвою — можна одразу створити нотатку з такою назвою.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { cn, Icon, Palette, useSlidingPill } from '@/design-system'
import { useNotes } from '@/data/hooks'
import { createNote, noteTitle } from '@/data/notes'
import { age } from '@/lib/time'

const LIMIT = 8

export function QuickSwitcher({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: string) => void }) {
  // Вміст існує, лише поки вікно відкрите: закрите не тримає підписку на нотатки й не перераховує список
  return (
    <Palette open={open} onClose={onClose} label="Перейти до нотатки">
      <SwitcherBody onClose={onClose} onPick={onPick} />
    </Palette>
  )
}

function SwitcherBody({ onClose, onPick }: { onClose: () => void; onPick: (id: string) => void }) {
  const loaded = useNotes()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const busy = useRef(false)
  const uid = useId()
  // Назви й текст у нижньому регістрі — один раз на зміну нотаток, а не в кожному порівнянні сортування
  const indexed = useMemo(
    () => (loaded ?? []).map((n) => ({ n, title: noteTitle(n.body), title_l: noteTitle(n.body).toLowerCase(), body_l: n.body.toLowerCase() })),
    [loaded],
  )

  const query = q.trim().toLowerCase()
  // Збіг у назві — вище за збіг у тексті; далі — свіжіші
  const shown = (
    query
      ? indexed
          .filter((x) => x.body_l.includes(query))
          .sort((a, b) => Number(b.title_l.includes(query)) - Number(a.title_l.includes(query)) || b.n.updatedAt - a.n.updatedAt)
      : [...indexed].sort((a, b) => b.n.updatedAt - a.n.updatedAt)
  ).slice(0, LIMIT)
  const canCreate = !!query && !indexed.some((x) => x.title_l === query)
  const count = shown.length + (canCreate ? 1 : 0)
  const cur = Math.min(active, Math.max(0, count - 1))
  // Підсвітка перебігає за стрілками й мишею (Command palette)
  const { host, pill } = useSlidingPill<HTMLDivElement>('[aria-selected="true"]', `${cur}:${shown.map((x) => x.n.id).join()}:${canCreate}`, 'bg-steel')

  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${cur}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [cur])

  const choose = async (i: number) => {
    // Подвійний Enter не створює дві нотатки: поки перша створюється, вікно ще відкрите
    if (busy.current) return
    busy.current = true
    if (i < shown.length) onPick(shown[i].n.id)
    else if (canCreate) onPick((await createNote(`${q.trim()}\n`)).id)
    else return void (busy.current = false)
    onClose()
  }

  const option = (i: number) => ({
    id: `${uid}-${i}`,
    'data-i': i,
    role: 'option',
    'aria-selected': i === cur,
    onMouseMove: () => setActive(i),
    onClick: () => choose(i),
    className: 'flex h-12 shrink-0 cursor-pointer items-center gap-3 rounded-[24px] px-4',
  })

  return (
    <>
      <label className="flex h-12 shrink-0 items-center gap-3 rounded-[24px] bg-canvas pr-2 pl-4">
        <Icon name="search" size={18} className="shrink-0 text-muted" />
        <input
          data-autofocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              if (count) setActive((cur + (e.key === 'ArrowDown' ? 1 : -1) + count) % count)
            } else if (e.key === 'Enter') {
              e.preventDefault()
              choose(cur)
            }
          }}
          placeholder="Знайти нотатку…"
          role="combobox"
          aria-expanded
          aria-controls={`${uid}-list`}
          aria-activedescendant={count ? `${uid}-${cur}` : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-semibold text-white outline-none placeholder:text-muted"
        />
        <kbd className="shrink-0 rounded-[10px] bg-tile px-2 py-1 font-sans text-[12px] font-bold text-muted">Esc</kbd>
      </label>
      <div
        ref={(el) => {
          listRef.current = el
          host.current = el
        }}
        id={`${uid}-list`}
        role="listbox"
        aria-label="Нотатки"
        className="relative isolate mt-2 flex min-h-0 flex-col gap-0.5 overflow-y-auto"
      >
        {pill}
        {!query && shown.length > 0 && <p className="px-4 pt-1 pb-1.5 text-[13px] font-extrabold text-grey">Нещодавні</p>}
        {shown.map(({ n, title }, i) => (
          <div key={n.id} {...option(i)}>
            <span aria-hidden className="grid size-6 shrink-0 place-items-center">
              {n.icon ? <span className="note-emoji text-[17px] leading-none">{n.icon}</span> : <Icon name="notebook" size={16} className="text-muted" />}
            </span>
            <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-white">{title}</span>
            <span className={cn('shrink-0 text-[12px] font-semibold', i === cur ? 'text-soft' : 'text-muted')}>{age(n.updatedAt)}</span>
          </div>
        ))}
        {canCreate && (
          <div {...option(shown.length)}>
            <span aria-hidden className="grid size-6 shrink-0 place-items-center text-growth">
              <Icon name="plus" size={16} strokeWidth={2.6} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-white">Створити «{q.trim()}»</span>
          </div>
        )}
        {!count && <p className="px-4 py-3 text-[14px] font-semibold text-muted">Нотаток ще немає — напишіть назву, щоб створити</p>}
      </div>
    </>
  )
}
