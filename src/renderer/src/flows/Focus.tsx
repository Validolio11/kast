import { useEffect, useRef, useState } from 'react'
import { Button, ChipGroup, cn, Icon, Kbd, useToast, type ChipOption } from '@/design-system'
import { WHEN_OPTIONS } from '@/components/TaskRow'
import { useTask } from '@/data/hooks'
import { complete, remove, setKind, takeToToday, toInbox, update } from '@/data/tasks'
import type { Task, TaskKind } from '@/data/db'

const KIND_OPTIONS: ChipOption<TaskKind>[] = [
  { value: 'main', label: 'Головна', icon: 'target' },
  { value: 'small', label: 'Дрібниця', icon: 'dot' },
]
const WHEN_FOCUS = [{ ...WHEN_OPTIONS[0], label: 'Будь-коли' }, ...WHEN_OPTIONS.slice(1)]

/** Режим фокусу: на екрані лише одна задача */
export function Focus({ id, onClose }: { id: string; onClose: () => void }) {
  const task = useTask(id)
  const toast = useToast()

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
    await complete(task.id, !done)
    if (!done) {
      toast({ title: 'Зроблено', text: task.title })
      onClose()
    }
  }

  return (
    <div className="flex h-full animate-fade-in flex-col">
      <div className="flex items-center gap-3 px-8 pt-5">
        <button
          onClick={onClose}
          className="flex h-9 items-center gap-2 rounded-full pr-3 pl-2 text-[13px] font-bold text-fog transition-colors hover:bg-white/10 hover:text-paper"
        >
          <Icon name="arrowLeft" size={16} />
          Назад
          <Kbd>Esc</Kbd>
        </button>
        <span className="ml-auto text-[11px] font-bold tracking-[0.08em] text-fog uppercase">
          {{ today: 'Сьогодні', inbox: 'Вхідні', someday: 'Колись', done: 'Готово', dropped: 'Відпущено' }[task.status]}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex max-w-[720px] flex-col gap-7 px-8 pt-6 pb-10">
          <Field value={task.title} onSave={(title) => title.trim() && update(task.id, { title: title.trim() })} big />

          <section className="flex flex-col gap-2">
            <Label>Перший крок</Label>
            <Field
              value={task.firstStep}
              onSave={(firstStep) => update(task.id, { firstStep: firstStep.trim() })}
              placeholder="Найменша фізична дія, з якої почнете (відкрити файл, написати 1 речення…)"
            />
          </section>

          {isToday ? (
            <div className="flex flex-wrap gap-x-10 gap-y-6">
              <section className="flex flex-col gap-2">
                <Label>Коли зроблю</Label>
                <ChipGroup label="Коли зроблю" value={task.when} options={WHEN_FOCUS} onChange={(when) => update(task.id, { when })} />
              </section>
              <section className="flex flex-col gap-2">
                <Label>Вага</Label>
                <ChipGroup
                  label="Вага задачі"
                  value={task.kind}
                  options={KIND_OPTIONS}
                  onChange={async (k) => {
                    if (!(await setKind(task.id, k))) toast({ kind: 'info', title: k === 'main' ? 'Вже є 3 головні' : 'Вже є 5 дрібниць' })
                  }}
                />
              </section>
            </div>
          ) : (
            !done && (
              <div>
                <Button
                  variant="steel"
                  size="sm"
                  iconLeft="sun"
                  onClick={async () => {
                    const p = await takeToToday(task.id)
                    toast(p === 'inbox' ? { kind: 'info', title: 'День уже повний' } : { title: 'Взято на сьогодні' })
                  }}
                >
                  Взяти на сьогодні
                </Button>
              </div>
            )
          )}

          {isToday && <Timer task={task} />}

          <section className="flex flex-col gap-2">
            <Label>Нотатки</Label>
            <Field value={task.notes} onSave={(notes) => update(task.id, { notes })} placeholder="Деталі, посилання, думки…" multiline />
          </section>
        </div>
      </div>

      <div className="flex max-w-[720px] flex-wrap items-center gap-2 px-8 pb-6">
        <Button variant={done ? 'steel' : 'pulse'} iconLeft={done ? 'undo' : 'check'} onClick={finish}>
          {done ? 'Повернути в роботу' : 'Готово'}
        </Button>
        {(isToday || task.status === 'someday') && (
          <Button variant="ghost" iconLeft="inbox" onClick={() => toInbox(task.id).then(onClose)}>
            У Вхідні
          </Button>
        )}
        <Button
          variant="ghost"
          iconLeft="trash"
          className="ml-auto text-fog hover:text-signal"
          onClick={async () => {
            await remove(task.id)
            onClose()
            toast({ kind: 'info', title: 'Задачу видалено', action: { label: 'Скасувати', onClick: () => update(task.id, { deleted: 0 }) } })
          }}
        >
          Видалити
        </Button>
      </div>
    </div>
  )
}

