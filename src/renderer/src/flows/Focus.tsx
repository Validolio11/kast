import { useEffect, useRef, useState } from 'react'
import { Button, Card, CheckCircle, cn, Icon, PageGrid, PulseChip, RoundButton, SegTabs, useToast } from '@/design-system'
import { WHEN_OPTIONS } from '@/components/TaskRow'
import { useEntering } from '@/components/Page'
import { useTask } from '@/data/hooks'
import { complete, finishStep, remove, setKind, takeToToday, toInbox, update } from '@/data/tasks'
import type { Task, TaskKind, TaskStatus, When } from '@/data/db'

const KIND_OPTIONS: { value: TaskKind; label: string }[] = [
  { value: 'main', label: 'Головна' },
  { value: 'small', label: 'Дрібниця' },
]
// Без іконок: чотири варіанти вміщаються в колонку 400px одним рядком
const WHEN_FOCUS: { value: When; label: string }[] = [{ value: 'any', label: 'Будь-коли' }, ...WHEN_OPTIONS.slice(1).map(({ value, label }) => ({ value, label }))]
const STATUS_LABEL: Record<TaskStatus, string> = { today: 'Сьогодні', inbox: 'Вхідні', someday: 'Колись', done: 'Готово', dropped: 'Відпущено' }

/** Режим фокусу: на екрані лише одна задача */
export function Focus({ id, onClose }: { id: string; onClose: () => void }) {
  const task = useTask(id)
  const toast = useToast()
  const entering = useEntering()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const gone = task === null || !!task?.deleted
  useEffect(() => {
    if (gone) onClose()
  }, [gone, onClose])

  if (!task || gone) return null

  const isToday = task.status === 'today'
  const done = task.status === 'done'

  const finish = async () => {
    const p = await complete(task.id, !done)
    if (done && p === 'inbox') toast({ kind: 'info', title: 'День уже повний — задачу повернуто у Вхідні' })
    if (!done) {
      toast({ title: 'Зроблено', text: task.title })
      onClose()
    }
  }

  return (
    <div data-entering={entering} className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col px-8 pt-6 pb-16 max-[640px]:px-4">
        <div className="mb-7 flex animate-enter items-start gap-5">
          <RoundButton icon="chevronLeft" size={56} label="Назад · Esc" onClick={onClose} />
          <div className="flex min-w-0 flex-1 flex-col gap-3.5">
            <PulseChip tone={isToday ? 'growth' : 'steel'} className="self-start">
              {STATUS_LABEL[task.status]}
            </PulseChip>
            <Field
              value={task.title}
              onSave={(title) => title.trim() && update(task.id, { title: title.trim() })}
              className="text-[clamp(32px,min(4.4vw,7vh),56px)] leading-[0.95] font-extrabold tracking-[-0.04em] text-paper"
            />
          </div>
        </div>

        <PageGrid
          side={
            <>
              {isToday && <Timer task={task} />}
              <Card className="flex flex-col gap-5 p-5">
                {isToday ? (
                  <>
                    <Group label="Коли зроблю">
                      <SegTabs compact label="Коли зроблю" surface="canvas" value={task.when} options={WHEN_FOCUS} onChange={(when) => update(task.id, { when })} />
                    </Group>
                    <Group label="Вага">
                      <SegTabs
                        label="Вага задачі"
                        surface="canvas"
                        value={task.kind}
                        options={KIND_OPTIONS}
                        onChange={async (k) => {
                          if (!(await setKind(task.id, k))) toast({ kind: 'info', title: k === 'main' ? 'Вже є 3 головні' : 'Вже є 5 дрібниць' })
                        }}
                      />
                    </Group>
                  </>
                ) : (
                  !done && (
                    <Button
                      variant="paper"
                      iconLeft="sun"
                      onClick={async () => {
                        const p = await takeToToday(task.id)
                        toast(p === 'inbox' ? { kind: 'info', title: 'День уже повний' } : { title: 'Взято на сьогодні' })
                      }}
                    >
                      Взяти на сьогодні
                    </Button>
                  )
                )}
                <div className="flex flex-wrap gap-2">
                  <Button variant={done ? 'steel' : 'pulse'} size="lg" iconLeft={done ? 'undo' : 'check'} onClick={finish}>
                    {done ? 'Повернути в роботу' : 'Готово'}
                  </Button>
                  {(isToday || task.status === 'someday' || task.status === 'dropped') && (
                    <Button variant="steel" size="lg" onClick={() => toInbox(task.id).then(onClose)}>
                      У Вхідні
                    </Button>
                  )}
                </div>
              </Card>
              <button
                onClick={async () => {
                  await remove(task.id)
                  onClose()
                  toast({ kind: 'info', title: 'Задачу видалено', action: { label: 'Скасувати', onClick: () => update(task.id, { deleted: 0 }) } })
                }}
                className="flex h-11 items-center gap-2 self-start rounded-full px-4 text-[14px] font-bold text-muted transition-colors hover:bg-tile hover:text-danger-text"
              >
                <Icon name="trash" size={16} />
                Видалити задачу
              </button>
            </>
          }
          main={
            <>
              <StepCard task={task} />
              <section className="flex min-h-[320px] flex-col rounded-panel bg-paper p-8 text-ink">
                <h2 className="text-[20px] font-extrabold tracking-[-0.02em]">Нотатки</h2>
                <Field
                  value={task.notes}
                  onSave={(notes) => update(task.id, { notes })}
                  placeholder="Деталі, посилання, думки…"
                  multiline
                  className="mt-3 flex-1 text-[17px] leading-[1.6] font-medium text-ink placeholder:text-dim"
                />
              </section>
            </>
          }
        />
      </div>
    </div>
  )
}

