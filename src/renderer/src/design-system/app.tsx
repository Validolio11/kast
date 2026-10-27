/*
 * Karkas Pulse для Kast: чорне полотно, капсули, цифра — герой, зелений лише для росту.
 * Кожна сторінка збирається однаково: PageHead (два рядки великими) → PageGrid (колонка 400px + основна).
 * Джерело токенів і правил — дизайн-система «Karkas Pulse» у конструкторі.
 */
import { forwardRef, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type InputHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './Icon'
import { cn } from './utils'

/* ───────────── Знак ───────────── */
/** Блоковий K на колі paper — знак Kast у тій самій формі, що й знак Karkas */
export function KastMark({ size = 44 }: { size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-paper text-ink" style={{ width: size, height: size }}>
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M3 2h7v7h3V2h8v7l-4 4 4 4v5h-8v-7h-3v7H3z" />
      </svg>
    </span>
  )
}

/* ───────────── Шапка ───────────── */
export interface NavTab<T extends string> {
  id: T
  label: string
  /** Нейтральна цифра поруч (не червоний бейдж) */
  count?: number
  tip?: string
}

/** Шапка 76px: знак, вкладки-капсули по центру, дії й кнопки вікна праворуч. Порожні місця тягнуть вікно. */
export function AppHeader<T extends string>({
  tabs,
  active,
  onSelect,
  actions,
  windowControls,
}: {
  tabs: NavTab<T>[]
  active: T
  onSelect: (id: T) => void
  actions?: ReactNode
  windowControls?: ReactNode
}) {
  return (
    <header className="drag grid min-h-[76px] shrink-0 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-4 py-4 pr-4 pl-6 select-none">
      <KastMark />
      <nav aria-label="Розділи" className="flex justify-center gap-1">
        {tabs.map((t) => {
          const on = t.id === active
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              aria-current={on ? 'page' : undefined}
              data-tip={t.tip}
              className={cn(
                'no-drag inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-5 text-[15px] whitespace-nowrap transition-colors duration-150 max-[900px]:px-4',
                on ? 'bg-paper font-extrabold text-ink' : 'font-semibold text-grey hover:bg-tile hover:text-paper',
              )}
            >
              {t.label}
              {!!t.count && <span className={cn('text-[13px] font-bold tabular-nums', on ? 'text-paper-muted' : 'text-muted')}>{t.count}</span>}
            </button>
          )
        })}
      </nav>
      <div className="no-drag flex items-center justify-end gap-2">
        {actions}
        {windowControls}
      </div>
    </header>
  )
}

export function WindowControls({
  maximized,
  onMinimize,
  onToggleMaximize,
  onClose,
}: {
  maximized: boolean
  onMinimize: () => void
  onToggleMaximize: () => void
  onClose: () => void
}) {
  const btn = 'grid size-9 place-items-center rounded-full text-soft transition-colors hover:bg-steel hover:text-white'
  return (
    <div className="ml-2 flex shrink-0 items-center gap-0.5 rounded-[26px] bg-tile p-1">
      <button className={btn} onClick={onMinimize} aria-label="Згорнути">
        <Icon name="minus" size={16} />
      </button>
      <button className={btn} onClick={onToggleMaximize} aria-label={maximized ? 'Відновити' : 'Розгорнути'}>
        <Icon name={maximized ? 'copy' : 'square'} size={14} />
      </button>
      <button className={cn(btn, 'hover:bg-behind')} onClick={onClose} aria-label="Закрити у трей">
        <Icon name="x" size={16} />
      </button>
    </div>
  )
}

/** Кругла кнопка-іконка 44/56px */
export function RoundButton({
  icon,
  label,
  onClick,
  badge,
  size = 44,
  tone = 'tile',
}: {
  icon: IconName
  label: string
  onClick: () => void
  badge?: ReactNode
  size?: 44 | 56
  tone?: 'tile' | 'paper' | 'paper-line'
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      data-tip={label}
      className={cn(
        'relative grid shrink-0 place-items-center rounded-full transition-[background-color,transform] duration-150 active:scale-[0.97]',
        tone === 'tile' && 'bg-tile text-paper hover:bg-steel',
        tone === 'paper' && 'bg-paper text-ink hover:bg-white',
        tone === 'paper-line' && 'bg-paper-line text-ink hover:bg-[#d8d8d6]',
      )}
      style={{ width: size, height: size }}
    >
      <Icon name={icon} size={size === 56 ? 20 : 18} />
      {badge && <span className="absolute right-px bottom-px grid">{badge}</span>}
    </button>
  )
}