function Label({ children }: { children: string }) {
  return <span className="text-[11px] font-bold tracking-[0.08em] text-fog uppercase">{children}</span>
}

/** Поле, що зберігається при втраті фокусу або Enter (без кнопки «Зберегти») */
function Field({
  value,
  onSave,
  placeholder,
  big,
  multiline,
}: {
  value: string
  onSave: (v: string) => void
  placeholder?: string
  big?: boolean
  multiline?: boolean
}) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  const save = () => v !== value && onSave(v)
  const cls = cn(
    'w-full rounded-field bg-transparent text-paper outline-none placeholder:text-fog-2 transition-colors',
    big ? 'text-[26px] leading-tight font-bold tracking-tight' : 'bg-graphite px-4 py-3 text-[15px] font-medium focus:ring-2 focus:ring-volt-glow',
  )
  if (multiline)
    return <textarea value={v} onChange={(e) => setV(e.target.value)} onBlur={save} placeholder={placeholder} rows={5} className={cn(cls, 'resize-none leading-relaxed')} />
  return (
    <input
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

/** Таймбокс: проста тиха конструкція — пресет, старт, пауза */
function Timer({ task }: { task: Task }) {
  const [minutes, setMinutes] = useState(25)
  const [left, setLeft] = useState(25 * 60)
  const [running, setRunning] = useState(false)
  const endAt = useRef(0)

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((endAt.current - Date.now()) / 1000))
      setLeft(s)
      if (s === 0) {
        setRunning(false)
        window.kast?.notify('Час вийшов', `${task.title} — зробіть паузу або позначте як готово.`)
      }
    }, 250)
    return () => clearInterval(t)
  }, [running, task.title])

  const start = () => {
    endAt.current = Date.now() + left * 1000
    setRunning(true)
  }
  const pick = (m: number) => {
    setMinutes(m)
    setLeft(m * 60)
    setRunning(false)
  }
  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')
  const pct = 100 - (left / (minutes * 60)) * 100

  return (
    <section className="relative flex items-center gap-5 overflow-hidden rounded-field bg-graphite p-4 pl-5">
      <span
        aria-hidden
        className="hatch absolute inset-y-0 left-0 transition-[width] duration-500 ease-pulse"
        style={{ width: `${pct}%`, ['--hatch' as string]: 'rgb(19 242 135 / 0.22)' }}
      />
      <div className="relative text-[40px] leading-none font-bold tracking-[-0.04em] tabular-nums" aria-live="off">
        {mm}:{ss}
      </div>
      <div className="relative flex flex-1 flex-wrap items-center gap-2">
        {PRESETS.map((m) => (
          <button
            key={m}
            onClick={() => pick(m)}
            className={cn(
              'h-8 rounded-full px-3 text-[13px] font-bold transition-colors',
              m === minutes ? 'bg-steel text-paper' : 'text-fog hover:text-paper',
            )}
          >
            {m} хв
          </button>
        ))}
      </div>
      <div className="relative flex items-center gap-2">
        {left !== minutes * 60 && (
          <button
            onClick={() => pick(minutes)}
            aria-label="Скинути таймер"
            className="grid size-10 place-items-center rounded-full text-fog transition hover:bg-white/10 hover:text-paper"
          >
            <Icon name="rotateCcw" size={18} />
          </button>
        )}
        <button
          onClick={() => (running ? setRunning(false) : start())}
          aria-label={running ? 'Пауза' : 'Почати'}
          className="grid size-12 place-items-center rounded-full bg-paper text-night transition active:scale-90"
        >
          <Icon name={running ? 'pause' : 'play'} size={20} />
        </button>
      </div>
    </section>
  )
}
