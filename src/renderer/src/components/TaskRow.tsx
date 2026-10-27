import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CheckCircle, CycleChip, PulseRow, useToast, type ChipOption } from '@/design-system'
import type { Task, When } from '@/data/db'
import { complete, STALE_DAYS, update } from '@/data/tasks'
import { DAY, now, pluralWord } from '@/lib/time'

/** Скільки триває анімація виконання до переходу задачі у «Зроблено» */
const FINISH_MS = 1150

export const WHEN_OPTIONS: ChipOption<When>[] = [
  { value: 'any', label: 'Коли?', icon: 'clock' },
  { value: 'morning', label: 'Ранок', icon: 'sunrise' },
  { value: 'afternoon', label: 'День', icon: 'sun' },
  { value: 'evening', label: 'Вечір', icon: 'sunset' },
]

export function TaskRow({
  task,
  onOpen,
  showWhen,
  meta,
  actions,
  muted,
}: {
  task: Task
  onOpen: (id: string) => void
  showWhen?: boolean
  meta?: ReactNode
  actions?: ReactNode
  muted?: boolean
}) {
  const done = task.status === 'done'
  const toast = useToast()
  // Виконання: спершу анімація (іскри, «+1», відліт), і лише потім задача переходить у «Зроблено»
  const [finishing, setFinishing] = useState(false)
  const pending = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(
    () => () => {
      // Пішли з вкладки посеред анімації — виконання все одно зберігаємо
      if (pending.current) {
        clearTimeout(pending.current)
        complete(task.id, true)
      }
    },
    [task.id],
  )
  const toggle = async (v: boolean) => {
    if (v && !done && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setFinishing(true)
      pending.current = setTimeout(() => {
        pending.current = undefined
        complete(task.id, true)
      }, FINISH_MS)
      return
    }
    if (!v && pending.current) {
      // Передумали під час анімації
      clearTimeout(pending.current)
      pending.current = undefined
      setFinishing(false)
      return
    }
    const p = await complete(task.id, v)
    if (p === 'inbox') toast({ kind: 'info', title: 'День уже повний — задачу повернуто у Вхідні' })
    else if (p) toast({ title: 'Повернуто на сьогодні' })
  }
  return (
    <PulseRow
      leading={<CheckCircle checked={done || finishing} onChange={toggle} label={`Виконано: ${task.title}`} />}
      title={task.title}
      sub={task.firstStep && !done ? `Перший крок: ${task.firstStep}` : undefined}
      done={done}
      finishing={finishing}
      muted={muted}
      onClick={() => onOpen(task.id)}
      actions={actions}
      age={ageOf(task)}
      meta={
        <>
          {meta}
          {showWhen && !done && (
            <CycleChip value={task.when} options={WHEN_OPTIONS} onChange={(when) => update(task.id, { when })} label="Коли зроблю" />
          )}
        </>
      }
    />
  )
}

const days = (n: number) => `${n} ${pluralWord(n, ['день', 'дні', 'днів'])}`

/**
 * Старіння відкритої задачі. У Вхідних — від потрапляння туди до тихого переходу в «Колись» (14 днів);
 * на сьогодні — скільки днів задача вже з вами. Нова задача має порожню шкалу.
 */
export function ageOf(task: Task): { value: number; tip: string } | undefined {
  if (task.status !== 'inbox' && task.status !== 'today') return undefined
  const from = task.status === 'inbox' ? task.inboxAt : task.createdAt
  const n = Math.max(0, Math.floor((now() - from) / DAY))
  if (task.status === 'today') return { value: n / STALE_DAYS, tip: n ? `Задача з вами ${days(n)}` : 'Додано сьогодні' }
  const left = STALE_DAYS - n
  return { value: n / STALE_DAYS, tip: `${left > 0 ? `У «Колись» через ${days(left)}` : 'Скоро піде в «Колись»'} · у Вхідних ${days(n)}` }
}
