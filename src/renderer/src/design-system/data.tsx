import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { Counter } from './core'
import { cn, useInView } from './utils'

/* ───────────── HatchProgress ───────────── */
export type HatchTone = 'dark' | 'steel' | 'pulse' | 'volt'
const hatchTone: Record<HatchTone, { track: string; line: string; text: string; sub: string }> = {
  dark: { track: 'bg-graphite', line: '#13f287', text: 'text-paper', sub: 'text-fog' },
  steel: { track: 'bg-steel', line: '#a1a1a6', text: 'text-paper', sub: 'text-paper/70' },
  pulse: { track: 'bg-pulse', line: '#090a0a', text: 'text-night', sub: 'text-night/70' },
  volt: { track: 'bg-volt', line: '#ffffff', text: 'text-white', sub: 'text-white/75' },
}

export function HatchProgress({
  value,
  label,
  tone = 'dark',
  size = 'tile',
  className,
}: {
  value: number
  label?: string
  tone?: HatchTone
  size?: 'bar' | 'tile'
  className?: string
}) {
  const t = hatchTone[tone]
  const [ref, inView] = useInView<HTMLDivElement>()
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div
      ref={ref}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? 'Прогрес'}
      className={cn(
        'group relative overflow-hidden rounded-capsule',
        t.track,
        size === 'tile' ? 'h-28 md:h-32' : 'h-12',
        className,
      )}
    >
      <div
        className="hatch absolute inset-y-0 left-0 transition-[width] duration-[1400ms] ease-pulse group-hover:before:[animation:hatch_1.2s_linear_infinite]"
        style={
          {
            width: inView ? `${pct}%` : '0%',
            '--hatch': t.line,
            clipPath: pct < 100 ? 'polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%)' : undefined,
          } as CSSProperties
        }
      />
      {size === 'tile' && (
        <div className={cn('absolute inset-y-0 right-8 flex flex-col items-end justify-center', t.text)}>
          <Counter value={pct} suffix="%" className="text-[44px] leading-none font-bold tracking-[-0.04em] md:text-[56px]" />
          {label && <span className={cn('mt-1 text-[16px] font-medium md:text-[20px]', t.sub)}>{label}</span>}
        </div>
      )}
    </div>
  )
}

/* ───────────── RingGauge ───────────── */
export type RingTone = 'pulse' | 'volt' | 'signal' | 'paper'
const ringColor: Record<RingTone, string> = {
  pulse: '#13f287',
  volt: '#8f5bff',
  signal: '#ff4d4f',
  paper: '#f4f4f2',
}