/* ───────────── Сторінка ───────────── */
/**
 * Заголовок сторінки: два рядки великими — тонкий над жирним.
 * Покращення до Pulse: розмір тягнеться від 44 до 80px за шириною й висотою вікна,
 * щоб на ноутбуці заголовок не з'їдав половину екрана.
 */
export function PageHead({ light, heavy, sub, actions }: { light: string; heavy: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex animate-enter items-start justify-between gap-5">
      <div className="flex min-w-0 flex-col items-start gap-3.5">
        <h1 className="text-[clamp(44px,min(6vw,9vh),80px)] leading-[0.92] tracking-[-0.035em] uppercase">
          <span className="block font-light">{light}</span>
          <span className="block font-extrabold">{heavy}</span>
        </h1>
        {sub && <div className="text-[14px] font-bold text-grey">{sub}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>}
    </div>
  )
}

/** Сітка Pulse: ліва колонка 400px і основна; вужче 1040px — одна колонка */
export function PageGrid({ side, main, fill }: { side: ReactNode; main: ReactNode; fill?: boolean }) {
  return (
    <div
      className={cn(
        'grid min-w-0 grid-cols-[400px_minmax(0,1fr)] items-start gap-6 max-[1039px]:grid-cols-1',
        fill && 'items-stretch',
      )}
    >
      {/* fill: ліва колонка не розтягує рядок (h-0), а займає рівно висоту основної */}
      <div className={cn('enter-stagger flex min-w-0 flex-col gap-3 [--enter-base:80ms]', fill && 'min-[1040px]:h-0 min-[1040px]:min-h-full')}>
        {side}
      </div>
      {/* Перший список у колонці починається без верхнього відступу — рівно з полем ліворуч */}
      <div className={cn('enter-stagger flex min-w-0 flex-col gap-3 [--enter-base:160ms] [&>section:first-child>h2]:mt-0')}>
        {main}
      </div>
    </div>
  )
}

/* ───────────── Поле запису ───────────── */
export interface CaptureFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onSubmit'> {
  icon?: IconName
  onSubmit: (value: string) => void
  /** Поле-фільтр: без кнопки відправлення */
  search?: boolean
  /** Кругла paper-кнопка праворуч, коли поле порожнє (наприклад, «Нова нотатка») */
  action?: { icon: IconName; label: string; onClick: () => void }
}

/** Капсула 56px на tile: пишеш і Enter. Фокус — внутрішня зелена обвідка, як у пошуку Karkas. */
export const CaptureField = forwardRef<HTMLInputElement, CaptureFieldProps>(function CaptureField(
  { icon = 'plus', onSubmit, search, action, className, value, ...rest },
  ref,
) {
  const has = typeof value === 'string' && value.trim().length > 0
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (has) onSubmit((value as string).trim())
      }}
      className={cn(
        'group flex h-14 shrink-0 items-center gap-3 rounded-full bg-tile pr-1.5 pl-5 transition-shadow duration-150',
        'focus-within:shadow-[inset_0_0_0_2px_var(--color-growth)]',
        className,
      )}
    >
      <Icon name={icon} size={18} className="shrink-0 text-grey" />
      <input
        ref={ref}
        value={value}
        className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-semibold text-paper caret-growth outline-none placeholder:text-muted"
        {...rest}
      />
      {has && !search ? (
        <button
          type="submit"
          aria-label="Додати"
          className="grid size-11 shrink-0 animate-pop place-items-center rounded-full bg-paper text-ink transition active:scale-90"
        >
          <Icon name="arrowRight" size={18} />
        </button>
      ) : (
        action && (
          <button
            type="button"
            onClick={action.onClick}
            aria-label={action.label}
            data-tip={action.label}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-paper text-ink transition active:scale-90"
          >
            <Icon name={action.icon} size={18} />
          </button>
        )
      )}
    </form>
  )
})

