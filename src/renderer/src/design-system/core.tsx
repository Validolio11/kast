import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { cn, useInView } from './utils'

/* ───────────── Tile ───────────── */
export type TileTone = 'night' | 'graphite' | 'steel' | 'paper' | 'volt' | 'pulse'
export type TileRadius = 'field' | 'tile' | 'capsule'

const tileTone: Record<TileTone, string> = {
  night: 'bg-night text-paper border border-white/10',
  graphite: 'bg-graphite text-paper',
  steel: 'bg-steel text-paper',
  paper: 'bg-paper text-night',
  volt: 'bg-volt text-white',
  pulse: 'bg-pulse text-night',
}
const tileRadius: Record<TileRadius, string> = {
  field: 'rounded-field',
  tile: 'rounded-tile',
  capsule: 'rounded-capsule',
}

export interface TileProps extends HTMLAttributes<HTMLDivElement> {
  tone?: TileTone
  radius?: TileRadius
  /** Плитка трохи підіймається при наведенні */
  interactive?: boolean
  padded?: boolean
}

export const Tile = forwardRef<HTMLDivElement, TileProps>(function Tile(
  { tone = 'graphite', radius = 'tile', interactive, padded = true, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        tileTone[tone],
        tileRadius[radius],
        padded && 'p-6 md:p-8',
        interactive &&
          'transition-[transform,box-shadow] duration-300 ease-pulse hover:-translate-y-1 hover:shadow-[0_18px_40px_-18px_rgba(143,91,255,0.45)] active:scale-[0.99]',
        className,
      )}
      {...rest}
    />
  )
})

/* ───────────── Button ───────────── */
export type ButtonVariant = 'paper' | 'steel' | 'ghost' | 'pulse' | 'volt' | 'danger' | 'outline'
export type ButtonSize = 'sm' | 'md' | 'lg'

const btnVariant: Record<ButtonVariant, string> = {
  paper: 'bg-paper text-night hover:bg-white',
  steel: 'bg-steel text-paper hover:bg-[#4a4a4d]',
  ghost: 'bg-transparent text-paper hover:bg-white/10',
  pulse: 'bg-pulse text-night hover:brightness-110 hover:shadow-[0_0_28px_-4px_rgba(19,242,135,0.6)]',
  volt: 'bg-volt text-white hover:bg-[#7a2cff] hover:shadow-[0_0_28px_-4px_rgba(143,91,255,0.7)]',
  danger: 'bg-signal text-night hover:brightness-110',
  outline: 'bg-transparent text-paper border border-white/25 hover:border-paper hover:bg-white/5',
}
const btnSize: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-[13px] gap-1.5',
  md: 'h-12 px-6 text-[15px] gap-2',
  lg: 'h-14 px-8 text-base gap-2.5',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  iconLeft?: IconName
  iconRight?: IconName
  fullWidth?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'paper', size = 'md', loading, iconLeft, iconRight, fullWidth, className, children, disabled, ...rest },
  ref,
) {
  const iconSize = size === 'sm' ? 16 : 20
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex select-none items-center justify-center rounded-full font-bold tracking-tight whitespace-nowrap',
        'transition-[transform,background-color,box-shadow,filter,border-color] duration-200 ease-pulse',
        'active:scale-[0.96] disabled:opacity-40 disabled:active:scale-100',
        btnVariant[variant],
        btnSize[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span className="size-4 animate-spin-slow rounded-full border-2 border-current border-t-transparent" />
      ) : (
        iconLeft && <Icon name={iconLeft} size={iconSize} />
      )}
      {children}
      {iconRight && !loading && <Icon name={iconRight} size={iconSize} />}
    </button>
  )
})

/* ───────────── IconButton ───────────── */
export type IconButtonTone = 'steel' | 'paper' | 'night' | 'pulse' | 'volt' | 'signal' | 'ghost'
const ibTone: Record<IconButtonTone, string> = {
  steel: 'bg-steel/70 text-paper hover:bg-steel',
  paper: 'bg-paper text-night hover:bg-white',
  night: 'bg-night text-paper border border-white/10 hover:border-white/40',
  pulse: 'bg-pulse text-night hover:brightness-110',
  volt: 'bg-volt text-white hover:brightness-125',
  signal: 'bg-signal text-night hover:brightness-110',
  ghost: 'bg-transparent text-fog hover:bg-white/10 hover:text-paper',
}
const ibSize = { 44: ['size-11', 20], 56: ['size-14', 24], 64: ['size-16', 24] } as const

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  icon: IconName
  /** Обов'язковий підпис для скрінрідерів */
  label: string
  size?: 44 | 56 | 64
  tone?: IconButtonTone
  /** Активний стан — інверсія: світле коло, темна іконка */
  active?: boolean
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, size = 44, tone = 'steel', active, className, ...rest },
  ref,
) {
  const [box, iconPx] = ibSize[size]
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full',
        'transition-[transform,background-color,color,border-color,filter] duration-200 ease-pulse',
        'enabled:hover:scale-105 enabled:active:scale-90 disabled:opacity-40',
        box,
        ibTone[active ? 'paper' : tone],
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={iconPx} />
    </button>
  )
})

/* ───────────── Chip / Status ───────────── */
export type ChipTone = 'pulse' | 'volt' | 'signal' | 'steel' | 'paper'
const chipTone: Record<ChipTone, string> = {
  pulse: 'bg-pulse text-night',
  volt: 'bg-volt text-white',
  signal: 'bg-signal text-night',
  steel: 'bg-steel text-paper',
  paper: 'bg-paper text-night',
}

export function Chip({
  tone = 'steel',
  icon,
  children,
  className,
}: {
  tone?: ChipTone
  icon?: IconName
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold tracking-tight whitespace-nowrap',
        chipTone[tone],
        className,
      )}
    >
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  )
}

/** Статус з іконкою + текстом: колір ніколи не єдиний носій стану */
export function Status({ kind, children }: { kind: 'ahead' | 'ontrack' | 'behind' | 'plateau'; children: ReactNode }) {
  const map = {
    ontrack: ['pulse', 'trendingUp'],
    ahead: ['volt', 'trendingUp'],
    behind: ['signal', 'trendingDown'],
    plateau: ['steel', 'arrowRight'],
  } as const
  const [tone, icon] = map[kind]
  return (
    <Chip tone={tone} icon={icon}>
      {children}
    </Chip>
  )
}

/* ───────────── Avatar ───────────── */
export function Avatar({ name, tone = 'steel', size = 44 }: { name: string; tone?: ChipTone; size?: number }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <span
      role="img"
      aria-label={name}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className={cn('inline-grid shrink-0 place-items-center rounded-full font-bold', chipTone[tone])}
    >
      {initials}
    </span>
  )
}

/* ───────────── Skeleton ───────────── */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-shimmer rounded-field bg-[linear-gradient(110deg,#1c1c1e_30%,#2c2c2e_50%,#1c1c1e_70%)] bg-[length:200%_100%]',
        className,
      )}
    />
  )
}

/* ───────────── Counter ───────────── */
export function Counter({
  value,
  duration = 1100,
  decimals = 0,
  suffix = '',
  className,
}: {
  value: number
  duration?: number
  decimals?: number
  suffix?: string
  className?: string
}) {
  const [ref, inView] = useInView<HTMLSpanElement>()
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (!inView) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 4)
      setShown(value * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView, value, duration])
  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {shown.toFixed(decimals)}
      {suffix}
    </span>
  )
}
