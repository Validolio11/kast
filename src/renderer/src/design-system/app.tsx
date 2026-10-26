/*
 * Щільний шар Karkas Pulse для робочого інтерфейсу.
 * Усі сторінки збираються з тих самих блоків: PageHeader → CaptureBar → ListGroup/ListRow → Banner.
 * Однакове місце й анатомія кожного блоку = менше пошуку очима.
 */
import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { Icon, KMark, type IconName } from './Icon'
import { cn } from './utils'

/* ───────────── TitleBar ───────────── */
/** Верхня смуга 40px: тягне вікно; кнопки Windows малює система (titleBarOverlay) */
export function TitleBar({ children }: { children?: ReactNode }) {
  return (
    <div className="drag flex h-10 shrink-0 items-center gap-2.5 pr-[140px] pl-4">
      <span className="grid size-6 place-items-center rounded-[7px] bg-paper text-night">
        <KMark size={14} />
      </span>
      <span className="text-[13px] font-extrabold tracking-[0.08em] uppercase">Kast</span>
      <div className="no-drag ml-auto flex items-center gap-2">{children}</div>
    </div>
  )
}

/* ───────────── NavRail ───────────── */
export interface NavItem<T extends string> {
  id: T
  label: string
  icon: IconName
  /** Нейтральна мета-цифра (не червоний бейдж) */
  meta?: string
  shortcut?: string
}

export function NavRail<T extends string>({
  items,
  active,
  onSelect,
  footer,
}: {
  items: NavItem<T>[]
  active: T
  onSelect: (id: T) => void
  footer?: ReactNode
}) {
  return (
    <nav aria-label="Розділи" className="flex w-[208px] shrink-0 flex-col gap-1 px-3 pt-2 pb-3 max-[900px]:w-[68px]">
      {items.map((it) => {
        const on = it.id === active
        return (
          <button
            key={it.id}
            onClick={() => onSelect(it.id)}
            aria-current={on ? 'page' : undefined}
            title={it.shortcut ? `${it.label}  ${it.shortcut}` : it.label}
            className={cn(
              'group flex h-11 items-center gap-3 rounded-row px-3 text-left text-[14px] font-semibold transition-colors duration-150',
              on ? 'bg-graphite text-paper' : 'text-fog hover:bg-hover hover:text-paper',
            )}
          >
            <span
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-full transition-colors duration-200',
                on ? 'bg-paper text-night' : 'text-current',
              )}
            >
              <Icon name={it.icon} size={16} />
            </span>
            <span className="flex-1 truncate max-[900px]:hidden">{it.label}</span>
            {it.meta && (
              <span className="text-[12px] font-bold text-fog-2 tabular-nums max-[900px]:hidden">{it.meta}</span>
            )}
          </button>
        )
      })}
      <div className="mt-auto flex flex-col gap-1">{footer}</div>
    </nav>
  )
}

export function NavButton({ icon, label, onClick, badge }: { icon: IconName; label: string; onClick: () => void; badge?: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="flex h-11 items-center gap-3 rounded-row px-3 text-left text-[14px] font-semibold text-fog transition-colors hover:bg-hover hover:text-paper"
    >
      <span className="relative grid size-7 shrink-0 place-items-center">
        <Icon name={icon} size={16} />
        {badge && <span className="absolute top-0.5 right-0.5 grid">{badge}</span>}
      </span>
      <span className="flex-1 truncate max-[900px]:hidden">{label}</span>
    </button>
  )
}

/* ───────────── PageHeader ───────────── */
export function PageHeader({ title, subtitle, meta }: { title: string; subtitle?: ReactNode; meta?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[22px] leading-tight font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 truncate text-[13px] font-semibold text-fog">{subtitle}</p>}
      </div>
      {meta && <div className="shrink-0 pb-0.5 text-[13px] font-bold text-fog tabular-nums">{meta}</div>}
    </header>
  )
}

/* ───────────── CaptureBar ───────────── */
export interface CaptureBarProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onSubmit'> {
  icon?: IconName
  onSubmit: (value: string) => void
  /** Підказка праворуч, коли поле порожнє (наприклад, Ctrl+N) */
  hint?: string
  /** Поле-фільтр: без кнопки відправлення */
  search?: boolean
}

export const CaptureBar = forwardRef<HTMLInputElement, CaptureBarProps>(function CaptureBar(
  { icon = 'plus', onSubmit, hint, search, className, value, ...rest },
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
        'group flex h-12 items-center gap-3 rounded-full bg-graphite pr-2 pl-4 ring-1 ring-white/8 ring-inset',
        'transition-[box-shadow] duration-200 focus-within:ring-2 focus-within:ring-volt-glow hover:ring-white/15',
        className,
      )}
    >
      <Icon name={icon} size={18} className="shrink-0 text-fog transition-colors group-focus-within:text-paper" />
      <input
        ref={ref}
        value={value}
        className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-medium text-paper outline-none placeholder:text-fog-2"
        {...rest}
      />
      {has && !search ? (
        <button
          type="submit"
          aria-label="Додати"
          className="grid size-8 shrink-0 animate-pop place-items-center rounded-full bg-paper text-night transition active:scale-90"
        >
          <Icon name="enter" size={16} />
        </button>
      ) : (
        hint && <Kbd className="mr-1.5">{hint}</Kbd>
      )}
    </form>
  )
})