/* ───────────── Картка ───────────── */
export type CardTone = 'tile' | 'paper' | 'growth' | 'data' | 'steel' | 'outline'
const cardTone: Record<CardTone, string> = {
  tile: 'bg-tile text-white',
  paper: 'bg-paper text-ink',
  growth: 'bg-growth text-ink',
  data: 'bg-data text-white',
  steel: 'bg-steel text-white',
  outline: 'text-paper shadow-[inset_0_0_0_1px_var(--color-tile)]',
}

export function Card({ tone = 'tile', className, children, style }: { tone?: CardTone; className?: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <section className={cn('relative overflow-hidden rounded-card p-6', cardTone[tone], className)} style={style}>
      {children}
    </section>
  )
}

/** Заголовок списку 22px/800 з тихою цифрою */
export function ListTitle({
  children,
  count,
  collapsible,
  open = true,
  onToggle,
}: {
  children: ReactNode
  count?: ReactNode
  collapsible?: boolean
  open?: boolean
  onToggle?: () => void
}) {
  const inner = (
    <>
      {children}
      {count !== undefined && <span className="text-[15px] font-bold text-muted tabular-nums">{count}</span>}
      {collapsible && <Icon name="chevronDown" size={18} className={cn('text-muted transition-transform duration-200', !open && '-rotate-90')} />}
    </>
  )
  return (
    <h2 className="mt-4 mb-1 ml-2 flex items-center gap-2.5 text-[22px] font-extrabold tracking-[-0.02em]">
      {collapsible ? (
        <button onClick={onToggle} aria-expanded={open} className="flex items-center gap-2.5 rounded-full">
          {inner}
        </button>
      ) : (
        inner
      )}
    </h2>
  )
}

/** Група зі згортанням: заголовок і рядки */
export function ListSection({
  title,
  count,
  collapsible,
  defaultOpen = true,
  first,
  children,
}: {
  title: string
  count?: ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
  /** Перша група на сторінці — без верхнього відступу */
  first?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={cn('flex flex-col gap-2', first && '[&>h2]:mt-0')}>
      <ListTitle count={count} collapsible={collapsible} open={open} onToggle={() => setOpen((o) => !o)}>
        {title}
      </ListTitle>
      {(!collapsible || open) && children}
    </section>
  )
}

/* ───────────── Рядок задачі ───────────── */
/** Капсула 60px з тонкою обвідкою tile; дії з'являються при наведенні */
export function PulseRow({
  leading,
  title,
  sub,
  meta,
  actions,
  onClick,
  done,
  selected,
  muted,
  age,
}: {
  leading?: ReactNode
  title: ReactNode
  sub?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  onClick?: () => void
  done?: boolean
  selected?: boolean
  muted?: boolean
  /** Старіння: маленька шкала перед мета-даними (value 0…1) і підказка з кількістю днів */
  age?: { value: number; tip: string }
}) {
  return (
    <div
      className={cn(
        'group row-enter relative flex min-h-[60px] items-center gap-3.5 rounded-[30px] pr-4 pl-3.5 transition-colors duration-150',
        selected ? 'bg-steel' : 'shadow-[inset_0_0_0_1px_var(--color-tile)] hover:bg-tile',
        onClick && 'cursor-pointer',
      )}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && e.target === e.currentTarget && e.key === 'Enter') onClick()
      }}
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? 'button' : undefined}
    >
      {leading && (
        <div className="flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
          {leading}
        </div>
      )}
      <div className="min-w-0 flex-1 py-3">
        <div className={cn('truncate text-[15px] font-semibold text-white', muted && 'text-grey', done && 'text-muted line-through decoration-violet decoration-2')}>
          {title}
        </div>
        {sub && <div className="mt-0.5 truncate text-[13px] font-semibold text-muted">{sub}</div>}
      </div>
      {actions && (
        <div
          className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      )}
      {(meta || age) && (
        <div className="flex shrink-0 items-center gap-2 text-[13px] font-semibold text-muted" onClick={(e) => e.stopPropagation()}>
          {age && <AgeScale {...age} />}
          {meta}
        </div>
      )}
    </div>
  )
}

