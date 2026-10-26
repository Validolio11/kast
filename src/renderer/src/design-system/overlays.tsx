import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './Icon'
import { Button, IconButton } from './core'
import { cn, useEscape, usePresence, useUid } from './utils'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])'

function useDialogBehavior(ref: React.RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return
    const prev = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const el = ref.current
    ;(el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>(FOCUSABLE) ?? el)?.focus()
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !el) return
      const nodes = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (!nodes.length) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', trap)
    return () => {
      document.removeEventListener('keydown', trap)
      document.body.style.overflow = overflow
      prev?.focus?.()
    }
  }, [active, ref])
}

interface WindowProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
}

/* ───────────── Modal ───────────── */
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: WindowProps & { size?: 'sm' | 'md' | 'lg' }) {
  const { mounted, state } = usePresence(open, 190)
  const ref = useRef<HTMLDivElement>(null)
  const uid = useUid('modal')
  useEscape(onClose, open)
  useDialogBehavior(ref, open)
  if (!mounted) return null
  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center p-4">
      <div
        onClick={onClose}
        aria-hidden
        className={cn('absolute inset-0 bg-canvas/80 backdrop-blur-sm', state === 'open' ? 'animate-fade-in' : 'animate-fade-out')}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-t`}
        aria-describedby={description ? `${uid}-d` : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-panel bg-tile shadow-dialog outline-none',
          { sm: 'max-w-sm', md: 'max-w-xl', lg: 'max-w-3xl' }[size],
          state === 'open' ? 'animate-modal-in' : 'animate-modal-out',
        )}
      >
        <div className="flex items-start justify-between gap-4 p-8 pb-2">
          <div>
            <h2 id={`${uid}-t`} className="text-[30px] leading-[1.05] font-extrabold tracking-[-0.03em]">
              {title}
            </h2>
            {description && (
              <p id={`${uid}-d`} className="mt-2 text-[15px] font-semibold text-grey">
                {description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Закрити"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-canvas text-paper transition-colors hover:bg-steel"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        {children && <div className="overflow-y-auto px-8 py-4">{children}</div>}
        {footer && <div className="flex flex-wrap justify-end gap-2 p-8 pt-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ───────────── Sheet ───────────── */
export function Sheet({ open, onClose, title, description, children, footer, side = 'bottom' }: WindowProps & { side?: 'bottom' | 'right' }) {
  const { mounted, state } = usePresence(open, 230)
  const ref = useRef<HTMLDivElement>(null)
  const uid = useUid('sheet')
  useEscape(onClose, open)
  useDialogBehavior(ref, open)
  if (!mounted) return null
  const anim = {
    bottom: { open: 'animate-sheet-bottom-in', closed: 'animate-sheet-bottom-out' },
    right: { open: 'animate-sheet-right-in', closed: 'animate-sheet-right-out' },
  }[side][state]
  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <div
        onClick={onClose}
        aria-hidden
        className={cn('absolute inset-0 bg-night/70 backdrop-blur-sm', state === 'open' ? 'animate-fade-in' : 'animate-fade-out')}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-t`}
        tabIndex={-1}
        className={cn(
          'absolute flex flex-col bg-graphite shadow-[0_0_120px_-10px_rgba(0,0,0,1)] ring-1 ring-white/10 outline-none',
          side === 'bottom'
            ? 'inset-x-0 bottom-0 mx-auto max-h-[88vh] w-full max-w-2xl rounded-t-[40px]'
            : 'inset-y-0 right-0 w-full max-w-md rounded-l-[40px]',
          anim,
        )}
      >
        {side === 'bottom' && <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-steel" aria-hidden />}
        <div className="flex items-center justify-between gap-4 p-6 pb-2 md:p-8 md:pb-2">
          <div>
            <h2 id={`${uid}-t`} className="text-[22px] leading-tight font-bold tracking-tight">
              {title}
            </h2>
            {description && <p className="mt-2 text-[15px] text-fog">{description}</p>}
          </div>
          <IconButton icon="x" label="Закрити" onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 md:px-8">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-3 p-6 md:p-8">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ───────────── ConfirmDialog ───────────── */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Підтвердити',
  cancelLabel = 'Скасувати',
  danger,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="steel" onClick={onClose} data-autofocus>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'paper'}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  )
}

/* ───────────── Toast ───────────── */
type ToastKind = 'success' | 'info' | 'error'
interface ToastItem {
  id: number
  kind: ToastKind
  title: string
  text?: string
  ms: number
  action?: ToastAction
}
/** Дія в тості — наприклад, «Скасувати» після видалення */
export interface ToastAction {
  label: string
  onClick: () => void
}
type ToastInput = { kind?: ToastKind; title: string; text?: string; ms?: number; action?: ToastAction }
const ToastCtx = createContext<(t: ToastInput) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

const toastStyle: Record<ToastKind, { icon: IconName; chip: string; bar: string }> = {
  success: { icon: 'check', chip: 'bg-pulse text-night', bar: '#13f287' },
  info: { icon: 'info', chip: 'bg-volt text-white', bar: '#8f5bff' },
  error: { icon: 'x', chip: 'bg-signal text-night', bar: '#ff4d4f' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const counter = useRef(0)
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), [])
  const push = useCallback(
    (t: ToastInput) => {
      const id = ++counter.current
      setItems((l) => [
        ...l.slice(-3),
        { id, kind: t.kind ?? 'success', title: t.title, text: t.text, ms: t.ms ?? (t.action ? 6000 : 4000), action: t.action },
      ])
    },
    [],
  )
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {createPortal(
        <div
          role="region"
          aria-label="Сповіщення"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-6 z-[120] flex flex-col items-center gap-3 px-4"
        >
          {items.map((t) => (
            <ToastView key={t.id} item={t} onDone={() => dismiss(t.id)} />
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  )
}

function ToastView({ item, onDone }: { item: ToastItem; onDone: () => void }) {
  const [paused, setPaused] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (paused) return
    const start = performance.now() - elapsed
    let raf = 0
    const tick = (now: number) => {
      const e = now - start
      setElapsed(e)
      if (e >= item.ms) onDone()
      else raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused])
  const s = toastStyle[item.kind]
  return (
    <div
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="pointer-events-auto relative flex w-full max-w-md animate-toast-in items-center gap-4 overflow-hidden rounded-capsule bg-paper py-3 pr-3 pl-3 text-night shadow-[0_24px_60px_-12px_rgba(0,0,0,0.9)]"
    >
      <span className={cn('grid size-11 shrink-0 place-items-center rounded-full', s.chip)}>
        <Icon name={s.icon} size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold tracking-tight">{item.title}</div>
        {item.text && <div className="truncate text-[13px] text-night/60">{item.text}</div>}
      </div>
      {item.action && (
        <button
          onClick={() => {
            item.action!.onClick()
            onDone()
          }}
          className="h-9 shrink-0 rounded-full bg-night px-4 text-[13px] font-bold text-paper transition hover:bg-steel active:scale-95"
        >
          {item.action.label}
        </button>
      )}
      <button
        aria-label="Закрити сповіщення"
        onClick={onDone}
        className="grid size-10 shrink-0 place-items-center rounded-full bg-night/8 transition hover:bg-night/15 active:scale-90"
      >
        <Icon name="x" size={16} />
      </button>
      <span
        aria-hidden
        className="absolute bottom-0 left-0 h-1"
        style={{ width: `${(1 - elapsed / item.ms) * 100}%`, background: s.bar }}
      />
    </div>
  )
}
