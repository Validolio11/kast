import { useId, useState, type ReactNode } from 'react'
import { IconButton, Tile, type TileTone } from './core'
import { cn, useInView, useSize } from './utils'

export interface Point {
  label: string
  value: number
}

const INK = {
  paper: '#f4f4f2',
  fog: '#a1a1a6',
  volt: '#8f5bff',
  voltDeep: '#5a2bd1',
  steel: '#3a3a3c',
}

function smoothPath(pts: [number, number][]) {
  if (pts.length < 2) return ''
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`
  }
  return d
}

function ChartTip({ x, children, width }: { x: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(x, 64), Math.max(64, width - 64))
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-field bg-paper px-3.5 py-2 text-[13px] leading-tight font-bold whitespace-nowrap text-night shadow-xl transition-[left] duration-100 ease-out"
      style={{ left }}
    >
      {children}
    </div>
  )
}

function useActive(count: number) {
  const [active, setActive] = useState<number | null>(null)
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      setActive((a) => (a === null ? 0 : Math.min(count - 1, a + 1)))
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setActive((a) => (a === null ? count - 1 : Math.max(0, a - 1)))
    } else if (e.key === 'Escape') setActive(null)
  }
  return { active, setActive, onKeyDown }
}

/* ───────────── ChartCard ───────────── */
export function ChartCard({
  title,
  subtitle,
  tone = 'graphite',
  right,
  children,
  table,
  className,
}: {
  title: string
  subtitle?: string
  tone?: TileTone
  right?: ReactNode
  children: ReactNode
  table?: { columns: string[]; rows: (string | number)[][] }
  className?: string
}) {
  const [asTable, setAsTable] = useState(false)
  const onLight = tone === 'volt' || tone === 'pulse' || tone === 'paper'
  return (
    <Tile tone={tone} className={cn('flex flex-col gap-5', className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className={cn('text-[12px] font-bold tracking-[0.08em] uppercase', onLight ? 'opacity-75' : 'text-fog')}>{title}</h3>
          {subtitle && <p className="mt-1 text-[24px] leading-tight font-light tracking-tight">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {right}
          {table && (
            <IconButton
              icon="table"
              label={asTable ? 'Показати графік' : 'Показати таблицю'}
              tone={onLight ? 'night' : 'steel'}
              active={asTable}
              onClick={() => setAsTable((v) => !v)}
            />
          )}
        </div>
      </div>
      {table && asTable ? (
        <div className="animate-fade-in overflow-x-auto">
          <table className="w-full text-left text-[14px]">
            <thead>
              <tr className={cn('text-[12px] tracking-[0.08em] uppercase', onLight ? 'opacity-70' : 'text-fog')}>
                {table.columns.map((c) => (
                  <th key={c} className="pb-2 font-bold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {table.rows.map((r, i) => (
                <tr key={i} className="border-t border-current/15">
                  {r.map((c, j) => (
                    <td key={j} className="py-2 font-semibold">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </Tile>
  )
}

/* ───────────── AreaChart ───────────── */
export function AreaChart({
  data,
  height = 200,
  onVolt = false,
  unit = '',
  summary,
}: {
  data: Point[]
  height?: number
  onVolt?: boolean
  unit?: string
  summary: string
}) {
  const [wrap, { width }] = useSize<HTMLDivElement>()
  const { active, setActive, onKeyDown } = useActive(data.length)
  const gid = useId()
  const padT = 44
  const padB = 26
  const padX = 4
  const values = data.map((d) => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = (width - padX * 2) / (data.length - 1)
  const pts: [number, number][] = data.map((d, i) => [
    padX + i * step,
    padT + (1 - (d.value - min) / span) * (height - padT - padB - 8) + 4,
  ])
  const line = smoothPath(pts)
  const stroke = onVolt ? '#ffffff' : INK.volt
  const base = height - padB

  return (
    <div ref={wrap} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <>
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={summary}
            tabIndex={0}
            onKeyDown={onKeyDown}
            onBlur={() => setActive(null)}
            onPointerMove={(e) => {
              const x = e.clientX - e.currentTarget.getBoundingClientRect().left
              setActive(Math.max(0, Math.min(data.length - 1, Math.round((x - padX) / step))))
            }}
            onPointerLeave={() => setActive(null)}
            className="overflow-visible rounded-field"
          >
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={stroke} stopOpacity={onVolt ? 0.32 : 0.4} />
                <stop offset="1" stopColor={stroke} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${line} L${pts[pts.length - 1][0]},${base} L${pts[0][0]},${base} Z`} fill={`url(#${gid})`} className="animate-fade-in" />
            {active !== null && (
              <rect x={pts[active][0] - step / 2} y={padT - 18} width={step} height={base - padT + 18} rx={8} fill={onVolt ? '#fff' : INK.volt} opacity={0.14} />
            )}
            <path d={line} pathLength={1} strokeDasharray={1} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinecap="round" className="animate-draw" />
            {active !== null && (
              <circle cx={pts[active][0]} cy={pts[active][1]} r={7} fill={stroke} stroke={onVolt ? '#6408fa' : '#1c1c1e'} strokeWidth={3} />
            )}
            {data.map((d, i) =>
              i % Math.ceil(data.length / 7) === 0 || i === data.length - 1 ? (
                <text
                  key={d.label}
                  x={pts[i][0]}
                  y={height - 6}
                  textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
                  className="text-[11px] font-semibold"
                  fill={onVolt ? 'rgba(255,255,255,0.75)' : INK.fog}
                >
                  {d.label}
                </text>
              ) : null,
            )}
          </svg>
          {active !== null && (
            <ChartTip x={pts[active][0]} width={width}>
              <span className="mr-2 opacity-60">{data[active].label}</span>
              {data[active].value}
              {unit}
            </ChartTip>
          )}
        </>
      )}
    </div>
  )
}