/* ───────────── Kbd ───────────── */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-6 items-center rounded-[7px] border border-white/10 bg-night px-1.5 font-sans text-[11px] font-bold text-fog',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

/* ───────────── ListGroup ───────────── */
export function ListGroup({
  label,
  count,
  collapsible,
  defaultOpen = true,
  action,
  children,
}: {
  label: string
  count?: number | string
  collapsible?: boolean
  defaultOpen?: boolean
  action?: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const head = (
    <>
      <span className="text-[11px] font-bold tracking-[0.08em] text-fog uppercase">{label}</span>
      {count !== undefined && <span className="text-[11px] font-bold text-fog-2 tabular-nums">{count}</span>}
      {collapsible && (
        <Icon name="chevronDown" size={14} className={cn('text-fog-2 transition-transform duration-200', !open && '-rotate-90')} />
      )}
    </>
  )
  return (
    <section className="flex flex-col">
      <div className="flex h-8 items-center gap-2 px-3">
        {collapsible ? (
          <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-2 rounded-md">
            {head}
          </button>
        ) : (
          head
        )}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {(!collapsible || open) && <div className="flex flex-col">{children}</div>}
    </section>
  )
}

/* ───────────── ListRow ───────────── */
export function ListRow({
  leading,
  title,
  sub,
  meta,
  actions,
  onClick,
  selected,
  muted,
  struck,
}: {
  leading?: ReactNode
  title: ReactNode
  sub?: ReactNode
  meta?: ReactNode
  /** Дії з'являються при наведенні або фокусі всередині рядка */
  actions?: ReactNode
  onClick?: () => void
  selected?: boolean
  muted?: boolean
  struck?: boolean
}) {
  return (
    <div
      className={cn(
        'group relative flex min-h-11 animate-row-in items-center gap-3 rounded-row px-3 transition-colors duration-150',
        selected ? 'bg-graphite' : 'hover:bg-hover',
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
      <div className="min-w-0 flex-1 py-2.5">
        <div
          className={cn(
            'truncate text-[15px] leading-snug font-medium',
            muted && 'text-fog',
            struck && 'text-fog line-through decoration-fog-2/60',
          )}
        >
          {title}
        </div>
        {sub && <div className="mt-0.5 truncate text-[13px] font-medium text-fog">{sub}</div>}
      </div>
      {actions && (
        <div
          className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      )}
      {meta && (
        <div className="flex shrink-0 items-center gap-2 text-[13px] font-semibold text-fog" onClick={(e) => e.stopPropagation()}>
          {meta}
        </div>
      )}
    </div>
  )
}

/* ───────────── RowCheck ───────────── */
export function RowCheck({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'grid size-[22px] place-items-center rounded-[7px] transition-[background-color,box-shadow,transform] duration-200 active:scale-90',
        checked ? 'animate-check-pop bg-pulse text-night' : 'text-transparent ring-2 ring-steel ring-inset hover:ring-fog hover:text-fog-2',
      )}
    >
      <Icon name="check" size={14} strokeWidth={3} />
    </button>
  )
}

/* ───────────── RowAction ───────────── */
export function RowAction({
  icon,
  label,
  onClick,
  tone = 'ghost',
}: {
  icon: IconName
  label: string
  onClick: () => void
  tone?: 'ghost' | 'danger'
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'grid size-8 place-items-center rounded-full text-fog transition-colors duration-150 active:scale-90',
        tone === 'danger' ? 'hover:bg-signal/15 hover:text-signal' : 'hover:bg-white/10 hover:text-paper',
      )}
    >
      <Icon name={icon} size={16} />
    </button>
  )
}

/* ───────────── CycleChip ───────────── */
export interface ChipOption<T extends string> {
  value: T
  label: string
  icon: IconName
}

/** Один клік перемикає на наступний варіант — менше кроків, ніж випадний список */
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
  const empty = i === 0
  return (
    <button
      onClick={() => onChange(options[(i + 1) % options.length].value)}
      aria-label={`${label}: ${cur.label}. Натисніть, щоб змінити`}
      title={label}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-bold transition-colors duration-150 active:scale-95',
        empty ? 'text-fog-2 ring-1 ring-white/10 ring-inset hover:text-paper hover:ring-white/25' : 'bg-steel/70 text-paper hover:bg-steel',
      )}
    >
      <Icon name={cur.icon} size={13} />
      {cur.label}
    </button>
  )
}

