import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Card, CheckCircle, cn, ContextMenu, Icon, PageGrid, PulseChip, RoundButton, SegTabs, useToast, type MenuAction } from '@/design-system'
import { WHEN_OPTIONS } from '@/components/TaskRow'
import { useEntering } from '@/components/Page'
import { useTask } from '@/data/hooks'
import { addSteps, captureToInbox, complete, finishStep, remove, setKind, setSteps, takeToToday, toInbox, update } from '@/data/tasks'
import type { Task, TaskKind, TaskStatus, When } from '@/data/db'
import { pluralWord } from '@/lib/time'
import { RichNote, type RichNoteHandle } from '@/components/RichNote'
import { textToHtml } from '@/components/richText'
import { AddImageButton, DropHint, useImageDrop } from '@/components/Attachments'

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
      // Esc, який уже закрив щось поверх (перегляд фото, меню), Фокус не закриває
      if (e.key === 'Escape' && !e.defaultPrevented) onClose()
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
            {/* Підпис над назвою: одразу ясно, що це задача і де вона лежить */}
            <div className="flex items-center gap-3">
              <span className="text-[15px] font-extrabold text-grey">Задача</span>
              <PulseChip tone={isToday ? 'growth' : 'steel'}>{STATUS_LABEL[task.status]}</PulseChip>
            </div>
            <Field
              value={task.title}
              placeholder="Назва задачі"
              onSave={(title) => title.trim() && update(task.id, { title: title.trim() })}
              className="text-[clamp(32px,min(4.4vw,7vh),56px)] leading-[0.95] font-extrabold tracking-[-0.04em] text-paper"
            />
          </div>
        </div>

        <PageGrid
          side={
            <>
              {isToday && <Timer task={task} />}
              <Card className="flex flex-col gap-4 p-7">
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
              <TaskNotes task={task} />
            </>
          }
        />
      </div>
    </div>
  )
}

/**
 * Нотатки задачі — той самий редактор, що й у Блокноті: посилання стають чипами,
 * скріншот вставляється Ctrl+V прямо в текст, і текст обтікає фото, як у Word.
 */
function TaskNotes({ task }: { task: Task }) {
  const editorRef = useRef<RichNoteHandle>(null)
  const drop = useImageDrop((files) => editorRef.current?.insertImages(files))
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pending = useRef<{ notes: string; notesHtml: string } | null>(null)
  const flush = () => {
    clearTimeout(timer.current)
    if (pending.current) update(task.id, pending.current)
    pending.current = null
  }
  useEffect(() => flush, []) // eslint-disable-line react-hooks/exhaustive-deps
  const onChange = useCallback((html: string, text: string) => {
    pending.current = { notes: text, notesHtml: html }
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 400)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <section className="relative flex min-h-[320px] flex-col rounded-panel bg-paper p-7 text-ink" {...drop.dropProps}>
      <DropHint show={drop.over} />
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[20px] font-extrabold tracking-[-0.02em]">Нотатки</h2>
        <AddImageButton onFiles={(files) => editorRef.current?.insertImages(files)} />
      </div>
      <RichNote
        ref={editorRef}
        html={task.notesHtml ?? textToHtml(task.notes)}
        placeholder="Деталі, посилання, думки…"
        onChange={onChange}
        imageOwner={task.id}
        onLineToTask={async (t) => {
          await captureToInbox(t)
        }}
      />
    </section>
  )
}

/**
 * Ковзний крок: на екрані завжди один конкретний крок. Кілька наступних можна записати наперед —
 * вони чекають у черзі невидимими. Відмітили поточний — піднімається наступний; черга порожня —
 * поле питає «А наступний крок?». Лічильник тихо показує, скільки вже пройдено.
 */
