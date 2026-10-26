import { forwardRef, useRef, useState, type CSSProperties, type InputHTMLAttributes, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { cn, useUid } from './utils'

/* ───────────── TextField ───────────── */
export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  error?: string
  icon?: IconName
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, icon, className, id, disabled, 'aria-describedby': describedBy, ...rest },
  ref,
) {
  const uid = useUid('tf')
  const fid = id ?? uid
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={fid} className="px-1 text-[12px] font-bold tracking-[0.08em] text-fog uppercase">
        {label}
      </label>
      <div
        className={cn(
          'group flex h-14 items-center gap-3 rounded-field bg-graphite px-5 ring-1 ring-inset transition-[box-shadow,background-color] duration-200 ease-pulse',
          error ? 'ring-signal' : 'ring-white/10 focus-within:ring-2 focus-within:ring-volt-glow hover:ring-white/25',
          disabled && 'cursor-not-allowed opacity-40',
        )}
      >
        {icon && <Icon name={icon} size={20} className="text-fog transition-colors group-focus-within:text-paper" />}
        <input
          ref={ref}
          id={fid}
          disabled={disabled}
          aria-invalid={!!error || undefined}
          aria-describedby={[describedBy, error || hint ? `${fid}-msg` : undefined].filter(Boolean).join(' ') || undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-medium text-paper outline-none placeholder:text-fog/60"
          {...rest}
        />
      </div>
      {(error || hint) && (
        <p id={`${fid}-msg`} className={cn('px-1 text-[13px]', error ? 'font-semibold text-signal' : 'text-fog')}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
})

/* ───────────── SearchPill ───────────── */
export function SearchPill({
  label,
  value,
  onChange,
  onSubmit,
  onBack,
  placeholder = 'Шукати…',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onSubmit?: (v: string) => void
  onBack?: () => void
  placeholder?: string
}) {
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit?.(value)
      }}
      className="flex items-center gap-3 rounded-capsule bg-paper p-2.5 pr-2.5 text-night shadow-[0_10px_40px_-18px_rgba(244,244,242,0.4)] transition-shadow duration-300 focus-within:shadow-[0_10px_50px_-12px_rgba(143,91,255,0.7)]"
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Назад"
          className="grid size-12 shrink-0 place-items-center rounded-full bg-night/8 transition duration-200 hover:bg-night/15 active:scale-90"
        >
          <Icon name="undo" size={20} />
        </button>
      )}
      <label className="flex min-w-0 flex-1 flex-col px-3">
        <span className="text-[12px] font-semibold text-night/55">{label}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 bg-transparent text-[18px] font-bold tracking-tight outline-none placeholder:text-night/30"
        />
      </label>
      <button
        type="submit"
        aria-label="Шукати"
        className="grid size-14 shrink-0 place-items-center rounded-full bg-night text-paper transition duration-200 hover:scale-105 active:scale-90"
      >
        <Icon name="search" size={22} />
      </button>
    </form>
  )
}

/* ───────────── Toggle ───────────── */
export function Toggle({
  checked,
  onChange,
  label,
  showState = true,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  showState?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-10 w-[84px] shrink-0 items-center rounded-full px-1.5 text-[13px] font-bold',
        'transition-colors duration-300 ease-pulse active:scale-95',
        checked ? 'bg-pulse text-night' : 'bg-steel text-fog',
      )}
    >
      {showState && (
        <span className={cn('absolute transition-all duration-300', checked ? 'left-4 opacity-100' : 'right-4 opacity-100')}>
          {checked ? 'Увімк' : 'Вимк'}
        </span>
      )}
      <span
        className={cn(
          'relative z-10 size-7 rounded-full shadow-md transition-[transform,background-color] duration-300 ease-spring',
          checked ? 'translate-x-[44px] bg-night' : 'translate-x-0 bg-paper',
        )}
      />
    </button>
  )
}