/* ───────────── ChipGroup ───────────── */
export function ChipGroup<T extends string>({
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
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-bold transition-colors duration-150 active:scale-95',
              on ? 'bg-paper text-night' : 'bg-graphite text-fog hover:text-paper',
            )}
          >
            <Icon name={o.icon} size={15} />
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ───────────── Banner ───────────── */
/** Контекстна стрічка: одна думка, одна дія */
export function Banner({
  icon,
  title,
  text,
  action,
  tone = 'graphite',
}: {
  icon: IconName
  title: string
  text?: ReactNode
  action?: ReactNode
  tone?: 'graphite' | 'volt'
}) {
  return (
    <div
      className={cn(
        'flex animate-fade-up items-center gap-4 rounded-field p-3 pl-4',
        tone === 'volt' ? 'bg-volt text-white' : 'bg-graphite',
      )}
    >
      <span
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-full',
          tone === 'volt' ? 'bg-white/15' : 'bg-steel/70',
        )}
      >
        <Icon name={icon} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold tracking-tight">{title}</div>
        {text && <div className={cn('text-[13px] font-medium', tone === 'volt' ? 'text-white/75' : 'text-fog')}>{text}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/* ───────────── EmptyState ───────────── */
export function EmptyState({ icon, title, text, children }: { icon: IconName; title: string; text?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex animate-fade-up flex-col items-center px-6 py-12 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-graphite text-fog">
        <Icon name={icon} size={24} />
      </span>
      <h3 className="mt-4 text-[17px] font-bold tracking-tight">{title}</h3>
      {text && <p className="mt-1.5 max-w-sm text-[14px] font-medium text-fog">{text}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  )
}

/* ───────────── SyncDot ───────────── */
export type SyncState = 'local' | 'synced' | 'syncing' | 'offline' | 'error'
const syncMap: Record<SyncState, { label: string; dot: string; icon: IconName }> = {
  local: { label: 'Лише на цьому ПК', dot: 'bg-fog-2', icon: 'cloudOff' },
  synced: { label: 'Синхронізовано', dot: 'bg-pulse', icon: 'cloud' },
  syncing: { label: 'Синхронізую…', dot: 'bg-volt-glow animate-pulse', icon: 'refresh' },
  offline: { label: 'Офлайн — збережено локально', dot: 'bg-fog', icon: 'cloudOff' },
  error: { label: 'Помилка синхронізації', dot: 'bg-signal', icon: 'cloudOff' },
}

export function SyncDot({ state }: { state: SyncState }) {
  const s = syncMap[state]
  return (
    <span className="relative inline-grid size-2 place-items-center" title={s.label} aria-label={s.label} role="img">
      <span className={cn('size-2 rounded-full', s.dot)} />
    </span>
  )
}
export const syncLabel = (s: SyncState) => syncMap[s].label

/* ───────────── UpdatePill ───────────── */
export function UpdatePill({ version, onClick }: { version: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={`Встановити версію ${version}`}
      className="mb-1 flex h-11 animate-pop items-center gap-3 rounded-row bg-pulse px-3 text-left text-[13px] font-bold text-night transition hover:brightness-110 active:scale-[0.98]"
    >
      <span className="grid size-7 shrink-0 place-items-center">
        <Icon name="download" size={16} />
      </span>
      <span className="flex-1 leading-tight max-[900px]:hidden">
        Оновлення готове
        <span className="block text-[11px] font-semibold text-night/65">Перезапустити</span>
      </span>
    </button>
  )
}

/* ───────────── WeekStrip ───────────── */
export function WeekStrip({ days }: { days: { label: string; count: number; today?: boolean; future?: boolean }[] }) {
  const max = Math.max(1, ...days.map((d) => d.count))
  return (
    <div className="grid grid-cols-7 gap-2" role="list" aria-label="Зроблено за тиждень">
      {days.map((d) => (
        <div
          key={d.label}
          role="listitem"
          aria-label={`${d.label}: ${d.count}`}
          className={cn('relative flex h-20 flex-col justify-between overflow-hidden rounded-field p-2.5', d.today ? 'bg-steel' : 'bg-graphite')}
        >
          <span
            aria-hidden
            className="hatch absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-pulse"
            style={{ height: `${(d.count / max) * 100}%`, ['--hatch' as string]: d.today ? 'rgb(19 242 135 / 0.35)' : 'rgb(255 255 255 / 0.12)' }}
          />
          <span className={cn('relative text-[11px] font-bold tracking-[0.08em] uppercase', d.today ? 'text-paper' : 'text-fog')}>
            {d.label}
          </span>
          <span className={cn('relative text-[22px] leading-none font-bold tracking-tight tabular-nums', d.future && 'text-fog-2')}>
            {d.future ? '·' : d.count}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ───────────── SettingRow ───────────── */
export function SettingRow({ icon, title, text, children }: { icon: IconName; title: string; text?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-b border-line py-4 last:border-0">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-steel/60 text-paper">
        <Icon name={icon} size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold tracking-tight">{title}</div>
        {text && <div className="text-[13px] font-medium text-fog">{text}</div>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  )
}

/* ───────────── InlineChoice ───────────── */
/** Компактний вибір у рядку списку: 2–3 варіанти, один клік */
export function InlineChoice<T extends string>({
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
  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 gap-1 rounded-full bg-night p-1">
      {options.map((c) => {
        const on = value === c.value
        return (
          <button
            key={c.value}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(c.value)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-bold transition-colors',
              on ? 'bg-paper text-night' : 'text-fog hover:text-paper',
            )}
          >
            <Icon name={c.icon} size={13} />
            {c.label}
          </button>
        )
      })}
    </div>
  )
}