function StepCard({ task }: { task: Task }) {
  const toast = useToast()
  const [celebrate, setCelebrate] = useState(false)
  const [round, setRound] = useState(0)
  const [more, setMore] = useState('')
  const [listOpen, setListOpen] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; i: number } | null>(null)
  // Перетягування мишкою у відкритому списку: звідки тягнемо і куди наведено
  const [drag, setDrag] = useState<{ from: number; over: number | null } | null>(null)
  const dropProps = (i: number) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!drag) return
      e.preventDefault()
      if (drag.over !== i) setDrag({ ...drag, over: i })
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      if (drag && drag.from !== i) move(drag.from, i)
      setDrag(null)
    },
  })
  const steps = task.stepsDone ?? 0
  const queued = task.nextSteps?.length ?? 0
  // Усі кроки одним списком: [0] — поточний, далі черга
  const all = [task.firstStep, ...(task.nextSteps ?? [])].filter((s) => s.trim())

  const move = (from: number, to: number) => {
    const next = [...all]
    const [s] = next.splice(from, 1)
    next.splice(to, 0, s)
    setSteps(task.id, next)
  }
  const removeAt = (i: number) => {
    const before = all
    setSteps(
      task.id,
      all.filter((_, j) => j !== i),
    )
    toast({ kind: 'info', title: 'Крок видалено', action: { label: 'Скасувати', onClick: () => setSteps(task.id, before) } })
  }
  const saveAt = (i: number, text: string) => {
    setEditing(null)
    if (!text.trim()) return removeAt(i)
    if (text.trim() !== all[i]) setSteps(task.id, all.map((s, j) => (j === i ? text : s)))
  }
  const openMenu = (e: React.MouseEvent, i: number) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, i })
  }
  const menuItems = (i: number): MenuAction[] => [
    {
      label: 'Редагувати',
      icon: 'pencil',
      // Поточний крок редагується у великому полі, решта — прямо в списку
      onSelect: () => (setMenu(null), i === 0 ? setRound((r) => r + 1) : (setListOpen(true), setEditing(i))),
    },
    ...(i === 0 && all.length > 1 && !listOpen ? [{ label: 'Усі кроки', icon: 'listOrdered', onSelect: () => (setMenu(null), setListOpen(true)) } as MenuAction] : []),
    { label: 'Зробити поточним', icon: 'chevronsRight', disabled: i === 0, onSelect: () => (setMenu(null), move(i, 0)) },
    { label: 'Вище', icon: 'arrowUp', disabled: i === 0, onSelect: () => (setMenu(null), move(i, i - 1)) },
    { label: 'Нижче', icon: 'arrowDown', disabled: i === all.length - 1, onSelect: () => (setMenu(null), move(i, i + 1)) },
    { label: 'Видалити', icon: 'trashLines', tone: 'danger', onSelect: () => (setMenu(null), removeAt(i)) },
  ]
  const done = async () => {
    const hadNext = queued > 0
    const undo = await finishStep(task.id)
    if (!undo) return
    setCelebrate(true)
    setTimeout(() => setCelebrate(false), 700)
    // Наступний уже піднявся з черги — фокус не потрібен; черга порожня — одразу питаємо наступний
    if (!hadNext) setRound((r) => r + 1)
    toast({ title: 'Крок зроблено', action: { label: 'Скасувати', onClick: () => undo() } })
  }
  const addMore = (text: string) => {
    if (!text.trim()) return
    addSteps(task.id, text)
    setMore('')
  }
  return (
    <Card className="flex flex-col gap-3 p-7">
      <h2 className="text-[20px] font-extrabold tracking-[-0.02em]">{steps ? 'Наступний крок' : 'Перший крок'}</h2>
      <div
        className={cn(
          'flex items-center gap-3 rounded-full transition-shadow',
          // Поки тягнемо — поле не перехоплює кидок, його приймає вся смуга поточного кроку
          drag && '[&_input]:pointer-events-none',
          drag?.over === 0 && 'shadow-[0_0_0_2px_var(--color-growth)]',
        )}
        onContextMenu={(e) => task.firstStep && openMenu(e, 0)}
        {...dropProps(0)}
      >
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
      {task.firstStep && (
        <input
          value={more}
          onChange={(e) => setMore(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addMore(more)}
          onPaste={(e) => {
            // Вставили список — кожен рядок стає окремим кроком у черзі
            const text = e.clipboardData.getData('text/plain')
            if (!text.includes('\n')) return
            e.preventDefault()
            addMore(text)
          }}
          onBlur={() => addMore(more)}
          placeholder="+ Записати ще крок наперед · Enter"
          aria-label="Записати ще крок наперед"
          className="h-11 w-full rounded-full bg-transparent px-5 text-[14px] font-semibold text-paper caret-growth outline-none placeholder:text-muted hover:bg-canvas/50 focus:bg-canvas"
        />
      )}
      {/* Черга розгортається лише на вимогу: правий клік по кроку — редагувати, перемістити, видалити */}
      {listOpen && all.length > 1 && (
        <ol className="flex flex-col gap-1.5" aria-label="Наступні кроки">
          {all.slice(1).map((s, k) => {
            const i = k + 1
            return (
              <li
                key={`${i}-${s}`}
                draggable={editing !== i}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  setDrag({ from: i, over: null })
                }}
                onDragEnd={() => setDrag(null)}
                {...dropProps(i)}
                onContextMenu={(e) => openMenu(e, i)}
                onDoubleClick={() => setEditing(i)}
                className={cn(
                  'group flex h-11 cursor-grab items-center gap-3 rounded-full bg-canvas/50 pr-1.5 pl-5 text-[14px] font-semibold text-paper transition-[opacity,box-shadow] active:cursor-grabbing',
                  drag?.from === i && 'opacity-40',
                  drag && drag.over === i && drag.from !== i && 'shadow-[0_0_0_2px_var(--color-growth)]',
                )}
              >
                <span className="w-5 shrink-0 text-muted tabular-nums">{i + 1}</span>
                {editing === i ? (
                  <input
                    autoFocus
                    defaultValue={s}
                    onBlur={(e) => saveAt(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') setEditing(null)
                    }}
                    aria-label={`Крок ${i + 1}`}
                    className="min-w-0 flex-1 bg-transparent caret-growth outline-none"
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate">{s}</span>
                )}
                <button
                  onClick={(e) => openMenu(e, i)}
                  aria-label={`Дії з кроком ${i + 1}`}
                  className="grid size-8 shrink-0 place-items-center rounded-full text-muted opacity-0 transition hover:bg-tile hover:text-paper group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Icon name="more" size={16} />
                </button>
              </li>
            )
          })}
        </ol>
      )}
      <p className="text-[13px] font-semibold text-muted">
        {steps ? `Кроків зроблено: ${steps}` : !queued && 'Розмите відкладається, конкретне — робиться.'}
        {steps > 0 && queued > 0 && ' · '}
        {queued > 0 && (
          <button onClick={() => setListOpen((o) => !o)} className="font-semibold text-muted underline-offset-2 hover:text-paper hover:underline">
            далі ще {queued} {pluralWord(queued, ['крок', 'кроки', 'кроків'])} · {listOpen ? 'сховати' : 'показати'}
          </button>
        )}
      </p>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} label={`Крок ${menu.i + 1}`} items={menuItems(menu.i)} onClose={() => setMenu(null)} />
      )}
    </Card>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-[13px] font-extrabold text-grey">{label}</span>
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
  const cls = cn('w-full caret-growth outline-none', className)
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
  const remaining = minutes ? left / (minutes * 60) : 0

  return (
    <section className="flex flex-col gap-4 rounded-tile bg-data p-7 text-white">
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
      <div className="flex items-center justify-between gap-3">
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
      <TimeScale remaining={remaining} />
    </section>
  )
}

/** Шкала часу у стилі прогрес-ліній: біла капсула в доріжці тане зі спливанням часу */
function TimeScale({ remaining }: { remaining: number }) {
  const r = Math.max(0, Math.min(1, remaining))
  return (
    <div role="img" aria-label={`Лишилося ${Math.round(r * 100)}%`} className="relative h-4 overflow-hidden rounded-full bg-canvas/25">
      {r > 0 && (
        <span
          className="absolute inset-y-[3px] left-[3px] rounded-full bg-paper transition-[width] duration-300 ease-linear"
          style={{ width: `max(10px, calc((100% - 6px) * ${r}))` }}
        />
      )}
    </div>
  )
}