export function RingGauge({
  value,
  tone = 'pulse',
  size = 120,
  thickness = 9,
  children,
  label,
}: {
  value: number
  tone?: RingTone
  size?: number
  thickness?: number
  children?: ReactNode
  label?: string
}) {
  const [ref, inView] = useInView<HTMLDivElement>()
  const r = 50 - thickness / 2
  const C = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value))
  const color = ringColor[tone]
  return (
    <div
      ref={ref}
      role="img"
      aria-label={label ?? `${Math.round(pct)}%`}
      className="@container relative inline-grid shrink-0 place-items-center"
      style={{ width: size, maxWidth: '100%', aspectRatio: 1 }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} className="size-full -rotate-90 overflow-visible">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#3a3a3c" strokeWidth={thickness} />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={inView ? C * (1 - pct / 100) : C}
          style={{
            transition: 'stroke-dashoffset 1400ms var(--ease-pulse)',
          }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}

/* ───────────── TickDial ───────────── */
export function TickDial({
  progress,
  tone = 'volt',
  size = 240,
  children,
}: {
  progress: number
  tone?: 'volt' | 'pulse' | 'signal'
  size?: number
  children?: ReactNode
}) {
  const color = ringColor[tone]
  const segments = 5
  const lit = Math.round(Math.max(0, Math.min(1, progress)) * segments)
  const [ref, inView] = useInView<HTMLDivElement>()
  return (
    <div
      ref={ref}
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden="true">
        {Array.from({ length: segments }, (_, i) => {
          const start = ((-90 + i * 72 + 9) * Math.PI) / 180
          const end = start + (54 * Math.PI) / 180
          const point = (angle: number) => `${50 + 42 * Math.cos(angle)} ${50 + 42 * Math.sin(angle)}`
          return (
            <path
              key={i}
              d={`M ${point(start)} A 42 42 0 0 1 ${point(end)}`}
              fill="none"
              stroke={inView && i < lit ? color : 'var(--color-steel)'}
              strokeWidth={9}
              strokeLinecap="round"
              className="transition-[stroke] duration-300 ease-pulse"
            />
          )
        })}
      </svg>
      <div className="relative z-10 text-center" aria-live="polite" aria-atomic="true">{children}</div>
    </div>
  )
}

/* ───────────── ActivityMap ───────────── */
export interface ActivityDay { date: string; minutes: number }

const activityColors = ['bg-steel/60', 'bg-pulse/20', 'bg-pulse/40', 'bg-pulse/70', 'bg-pulse']
const activityDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export function ActivityMap({ days, endDate = new Date(), weeks = 16 }: { days: ActivityDay[]; endDate?: Date; weeks?: number }) {
  const columns = Math.max(1, Math.floor(weeks))
  const weekday = (endDate.getDay() + 6) % 7
  const lastDay = (columns - 1) * 7 + weekday
  const values = new Map(days.map((day) => [day.date, Math.max(0, day.minutes)]))
  const dates = Array.from({ length: columns * 7 }, (_, i) => {
    const date = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() - lastDay + i)
    const key = activityDateKey(date)
    return { date, key, minutes: values.get(key) ?? 0 }
  })
  const [focused, setFocused] = useState(lastDay)
  const [hovered, setHovered] = useState<number | null>(null)
  const [hasFocus, setHasFocus] = useState(false)
  const [keyboard, setKeyboard] = useState(false)
  const cells = useRef<Array<HTMLButtonElement | null>>([])
  const helpId = useId()
  const focusIndex = Math.min(focused, lastDay)
  const selected = dates[keyboard && hasFocus ? focusIndex : hovered ?? (hasFocus ? focusIndex : lastDay)]
  const month = new Intl.DateTimeFormat('uk-UA', { month: 'short' })
  const dateLabel = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long' })
  const fullDate = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })
  const gridStyle = { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }

  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index
    if (event.key === 'ArrowLeft') next -= 7
    else if (event.key === 'ArrowRight') next += 7
    else if (event.key === 'ArrowUp' && index % 7 > 0) next -= 1
    else if (event.key === 'ArrowDown' && index % 7 < 6) next += 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = lastDay
    else if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    setKeyboard(true)
    next = Math.max(0, Math.min(lastDay, next))
    setHovered(null)
    cells.current[next]?.focus()
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3 text-[12px] font-semibold text-fog">
        <span>{columns} тижнів активності</span>
        <span>{selected.minutes} хв</span>
      </div>
      <div className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-2 gap-y-2">
        <div className="col-start-2 grid gap-1 text-[10px] font-semibold text-fog" style={gridStyle} aria-hidden="true">
          {Array.from({ length: columns }, (_, i) => (
            <span key={i}>{i === 0 || dates[i * 7].date.getMonth() !== dates[(i - 1) * 7].date.getMonth() ? month.format(dates[i * 7].date) : ''}</span>
          ))}
        </div>
        <div className="grid grid-rows-7 gap-1 text-[10px] font-semibold text-fog" aria-hidden="true">
          {['Пн', '', 'Ср', '', 'Пт', '', ''].map((day, i) => <span key={i} className="flex items-center">{day}</span>)}
        </div>
        <div
          role="group"
          aria-label={`Карта активності за ${columns} тижнів`}
          aria-describedby={helpId}
          className="grid grid-flow-col grid-rows-7 gap-1"
          style={gridStyle}
          onPointerLeave={() => setHovered(null)}
          onPointerMove={() => setKeyboard(false)}
          onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setHasFocus(false) }}
        >
          {dates.map((day, i) => {
            const level = day.minutes > 0 ? Math.min(4, Math.ceil(day.minutes / 20)) : 0
            if (i > lastDay) return <span key={day.key} className="aspect-square rounded-[5px] bg-steel/20" aria-hidden="true" />
            return (
              <button
                key={day.key}
                ref={(element) => { cells.current[i] = element }}
                type="button"
                tabIndex={i === focusIndex ? 0 : -1}
                aria-label={`${fullDate.format(day.date)}${i === lastDay ? ', сьогодні' : ''}: ${day.minutes} хв практики`}
                aria-current={i === lastDay ? 'date' : undefined}
                title={`${dateLabel.format(day.date)}: ${day.minutes} хв практики`}
                onPointerEnter={() => setHovered(i)}
                onFocus={() => { setFocused(i); setHovered(null); setHasFocus(true) }}
                onKeyDown={(event) => navigate(event, i)}
                className={cn(
                  'aspect-square min-w-0 rounded-[5px] transition-shadow duration-150 hover:ring-2 hover:ring-inset hover:ring-paper',
                  activityColors[level],
                  i === lastDay && 'ring-1 ring-inset ring-paper/70',
                )}
              />
            )
          })}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-fog">
        <time dateTime={selected.key}>{selected.key === activityDateKey(endDate) ? 'Сьогодні' : dateLabel.format(selected.date)}</time>
        <span className="inline-flex items-center gap-1.5" aria-label="Насиченість кольору показує хвилини практики: від 0 до понад 60">
          Менше
          {activityColors.map((color) => <span key={color} className={cn('size-2.5 rounded-[3px]', color)} aria-hidden="true" />)}
          Більше
        </span>
      </div>
      <p id={helpId} className="sr-only">Стрілки вгору й униз — дні, вліво й вправо — тижні. Home та End — початок і кінець карти.</p>
    </div>
  )
}

/* ───────────── Sparkline ───────────── */
export function Sparkline({
  data,
  tone = 'pulse',
  width = 120,
  height = 40,
}: {
  data: number[]
  tone?: RingTone
  width?: number
  height?: number
}) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * (width - 6) + 3,
    height - 4 - ((v - min) / (max - min || 1)) * (height - 8),
  ])
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]
  return (
    <svg width={width} height={height} aria-hidden>
      <path d={d} fill="none" stroke={ringColor[tone]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} className="animate-draw" />
      <circle cx={last[0]} cy={last[1]} r="4" fill={ringColor[tone]} stroke="#1c1c1e" strokeWidth="2" />
    </svg>
  )
}