/**
 * Ковзний крок: на екрані завжди один конкретний крок. Відмітили — поле звільняється
 * з питанням «А наступний крок?», а лічильник тихо показує, скільки вже пройдено.
 */
function StepCard({ task }: { task: Task }) {
  const toast = useToast()
  const [celebrate, setCelebrate] = useState(false)
  const [round, setRound] = useState(0)
  const steps = task.stepsDone ?? 0
  const done = async () => {
    const undo = await finishStep(task.id)
    if (!undo) return
    setCelebrate(true)
    setTimeout(() => setCelebrate(false), 700)
    setRound((r) => r + 1)
    toast({ title: 'Крок зроблено', action: { label: 'Скасувати', onClick: () => undo() } })
  }
  return (
    <Card className="flex flex-col gap-3 p-7">
      <h2 className="text-[20px] font-extrabold tracking-[-0.02em]">{steps ? 'Наступний крок' : 'Перший крок'}</h2>
      <div className="flex items-center gap-3">
        <Field
          value={task.firstStep}
          onSave={(firstStep) => update(task.id, { firstStep: firstStep.trim() })}
          placeholder={steps ? 'А наступний крок?' : 'Найменша фізична дія: відкрити файл, написати одне речення…'}
          focusKey={round}
          className="h-14 rounded-full bg-canvas px-5 text-[16px] font-semibold text-paper placeholder:text-muted focus:shadow-[inset_0_0_0_2px_var(--color-growth)]"
        />
        {(task.firstStep || celebrate) && (
          <div data-tip="Крок зроблено" className="shrink-0">
            <CheckCircle checked={celebrate} onChange={(v) => v && done()} label={`Крок зроблено: ${task.firstStep}`} />
          </div>
        )}
      </div>
      <p className="px-1 text-[13px] font-semibold text-muted">
        {steps ? `Кроків зроблено: ${steps}` : 'Розмите відкладається, конкретне — робиться.'}
      </p>
    </Card>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="px-1 text-[13px] font-extrabold text-grey">{label}</span>
      {children}
    </div>
  )
}

/** Поле, що зберігається при втраті фокусу або Enter (без кнопки «Зберегти») */
function Field({
  value,
  onSave,
  placeholder,
  multiline,
  focusKey,
  className,
}: {
  value: string
  onSave: (v: string) => void
  placeholder?: string
  multiline?: boolean
  /** Зміна значення переводить фокус у поле (наприклад, після «Крок зроблено») */
  focusKey?: number
  className?: string
}) {
  const [v, setV] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (focusKey) inputRef.current?.focus()
  }, [focusKey])
  useEffect(() => setV(value), [value])
  const save = () => v !== value && onSave(v)
  // Вихід через Esc чи гарячу клавішу не викликає blur — зберігаємо незбережене при закритті
  const latest = useRef({ v, value, onSave })
  latest.current = { v, value, onSave }
  useEffect(
    () => () => {
      const { v: cur, value: saved, onSave: persist } = latest.current
      if (cur !== saved) persist(cur)
    },
    [],
  )
  const cls = cn('w-full bg-transparent caret-growth outline-none', className)
  if (multiline) return <textarea value={v} onChange={(e) => setV(e.target.value)} onBlur={save} placeholder={placeholder} className={cn(cls, 'resize-none')} />
  return (
    <input
      ref={inputRef}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      placeholder={placeholder}
      className={cls}
    />
  )
}