/* ───────────── Stepper ───────────── */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 24,
  unit,
  label,
  size = 'lg',
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  unit?: string
  label: string
  /** sm — компактний варіант для рядків налаштувань */
  size?: 'sm' | 'lg'
}) {
  const sm = size === 'sm'
  return (
    <div role="group" aria-label={label} className={cn('flex items-center', sm ? 'gap-2' : 'gap-4')}>
      <StepBtn sm={sm} icon="minus" label="Менше" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} />
      <div className={cn('text-center', sm ? 'min-w-12' : 'min-w-16')}>
        <div
          key={value}
          className={cn('animate-pop leading-none font-bold tabular-nums', sm ? 'text-[17px] tracking-tight' : 'text-[48px] tracking-[-0.04em]')}
        >
          {value}
          {sm && unit}
        </div>
        {unit && !sm && <div className="mt-1 text-[13px] font-semibold text-fog">{unit}</div>}
      </div>
      <StepBtn sm={sm} icon="plus" label="Більше" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} />
    </div>
  )
}
function StepBtn({ icon, label, sm, ...rest }: { icon: IconName; label: string; sm?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'grid place-items-center bg-steel text-paper transition duration-200 ease-pulse hover:bg-paper hover:text-night active:scale-90 disabled:opacity-30 disabled:hover:bg-steel disabled:hover:text-paper',
        sm ? 'size-9 rounded-full' : 'size-14 rounded-field',
      )}
      {...rest}
    >
      <Icon name={icon} size={sm ? 16 : 24} />
    </button>
  )
}

/* ───────────── Slider ───────────── */
export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  format = (v: number) => `${v}`,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  label: string
  format?: (v: number) => string
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-bold tracking-[0.08em] text-fog uppercase">{label}</span>
        <span className="text-[24px] font-bold tracking-[-0.04em] tabular-nums">{format(value)}</span>
      </div>
      <input
        type="range"
        aria-label={label}
        aria-valuetext={format(value)}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="pulse-range"
        style={{ '--p': `${pct}%` } as CSSProperties}
      />
    </div>
  )
}

/* ───────────── Checkbox / Radio ───────────── */
export function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group flex items-center gap-3 text-left text-[15px] font-semibold active:scale-[0.98]"
    >
      <span
        className={cn(
          'grid size-7 place-items-center rounded-[10px] transition-all duration-200 ease-spring',
          checked ? 'scale-100 bg-paper text-night' : 'bg-steel text-transparent group-hover:bg-[#4a4a4d]',
        )}
      >
        <Icon name="check" size={16} strokeWidth={3} />
      </span>
      {children}
    </button>
  )
}