/* ───────────── BarChart ───────────── */
export function BarChart({
  data,
  height = 220,
  unit = '',
  summary,
  initialActive,
}: {
  data: Point[]
  height?: number
  unit?: string
  summary: string
  initialActive?: number
}) {
  const [wrap, { width }] = useSize<HTMLDivElement>()
  const [view, inView] = useInView<HTMLDivElement>()
  const { active: hover, setActive, onKeyDown } = useActive(data.length)
  const [pinned, setPinned] = useState<number | null>(initialActive ?? null)
  const active = hover ?? pinned
  const padT = 40
  const padB = 26
  const padL = 30
  const max = Math.max(...data.map((d) => d.value))
  const niceMax = Math.ceil(max / 10) * 10 || 10
  const slot = (width - padL) / data.length
  const bw = Math.min(40, slot * 0.62)
  const base = height - padB
  const y = (v: number) => padT + (1 - v / niceMax) * (base - padT)

  return (
    <div
      ref={(el) => {
        wrap.current = el
        view.current = el
      }}
      className="relative w-full"
      style={{ height }}
    >
      {width > 0 && (
        <>
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={summary}
            tabIndex={0}
            onKeyDown={onKeyDown}
            onBlur={() => setActive(null)}
            onPointerLeave={() => setActive(null)}
          >
            {[0, 0.5, 1].map((t) => (
              <g key={t}>
                <line x1={padL} x2={width} y1={y(niceMax * t)} y2={y(niceMax * t)} stroke="#fff" strokeOpacity={t === 0 ? 0.25 : 0.08} strokeDasharray={t === 0 ? undefined : '2 5'} />
                <text x={0} y={y(niceMax * t) + 4} className="text-[11px] font-semibold" fill={INK.fog}>
                  {Math.round(niceMax * t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const x = padL + i * slot + (slot - bw) / 2
              const top = y(d.value)
              const h = base - top
              const r = Math.min(8, bw / 2, h)
              const on = active === i
              return (
                <g key={d.label}>
                  <rect
                    x={padL + i * slot}
                    y={padT - 20}
                    width={slot}
                    height={base - padT + 20}
                    fill="transparent"
                    onPointerEnter={() => setActive(i)}
                    onClick={() => setPinned((p) => (p === i ? null : i))}
                    className="cursor-pointer"
                  />
                  <path
                    d={`M${x},${base} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + bw - r},${top} Q${x + bw},${top} ${x + bw},${top + r} L${x + bw},${base} Z`}
                    fill={on ? INK.volt : INK.steel}
                    className="pointer-events-none"
                    style={{
                      transformBox: 'fill-box',
                      transformOrigin: '50% 100%',
                      transform: `scaleY(${inView ? 1 : 0})`,
                      transition: `transform 800ms var(--ease-pulse) ${i * 45}ms, fill 200ms`,
                    }}
                  />
                  <text x={x + bw / 2} y={height - 6} textAnchor="middle" className="text-[11px] font-semibold" fill={on ? INK.paper : INK.fog}>
                    {d.label}
                  </text>
                </g>
              )
            })}
          </svg>
          {active !== null && (
            <ChartTip x={padL + active * slot + slot / 2} width={width}>
              <span className="mr-2 opacity-60">{data[active].label}</span>
              {data[active].value}
              {unit}
            </ChartTip>
          )}
        </>
      )}
    </div>
  )
}

/* ───────────── LineChart (кілька серій) ───────────── */
export interface Series {
  name: string
  values: number[]
  /** paper — факт, fog — план/пунктир, volt — прогноз */
  tone: 'paper' | 'fog' | 'volt'
  dashed?: boolean
}
const seriesColor = { paper: INK.paper, fog: INK.fog, volt: INK.volt }

export function LineChart({
  labels,
  series,
  height = 240,
  unit = '',
  summary,
}: {
  labels: string[]
  series: Series[]
  height?: number
  unit?: string
  summary: string
}) {
  const [wrap, { width }] = useSize<HTMLDivElement>()
  const { active, setActive, onKeyDown } = useActive(labels.length)
  const padT = 48
  const padB = 26
  const padL = 30
  const all = series.flatMap((s) => s.values)
  const min = Math.floor(Math.min(...all) / 10) * 10
  const max = Math.ceil(Math.max(...all) / 10) * 10
  const step = (width - padL - 6) / (labels.length - 1)
  const x = (i: number) => padL + i * step
  const y = (v: number) => padT + (1 - (v - min) / (max - min || 1)) * (height - padT - padB)

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Легенда">
        {series.map((s) => (
          <li key={s.name} className="flex items-center gap-2 text-[13px] font-semibold text-fog">
            <svg width="22" height="6" aria-hidden>
              <line x1="1" x2="21" y1="3" y2="3" stroke={seriesColor[s.tone]} strokeWidth="3" strokeLinecap="round" strokeDasharray={s.dashed ? '1 6' : undefined} />
            </svg>
            {s.name}
          </li>
        ))}
      </ul>
      <div ref={wrap} className="relative w-full" style={{ height }}>
        {width > 0 && (
          <>
            <svg
              width={width}
              height={height}
              role="img"
              aria-label={summary}
              tabIndex={0}
              onKeyDown={onKeyDown}
              onBlur={() => setActive(null)}
              onPointerMove={(e) => {
                const px = e.clientX - e.currentTarget.getBoundingClientRect().left
                setActive(Math.max(0, Math.min(labels.length - 1, Math.round((px - padL) / step))))
              }}
              onPointerLeave={() => setActive(null)}
            >
              {[0, 0.5, 1].map((t) => {
                const v = min + (max - min) * t
                return (
                  <g key={t}>
                    <line x1={padL} x2={width} y1={y(v)} y2={y(v)} stroke="#fff" strokeOpacity={0.08} strokeDasharray="2 5" />
                    <text x={0} y={y(v) + 4} className="text-[11px] font-semibold" fill={INK.fog}>
                      {Math.round(v)}
                    </text>
                  </g>
                )
              })}
              {active !== null && <line x1={x(active)} x2={x(active)} y1={padT - 20} y2={height - padB} stroke="#fff" strokeOpacity={0.3} />}
              {series.map((s) => {
                const d = smoothPath(s.values.map((v, i) => [x(i), y(v)] as [number, number]))
                return s.dashed ? (
                  <path key={s.name} d={d} fill="none" stroke={seriesColor[s.tone]} strokeWidth={2} strokeLinecap="round" strokeDasharray="1 7" className="animate-fade-in" />
                ) : (
                  <path key={s.name} d={d} pathLength={1} strokeDasharray={1} fill="none" stroke={seriesColor[s.tone]} strokeWidth={2.5} strokeLinecap="round" className="animate-draw" />
                )
              })}
              {active !== null &&
                series.map((s) => (
                  <circle key={s.name} cx={x(active)} cy={y(s.values[active])} r={6} fill={seriesColor[s.tone]} stroke="#1c1c1e" strokeWidth={3} />
                ))}
              {labels.map((l, i) =>
                i % Math.ceil(labels.length / 7) === 0 || i === labels.length - 1 ? (
                  <text key={l} x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'} className="text-[11px] font-semibold" fill={INK.fog}>
                    {l}
                  </text>
                ) : null,
              )}
            </svg>
            {active !== null && (
              <ChartTip x={x(active)} width={width}>
                <div className="mb-1 opacity-60">{labels[active]}</div>
                {series.map((s) => (
                  <div key={s.name} className="flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ background: s.tone === 'paper' ? '#090a0a' : seriesColor[s.tone] }} />
                    {s.name}: {s.values[active]}
                    {unit}
                  </div>
                ))}
              </ChartTip>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ───────────── DonutChart ───────────── */
export interface Slice {
  name: string
  value: number
}
const sliceColors = [INK.volt, INK.paper, INK.fog, INK.voltDeep]

export function DonutChart({
  data,
  size = 200,
  centerLabel = 'Усього',
  unit = '',
}: {
  data: Slice[]
  size?: number
  centerLabel?: string
  unit?: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const [ref, inView] = useInView<HTMLDivElement>()
  const total = data.reduce((a, b) => a + b.value, 0)
  const thickness = 20
  const r = 50 - thickness / 2 - 3
  const gap = 1.4
  let acc = 0
  const arcs = data.map((d) => {
    const len = (d.value / total) * 100
    const start = acc
    acc += len
    return { len, start }
  })

  return (
    <div ref={ref} className="flex flex-wrap items-center gap-8">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" width={size} height={size} className="-rotate-90" role="img" aria-label={`Розподіл: ${data.map((d) => `${d.name} ${d.value}${unit}`).join(', ')}`}>
          {arcs.map((a, i) => (
            <circle
              key={data[i].name}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              pathLength={100}
              stroke={sliceColors[i % sliceColors.length]}
              strokeWidth={active === i ? thickness + 4 : thickness}
              strokeDasharray={`${inView ? Math.max(0, a.len - gap) : 0} 100`}
              strokeDashoffset={-a.start}
              opacity={active === null || active === i ? 1 : 0.35}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              className="cursor-pointer"
              style={{ transition: 'stroke-dasharray 1100ms var(--ease-pulse), stroke-width 200ms, opacity 200ms' }}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-[36px] leading-none font-bold tracking-[-0.04em] tabular-nums">
              {active === null ? total : data[active].value}
              <span className="text-[18px] font-medium text-fog">{unit}</span>
            </div>
            <div className="mt-1 max-w-24 text-[12px] font-semibold text-fog">{active === null ? centerLabel : data[active].name}</div>
          </div>
        </div>
      </div>
      <ul className="flex min-w-48 flex-1 flex-col gap-1">
        {data.map((d, i) => (
          <li
            key={d.name}
            onPointerEnter={() => setActive(i)}
            onPointerLeave={() => setActive(null)}
            className={cn('flex items-center gap-3 rounded-field px-3 py-2 transition-colors duration-200', active === i && 'bg-steel/60')}
          >
            <span className="size-3 rounded-full" style={{ background: sliceColors[i % sliceColors.length] }} />
            <span className="flex-1 text-[15px] font-semibold">{d.name}</span>
            <span className="text-[15px] font-bold tabular-nums">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