/**
 * Шкала старіння: маленька заокруглена капсула з фіолетовою штриховкою Hatch.
 * Заповнюється з віком задачі; останні дні перед «Колись» штрихи рухаються. Без червоного «прострочено».
 */
function AgeScale({ value, tip }: { value: number; tip: string }) {
  const v = Math.max(0, Math.min(1, value))
  return (
    <span role="img" aria-label={tip} data-tip={tip} className="mr-1 grid h-[30px] items-center">
      <span className="relative block h-3 w-20 overflow-hidden rounded-full bg-tile">
        <Hatch value={Math.max(v, 0.08) * 100} color="var(--color-violet)" live={v >= 0.85} />
      </span>
    </span>
  )
}

/** Кругла галочка 32px: порожня — обвідка steel, виконано — paper */
export function CheckCircle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'grid size-8 place-items-center rounded-full transition-[background-color,box-shadow,color] duration-200 active:scale-90',
        checked
          ? 'animate-check-pop bg-paper text-ink'
          : 'text-transparent shadow-[inset_0_0_0_2px_var(--color-steel)] hover:text-muted hover:shadow-[inset_0_0_0_2px_var(--color-paper)]',
      )}
    >
      <Icon name="check" size={16} strokeWidth={3} />
    </button>
  )
}

export function RowAction({ icon, label, onClick, tone = 'ghost' }: { icon: IconName; label: string; onClick: () => void; tone?: 'ghost' | 'danger' }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      data-tip={label}
      className={cn(
        'grid h-11 w-9 place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-tile hover:text-paper',
        tone === 'danger' && 'hover:text-danger-text',
      )}
    >
      <Icon name={icon} size={17} />
    </button>
  )
}

/* ───────────── Чипи ───────────── */
export type PulseChipTone = 'canvas' | 'steel' | 'growth' | 'data' | 'behind' | 'paper' | 'tile' | 'outline'
const chipTone: Record<PulseChipTone, string> = {
  canvas: 'bg-canvas text-white',
  steel: 'bg-steel text-white',
  growth: 'bg-growth text-ink',
  data: 'bg-data text-white',
  behind: 'bg-behind text-ink',
  paper: 'bg-paper text-ink',
  tile: 'bg-tile text-soft',
  outline: 'text-muted shadow-[inset_0_0_0_1px_var(--color-steel)]',
}

/** Чип 30px: стан або надзаголовок картки (з крапкою кольору змісту) */
export function PulseChip({
  tone = 'canvas',
  dot,
  icon,
  children,
  className,
}: {
  tone?: PulseChipTone
  dot?: string
  icon?: IconName
  children: ReactNode
  className?: string
}) {
  return (
    <span className={cn('inline-flex h-[30px] items-center gap-2 rounded-chip px-3 text-[13px] font-extrabold whitespace-nowrap', chipTone[tone], className)}>
      {dot && <span className="size-2 rounded-full" style={{ background: dot }} />}
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  )
}

export interface ChipOption<T extends string> {
  value: T
  label: string
  icon: IconName
}

/** Чип, що одним кліком перемикає на наступний варіант */
export function CycleChip<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: ChipOption<T>[]
  onChange: (v: T) => void
  label: string
}) {
  const i = Math.max(0, options.findIndex((o) => o.value === value))
  const cur = options[i]
  return (
    <button
      onClick={() => onChange(options[(i + 1) % options.length].value)}
      aria-label={`${label}: ${cur.label}. Натисніть, щоб змінити`}
      data-tip={label}
      className={cn(
        'inline-flex h-[30px] items-center gap-1.5 rounded-chip px-3 text-[13px] font-extrabold transition-colors duration-150 active:scale-95',
        i === 0 ? 'text-muted shadow-[inset_0_0_0_1px_var(--color-steel)] hover:text-paper' : 'bg-canvas text-white hover:bg-steel',
      )}
    >
      <Icon name={cur.icon} size={14} />
      {cur.label}
    </button>
  )
}

