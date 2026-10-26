import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { IconButton } from './core'
import { Popover } from './menus'
import { cn } from './utils'

export interface DateRange {
  start: Date | null
  end: Date | null
}
export type MarkTone = 'pulse' | 'volt' | 'signal'

type Common = {
  /** ключ yyyy-mm-dd → тон активності */
  marks?: Record<string, MarkTone>
  className?: string
}
export type CalendarProps = Common &
  (
    | { mode?: 'single'; value: Date | null; onChange: (d: Date) => void }
    | { mode: 'range'; value: DateRange; onChange: (r: DateRange) => void }
  )

export const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const sameDay = (a: Date | null, b: Date | null) => !!a && !!b && dateKey(a) === dateKey(b)
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

const monthFmt = new Intl.DateTimeFormat('uk-UA', { month: 'long' })
const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
  new Intl.DateTimeFormat('uk-UA', { weekday: 'short' }).format(new Date(2024, 0, 1 + i)),
)

const markStyle: Record<MarkTone, string> = {
  pulse: 'bg-pulse text-night',
  volt: 'bg-volt text-white',
  signal: 'bg-signal text-night',
}

export function Calendar(props: CalendarProps) {
  const { marks = {}, className } = props
  const initial = props.mode === 'range' ? (props.value.start ?? new Date()) : (props.value ?? new Date())
  const [view, setView] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1))
  const [hover, setHover] = useState<Date | null>(null)
  const pendingFocus = useRef<string | null>(null)
  const grid = useRef<HTMLDivElement>(null)
  const today = new Date()

  useEffect(() => {
    if (pendingFocus.current) {
      grid.current?.querySelector<HTMLElement>(`[data-date="${pendingFocus.current}"]`)?.focus()
      pendingFocus.current = null
    }
  }, [view])

  const offset = (new Date(view.getFullYear(), view.getMonth(), 1).getDay() + 6) % 7
  const cells = Array.from({ length: 42 }, (_, i) => addDays(new Date(view.getFullYear(), view.getMonth(), 1), i - offset))

  const shift = (n: number) => setView(new Date(view.getFullYear(), view.getMonth() + n, 1))

  const select = (d: Date) => {
    if (props.mode === 'range') {
      const { start, end } = props.value
      if (!start || (start && end)) props.onChange({ start: d, end: null })
      else if (d < start) props.onChange({ start: d, end: start })
      else props.onChange({ start, end: d })
    } else props.onChange(d)
  }

  const onKey = (e: React.KeyboardEvent) => {
    const el = document.activeElement as HTMLElement
    const ds = el?.dataset?.date
    if (!ds) return
    const [y, m, d] = ds.split('-').map(Number)
    const cur = new Date(y, m - 1, d)
    const delta = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[e.key]
    if (!delta) return
    e.preventDefault()
    const next = addDays(cur, delta)
    pendingFocus.current = dateKey(next)
    if (next.getMonth() !== view.getMonth() || next.getFullYear() !== view.getFullYear()) {
      setView(new Date(next.getFullYear(), next.getMonth(), 1))
    } else {
      grid.current?.querySelector<HTMLElement>(`[data-date="${dateKey(next)}"]`)?.focus()
      pendingFocus.current = null
    }
  }

  const rangeEnd = props.mode === 'range' ? (props.value.end ?? (props.value.start ? hover : null)) : null
  const rangeStart = props.mode === 'range' ? props.value.start : null
  const [lo, hi] =
    rangeStart && rangeEnd ? (rangeStart <= rangeEnd ? [rangeStart, rangeEnd] : [rangeEnd, rangeStart]) : [null, null]

  const title = monthFmt.format(view)
  const inView = (d: Date | null) => !!d && d.getMonth() === view.getMonth() && d.getFullYear() === view.getFullYear()
  const picked = props.mode === 'range' ? props.value.start : (props.value as Date | null)
  const anchorKey = dateKey(inView(picked) ? picked! : inView(today) ? today : view)

  return (
    <div className={cn('w-full max-w-[380px] select-none', className)}>
      <div className="mb-5 flex items-center justify-between gap-2">
        <div key={dateKey(view)} className="animate-fade-up text-[24px] leading-none font-bold tracking-tight capitalize">
          {title}
          <span className="ml-2 font-light text-fog">{view.getFullYear()}</span>
        </div>
        <div className="flex items-center gap-2">
          <IconButton icon="chevronLeft" label="Попередній місяць" onClick={() => shift(-1)} />
          <IconButton icon="chevronRight" label="Наступний місяць" onClick={() => shift(1)} />
        </div>
      </div>

      <div className="mb-2 grid grid-cols-7 text-center text-[12px] font-bold tracking-[0.08em] text-fog uppercase">
        {weekdayLabels.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>

      <div
        ref={grid}
        role="grid"
        aria-label={`${title} ${view.getFullYear()}`}
        onKeyDown={onKey}
        onMouseLeave={() => setHover(null)}
        className="grid grid-cols-7 gap-1.5"
      >
        {cells.map((d) => {
          const inMonth = d.getMonth() === view.getMonth()
          const key = dateKey(d)
          const isToday = sameDay(d, today)
          const mark = marks[key]
          const single = props.mode !== 'range' && sameDay(d, props.value as Date | null)
          const isEdge = props.mode === 'range' && (sameDay(d, lo) || sameDay(d, hi))
          const inRange = !!lo && !!hi && d > lo && d < hi
          const selected = single || isEdge
          return (
            <button
              key={key}
              data-date={key}
              role="gridcell"
              aria-selected={selected}
              aria-current={isToday ? 'date' : undefined}
              aria-label={`${d.getDate()} ${monthFmt.format(d)}${mark ? ', є активність' : ''}`}
              tabIndex={key === anchorKey ? 0 : -1}
              onClick={() => select(d)}
              onMouseEnter={() => setHover(d)}
              className={cn(
                'relative aspect-square rounded-full text-[15px] font-bold tabular-nums',
                'transition-[transform,background-color,color,box-shadow] duration-200 ease-pulse hover:scale-110 active:scale-90',
                !inMonth && 'text-fog/35',
                inMonth && !selected && !inRange && !mark && 'bg-graphite text-paper hover:bg-steel',
                inRange && 'bg-steel text-paper',
                mark && !selected && markStyle[mark],
                selected && 'z-10 scale-105 bg-paper text-night shadow-[0_0_0_3px_var(--color-night),0_0_0_5px_var(--color-paper)]',
                isToday && !selected && 'ring-2 ring-paper ring-inset',
              )}
            >
              {d.getDate()}
              {mark && selected && (
                <span className={cn('absolute bottom-1.5 left-1/2 size-1.5 -translate-x-1/2 rounded-full', mark === 'pulse' ? 'bg-pulse' : mark === 'volt' ? 'bg-volt' : 'bg-signal')} />
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] font-semibold text-fog">
        <Legend color="bg-pulse" label="Ріст" />
        <Legend color="bg-volt" label="Практика" />
        <Legend color="bg-signal" label="Пропуск" />
        <button
          onClick={() => setView(new Date(today.getFullYear(), today.getMonth(), 1))}
          className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-paper transition hover:bg-white/10 active:scale-95"
        >
          <Icon name="calendar" size={14} /> Сьогодні
        </button>
      </div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className={cn('size-3 rounded-full', color)} />
      {label}
    </span>
  )
}

/* ───────────── DatePicker ───────────── */
const longFmt = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })

export function DatePicker({
  value,
  onChange,
  label,
  marks,
}: {
  value: Date | null
  onChange: (d: Date) => void
  label: string
  marks?: Record<string, MarkTone>
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="px-1 text-[12px] font-bold tracking-[0.08em] text-fog uppercase">{label}</span>
      <Popover
        panelClassName="p-6 w-[min(92vw,420px)]"
        trigger={({ open, toggle, props }) => (
          <button
            onClick={toggle}
            {...props}
            className={cn(
              'flex h-14 w-full min-w-64 items-center gap-3 rounded-field bg-graphite px-5 text-left ring-1 ring-inset transition-[box-shadow] duration-200 active:scale-[0.99]',
              open ? 'ring-2 ring-volt-glow' : 'ring-white/10 hover:ring-white/25',
            )}
          >
            <Icon name="calendar" size={20} className="text-fog" />
            <span className={cn('flex-1 text-[16px]', value ? 'text-paper' : 'text-fog/60')}>
              {value ? longFmt.format(value) : 'Оберіть дату'}
            </span>
            <Icon name="chevronDown" size={20} className={cn('text-fog transition-transform duration-300 ease-spring', open && 'rotate-180')} />
          </button>
        )}
      >
        {(close) => (
          <Calendar
            marks={marks}
            value={value}
            onChange={(d) => {
              onChange(d)
              close()
            }}
          />
        )}
      </Popover>
    </div>
  )
}