export function RadioGroup<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; hint?: string }[]
  label: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const onKey = (event: React.KeyboardEvent) => {
    if (!options.length) return
    const direction = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 0
    if (!direction && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (selectedIndex + direction + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKey} className="flex flex-col gap-2">
      {options.map((o, index) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            ref={(element) => { refs.current[index] = element }}
            role="radio"
            aria-checked={on}
            tabIndex={index === selectedIndex ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex items-center gap-4 rounded-field px-4 py-3 text-left transition-all duration-200 ease-pulse active:scale-[0.98]',
              on ? 'bg-paper text-night' : 'bg-graphite text-paper hover:bg-steel/60',
            )}
          >
            <span
              className={cn(
                'grid size-6 place-items-center rounded-full border-2 transition-colors',
                on ? 'border-night' : 'border-fog',
              )}
            >
              <span className={cn('size-3 rounded-full bg-night transition-transform duration-200 ease-spring', on ? 'scale-100' : 'scale-0')} />
            </span>
            <span className="flex flex-col">
              <span className="text-[15px] font-bold">{o.label}</span>
              {o.hint && <span className={cn('text-[13px]', on ? 'text-night/60' : 'text-fog')}>{o.hint}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ───────────── SegmentedControl ───────────── */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label: string
  className?: string
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: React.KeyboardEvent) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!options.length || (!dir && e.key !== 'Home' && e.key !== 'End')) return
    e.preventDefault()
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : (index + dir + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKey}
      className={cn('relative inline-grid rounded-full bg-graphite p-1.5', className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
    >
      <span
        aria-hidden
        className="absolute top-1.5 bottom-1.5 left-1.5 rounded-full bg-paper transition-transform duration-300 ease-spring"
        style={{
          width: `calc((100% - 12px) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          ref={(el) => {
            refs.current[i] = el
          }}
          role="radio"
          aria-checked={o.value === value}
          tabIndex={i === index ? 0 : -1}
          onClick={() => onChange(o.value)}
          className={cn(
            'relative z-10 h-10 rounded-full px-5 text-[14px] font-bold transition-colors duration-200',
            o.value === value ? 'text-night' : 'text-fog hover:text-paper',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ───────────── Tabs ───────────── */
export function Tabs({
  tabs,
  label,
}: {
  tabs: { id: string; label: string; icon?: IconName; content: ReactNode }[]
  label: string
}) {
  const [active, setActive] = useState(tabs[0]?.id)
  const idx = Math.max(0, tabs.findIndex((t) => t.id === active))
  const activeId = tabs[idx]?.id
  const uid = useUid('tabs')
  const onKey = (e: React.KeyboardEvent) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!tabs.length || (!dir && e.key !== 'Home' && e.key !== 'End')) return
    e.preventDefault()
    const next = tabs[e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (idx + dir + tabs.length) % tabs.length]
    setActive(next.id)
    document.getElementById(`${uid}-${next.id}`)?.focus()
  }
  return (
    <div>
      <div role="tablist" aria-label={label} onKeyDown={onKey} className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => {
          const on = t.id === activeId
          return (
            <button
              key={t.id}
              type="button"
              id={`${uid}-${t.id}`}
              role="tab"
              aria-selected={on}
              aria-controls={`${uid}-${t.id}-panel`}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(t.id)}
              className={cn(
                'flex h-11 shrink-0 items-center gap-2 rounded-full px-5 text-[14px] font-bold transition-all duration-300 ease-pulse active:scale-95',
                on ? 'bg-paper text-night' : 'bg-graphite text-fog hover:bg-steel hover:text-paper',
              )}
            >
              {t.icon && <Icon name={t.icon} size={16} />}
              {t.label}
            </button>
          )
        })}
      </div>
      {tabs.map(
        (t) =>
          t.id === activeId && (
            <div
              key={t.id}
              id={`${uid}-${t.id}-panel`}
              role="tabpanel"
              aria-labelledby={`${uid}-${t.id}`}
              tabIndex={0}
              className="mt-5 animate-fade-up"
            >
              {t.content}
            </div>
          ),
      )}
    </div>
  )
}

/* ───────────── SwipeToStart ───────────── */
export function SwipeToStart({
  label = 'Почати практику',
  doneLabel = 'Розпочато',
  onComplete,
}: {
  label?: string
  doneLabel?: string
  onComplete?: () => void
}) {
  const track = useRef<HTMLDivElement>(null)
  const [x, setX] = useState(0)
  const [drag, setDrag] = useState(false)
  const [done, setDone] = useState(false)
  const KNOB = 64
  const maxX = () => (track.current?.clientWidth ?? 300) - KNOB - 16

  const finish = () => {
    setDrag(false)
    if (x >= maxX() * 0.85) {
      setX(maxX())
      setDone(true)
      onComplete?.()
      setTimeout(() => {
        setDone(false)
        setX(0)
      }, 1800)
    } else setX(0)
  }

  return (
    <div
      ref={track}
      className="relative flex h-20 touch-none items-center overflow-hidden rounded-capsule bg-night p-2 select-none"
    >
      <div
        className="pointer-events-none absolute inset-y-0 left-0 rounded-capsule bg-pulse/15"
        style={{ width: x + KNOB + 16, transition: drag ? 'none' : 'width 400ms var(--ease-pulse)' }}
      />
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round((x / maxX()) * 100)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            setX(maxX())
            setDone(true)
            onComplete?.()
            setTimeout(() => {
              setDone(false)
              setX(0)
            }, 1800)
          }
        }}
        onPointerDown={(e) => {
          if (done) return
          e.currentTarget.setPointerCapture(e.pointerId)
          setDrag(true)
        }}
        onPointerMove={(e) => {
          if (!drag || !track.current) return
          const rect = track.current.getBoundingClientRect()
          setX(Math.min(maxX(), Math.max(0, e.clientX - rect.left - 8 - KNOB / 2)))
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        className={cn(
          'relative z-10 grid size-16 shrink-0 cursor-grab place-items-center rounded-full bg-paper text-night active:cursor-grabbing',
          done && 'bg-pulse',
        )}
        style={{
          transform: `translateX(${x}px) scale(${drag ? 1.06 : 1})`,
          transition: drag ? 'none' : 'transform 450ms var(--ease-spring), background-color 200ms',
        }}
      >
        <Icon name={done ? 'check' : 'play'} size={24} />
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-2 text-[16px] leading-none font-bold">
        <span className="relative inline-flex items-center">
          {done ? doneLabel : label}
          {!done && (
            <span className="absolute left-full ml-2 inline-flex items-center -space-x-1.5" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <Icon
                  key={i}
                  name="chevronRight"
                  size={18}
                  className="animate-chevrons text-paper"
                  style={{ animationDelay: `${i * 160}ms` }}
                />
              ))}
            </span>
          )}
        </span>
      </div>
    </div>
  )
}