/* ───────────── Перемикачі ───────────── */
/** Перемикач Pulse: група на tile, вкладки 40px, вибрана — paper */
export function SegTabs<T extends string>({
  value,
  options,
  onChange,
  label,
  surface = 'tile',
  compact,
}: {
  value: T
  options: { value: T; label: string; icon?: IconName }[]
  onChange: (v: T) => void
  label: string
  surface?: 'tile' | 'canvas'
  /** Вужчі вкладки, щоб 4 варіанти вмістились у колонку 400px */
  compact?: boolean
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('flex w-fit max-w-full flex-wrap gap-1 rounded-[26px] p-1', surface === 'tile' ? 'bg-tile' : 'bg-canvas')}
      onKeyDown={(e) => {
        const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
        if (!dir) return
        e.preventDefault()
        const i = options.findIndex((o) => o.value === value)
        onChange(options[(i + dir + options.length) % options.length].value)
      }}
    >
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex h-10 items-center gap-1.5 rounded-control text-[14px] transition-colors duration-150',
              compact ? 'px-3.5' : 'px-[18px]',
              on ? 'bg-paper font-extrabold text-ink' : 'font-bold text-soft hover:text-white',
            )}
          >
            {o.icon && <Icon name={o.icon} size={15} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Перемикач 56×32: увімкнено — growth */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative h-8 w-14 shrink-0 rounded-2xl transition-colors duration-200', checked ? 'bg-growth' : 'bg-steel')}
    >
      <span
        className={cn(
          'absolute top-1 left-1 size-6 rounded-xl transition-[transform,background-color] duration-[250ms] ease-pulse',
          checked ? 'translate-x-6 bg-canvas' : 'bg-grey',
        )}
      />
    </button>
  )
}

/* ───────────── Штрихування ───────────── */
/**
 * Знак частки шляху: риски 2px з нахилом 10° і кроком 9px.
 * Смуга заповнюється зліва обрізанням за 1,6 с, потім риски біжать на крок за 0,35 с.
 */
export function Hatch({ value, color, live = true }: { value: number; color: string; live?: boolean }) {
  const id = useId().replace(/:/g, '')
  const [still, setStill] = useState(false)
  useEffect(() => setStill(matchMedia('(prefers-reduced-motion: reduce)').matches), [])
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-0 animate-hatch-fill transition-[width] duration-700 ease-pulse"
      style={{ width: `${pct}%` }}
    >
      <svg width="100%" height="100%" className="block">
        <defs>
          <pattern id={id} x="0" width="9" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(10)">
            {live && !still && <animate attributeName="x" from="0" to="9" dur="0.35s" repeatCount="indefinite" />}
            <line x1="1.5" y1="-10" x2="1.5" y2="50" stroke={color} strokeWidth="2" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>
    </div>
  )
}

/** Скляна підкладка над штрихуванням, щоб риски не різали літери */
export function Glass({ children, className, tone = 'tile' }: { children: ReactNode; className?: string; tone?: 'tile' | 'growth' | 'data' }) {
  const bg = { tile: 'rgb(31 31 31 / 0.75)', growth: 'rgb(19 242 135 / 0.75)', data: 'rgb(100 8 250 / 0.75)' }[tone]
  return (
    <span className={cn('relative rounded-[28px] backdrop-blur-[2.5px]', className)} style={{ background: bg }}>
      {children}
    </span>
  )
}

/* ───────────── Стани ───────────── */
/**
 * Інфо-рядок: тихий рядок заввишки з рядок задачі для стану, підсумку чи підказки.
 * Стоїть у правій колонці над списками й замінює великі картки — сторінка не роздувається.
 * progress малює під текстом штрих Pulse на частку шляху; праворуч — значення або одна дія.
 */