const PRESETS = [15, 25, 45]

/**
 * Таймери живуть поза компонентом: вийшли з Фокусу — відлік триває, повернулися — бачите залишок,
 * а сповіщення «Час вийшов» прийде навіть з іншої вкладки.
 */
interface TimerState {
  minutes: number
  /** Коли закінчиться (якщо йде) */
  endAt: number | null
  /** Скільки лишилося секунд (якщо на паузі) */
  left: number
  alarm?: ReturnType<typeof setTimeout>
}
const timers = new Map<string, TimerState>()

function timerOf(id: string): TimerState {
  return timers.get(id) ?? { minutes: 25, endAt: null, left: 25 * 60 }
}
const secondsLeft = (t: TimerState) => (t.endAt ? Math.max(0, Math.round((t.endAt - Date.now()) / 1000)) : t.left)

/** Таймбокс на панелі data: цифра — герой, пресет, старт, пауза */
function Timer({ task }: { task: Task }) {
  const [state, setState] = useState(() => timerOf(task.id))
  const [, tick] = useState(0)
  const running = state.endAt !== null
  const left = secondsLeft(state)
  const minutes = state.minutes

  const save = (next: TimerState) => {
    clearTimeout(timerOf(task.id).alarm)
    if (next.endAt) {
      const title = task.title
      next.alarm = setTimeout(() => {
        timers.set(task.id, { minutes: next.minutes, endAt: null, left: 0 })
        window.kast?.notify('Час вийшов', `${title} — зробіть паузу або позначте як готово.`)
      }, next.endAt - Date.now())
    }
    timers.set(task.id, next)
    setState(next)
  }

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => {
      tick((n) => n + 1)
      if (secondsLeft(timerOf(task.id)) === 0) setState(timerOf(task.id))
    }, 250)
    return () => clearInterval(t)
  }, [running, task.id])

  const start = () => save({ minutes, endAt: Date.now() + (left || minutes * 60) * 1000, left: 0 })
  const pause = () => save({ minutes, endAt: null, left })
  const pick = (m: number) => save({ minutes: m, endAt: null, left: m * 60 })
  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')

  return (
    <section className="flex flex-col gap-5 rounded-tile bg-data p-7 text-white">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[14px] font-bold text-white/80">{running ? 'Йде фокус' : 'Таймбокс'}</span>
        <div className="flex gap-1 rounded-full bg-canvas/25 p-1">
          {PRESETS.map((m) => (
            <button
              key={m}
              onClick={() => pick(m)}
              aria-pressed={m === minutes}
              className={cn('h-8 rounded-full px-3 text-[13px] font-extrabold transition-colors', m === minutes ? 'bg-paper text-ink' : 'text-white/80 hover:text-white')}
            >
              {m} хв
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-end justify-between gap-3">
        <span className="text-[64px] leading-none font-extrabold tracking-[-0.045em] tabular-nums">
          {mm}:{ss}
        </span>
        <div className="flex items-center gap-2">
          {left !== minutes * 60 && (
            <button
              onClick={() => pick(minutes)}
              aria-label="Скинути таймер"
              data-tip="Скинути"
              className="grid size-11 place-items-center rounded-full bg-canvas/25 text-white transition hover:bg-canvas/40"
            >
              <Icon name="rotateCcw" size={18} />
            </button>
          )}
          <button
            onClick={() => (running ? pause() : start())}
            aria-label={running ? 'Пауза' : 'Почати'}
            className="grid size-14 place-items-center rounded-full bg-paper text-ink transition hover:scale-105 active:scale-95"
          >
            <Icon name={running ? 'pause' : 'play'} size={20} />
          </button>
        </div>
      </div>
    </section>
  )
}