export function InfoRow({
  icon,
  title,
  text,
  children,
  tone = 'quiet',
  progress,
  tip,
}: {
  icon: IconName
  title: ReactNode
  text?: ReactNode
  children?: ReactNode
  /** accent — зелена обвідка: стан, що чекає дії (наприклад, «Час закрити день») */
  tone?: 'quiet' | 'accent'
  progress?: number
  tip?: string
}) {
  return (
    <div
      data-tip={tip}
      className={cn(
        'relative flex min-h-[60px] shrink-0 items-center gap-3.5 overflow-hidden rounded-[30px] py-2 pr-2 pl-5',
        tone === 'accent' ? 'shadow-[inset_0_0_0_1px_var(--color-growth)]' : 'shadow-[inset_0_0_0_1px_var(--color-tile)]',
      )}
    >
      {progress !== undefined && progress > 0 && <Hatch value={progress} color="rgb(19 242 135 / 0.28)" />}
      <Icon name={icon} size={18} className={cn('relative shrink-0', tone === 'accent' ? 'text-growth' : 'text-muted')} />
      <p className="relative min-w-0 flex-1 truncate text-[15px] font-semibold text-muted">
        <span className={tone === 'accent' ? 'text-growth' : 'text-white'}>{title}</span>
        {text && <span> · {text}</span>}
      </p>
      {children && <div className="relative flex shrink-0 items-center gap-2 pr-2">{children}</div>}
    </div>
  )
}

/** Тиждень у мініатюрі для інфо-рядка: сім стовпчиків, висота — частка від найкращого дня */
export function MiniWeek({ days }: { days: { label: string; count: number; today?: boolean }[] }) {
  const max = Math.max(1, ...days.map((d) => d.count))
  return (
    <div className="flex h-7 gap-1" role="img" aria-label={days.map((d) => `${d.label} ${d.count}`).join(', ')}>
      {days.map((d) => (
        <span key={d.label} title={`${d.label}: ${d.count}`} className={cn('relative w-2 overflow-hidden rounded-full', d.today ? 'bg-steel' : 'bg-tile')}>
          {d.count > 0 && (
            <span
              className={cn('absolute inset-x-0 bottom-0 rounded-full', d.today ? 'bg-growth' : 'bg-soft')}
              style={{ height: `${30 + (d.count / max) * 70}%` }}
            />
          )}
        </span>
      ))}
    </div>
  )
}

/* ───────────── Синхронізація й оновлення ───────────── */
export type SyncState = 'local' | 'synced' | 'syncing' | 'offline' | 'error'
const syncMap: Record<SyncState, { label: string; dot: string }> = {
  local: { label: 'Лише на цьому ПК', dot: 'bg-muted' },
  synced: { label: 'Синхронізовано', dot: 'bg-growth' },
  syncing: { label: 'Синхронізую…', dot: 'bg-growth animate-pulse' },
  offline: { label: 'Офлайн — збережено локально', dot: 'bg-muted' },
  error: { label: 'Помилка синхронізації', dot: 'bg-behind' },
}

export function SyncDot({ state }: { state: SyncState }) {
  return <span role="img" aria-label={syncMap[state].label} className={cn('size-2.5 rounded-full shadow-[0_0_0_3px_var(--color-canvas)]', syncMap[state].dot)} />
}
export const syncLabel = (s: SyncState) => syncMap[s].label

export function UpdatePill({ version, onClick }: { version: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      data-tip={`Встановити ${version} і перезапустити`}
      className="inline-flex h-11 shrink-0 animate-pop items-center gap-2 rounded-full bg-growth px-5 text-[15px] font-extrabold text-ink transition hover:brightness-110 active:scale-[0.97]"
    >
      <Icon name="download" size={16} />
      Оновити
    </button>
  )
}

/* ───────────── Тиждень ───────────── */
/** Сім днів: висота штрихування — частка від найкращого дня. Зелений — лише сьогодні й лише коли є зроблене. */
export function WeekStrip({ days }: { days: { label: string; count: number; today?: boolean; future?: boolean }[] }) {
  const max = Math.max(1, ...days.map((d) => d.count))
  return (
    <div className="grid grid-cols-7 gap-1.5" role="list" aria-label="Зроблено за тиждень">
      {days.map((d) => {
        const grew = d.today && d.count > 0
        return (
        <div
          key={d.label}
          role="listitem"
          aria-label={`${d.label}: ${d.count}`}
          className={cn(
            'relative flex h-24 flex-col justify-between overflow-hidden rounded-[22px] p-2.5',
            grew ? 'bg-growth text-ink' : d.today ? 'bg-steel' : 'bg-canvas',
          )}
        >
          {d.count > 0 && (
            <div className="absolute inset-x-0 bottom-0" style={{ height: `${(d.count / max) * 100}%` }}>
              <Hatch value={100} color={grew ? 'rgb(9 10 10 / 0.35)' : '#3a3a3c'} live={false} />
            </div>
          )}
          <span className={cn('relative text-[12px] font-bold', grew ? 'text-ink' : d.today ? 'text-white' : 'text-muted')}>{d.label}</span>
          <span className={cn('relative text-[26px] leading-none font-extrabold tracking-[-0.04em] tabular-nums', d.future && 'text-dim')}>
            {d.future ? '·' : d.count}
          </span>
        </div>
        )
      })}
    </div>
  )
}

/* ───────────── Налаштування ───────────── */
export function SettingRow({ title, text, children }: { title: string; text?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-[52px] items-center justify-between gap-3 px-1 py-2">
      <div className="min-w-0">
        <div className="text-[16px] font-bold">{title}</div>
        {text && <div className="mt-0.5 text-[13px] font-semibold text-muted">{text}</div>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  )
}

/* ───────────── ContextMenu ───────────── */
export interface MenuAction {
  label: string
  icon: IconName
  onSelect: () => void
  /** growth — особлива дія; danger — видалення (завжди останнім) */
  tone?: 'default' | 'growth' | 'danger'
  disabled?: boolean
}

/**
 * Темне меню Pulse біля курсора: canvas, радіус 26, пункти 48px з іконкою 20px у круглому бейджі 34px.
 * Закривається Esc, кліком поза ним, прокруткою чи втратою фокусу вікна. ↑ ↓ — пункти, Enter — дія.
 */
export function ContextMenu({
  x,
  y,
  label,
  header,
  items,
  onClose,
}: {
  x: number
  y: number
  label: string
  header?: ReactNode
  items: MenuAction[]
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // Тримаємо меню в межах вікна
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPos({
      left: Math.max(8, Math.min(x, innerWidth - width - 8)),
      top: Math.max(8, y + height > innerHeight - 8 ? y - height : y),
    })
  }, [x, y])

  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    const close = () => onClose()
    // Прокрутка сторінки закриває меню; прокрутка всередині (список шрифтів) — ні
    const scroll = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('scroll', scroll, true)
    document.addEventListener('keydown', key, true)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('scroll', scroll, true)
      document.removeEventListener('keydown', key, true)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
    }
  }, [onClose])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]:not(:disabled)') ?? [])
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    buttons[(i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
  }

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      // Кнопки меню не забирають виділення в редакторі
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) e.preventDefault()
      }}
      onContextMenu={(e) => e.preventDefault()}
      className="no-drag fixed z-[130] flex w-[288px] origin-top-left animate-menu-in flex-col gap-0.5 rounded-[26px] bg-canvas p-1.5 text-white shadow-menu"
      style={pos}
    >
      {header && <div className="mb-1 border-b border-tile px-1 pt-1 pb-2.5">{header}</div>}
      {items.map((it) => (
        <button
          key={it.label}
          role="menuitem"
          disabled={it.disabled}
          onClick={() => {
            it.onSelect()
          }}
          className={cn(
            'group flex h-12 items-center gap-3 rounded-[20px] pr-3.5 pl-1.5 text-left text-[15px] font-bold transition-colors duration-150 hover:bg-tile focus-visible:bg-tile focus-visible:outline-none disabled:opacity-40 disabled:hover:bg-transparent',
            it.tone === 'growth' && 'text-growth',
            it.tone === 'danger' && 'text-danger-text',
          )}
        >
          {/* Іконка 20px у круглому бейджі 34px: колір бейджа повторює зміст дії */}
          <span
            className={cn(
              'grid size-[34px] shrink-0 place-items-center rounded-full transition-colors duration-150',
              it.tone === 'growth'
                ? 'bg-growth text-ink'
                : it.tone === 'danger'
                  ? 'bg-behind/15 text-danger-text group-hover:bg-behind/25'
                  : 'bg-tile text-white group-hover:bg-steel group-focus-visible:bg-steel',
            )}
          >
            <Icon name={it.icon} size={20} />
          </span>
          {it.label}
        </button>
      ))}
    </div>,
    document.body,
  )
}
