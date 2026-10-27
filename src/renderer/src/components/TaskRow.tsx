import type { ReactNode } from 'react'
import { CheckCircle, CycleChip, PulseRow, useToast, type ChipOption } from '@/design-system'
import type { Task, When } from '@/data/db'
import { complete, STALE_DAYS, update } from '@/data/tasks'
import { DAY, now, pluralWord } from '@/lib/time'

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
  const toggle = async (v: boolean) => {
    const p = await complete(task.id, v)
    if (p === 'inbox') toast({ kind: 'info', title: 'День уже повний — задачу повернуто у Вхідні' })
    else if (p) toast({ title: 'Повернуто на сьогодні' })
  }
  return (
    <PulseRow
      leading={<CheckCircle checked={done} onChange={toggle} label={`Виконано: ${task.title}`} />}
      title={task.title}
      sub={task.firstStep && !done ? `Перший крок: ${task.firstStep}` : undefined}
      done={done}
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
 * на сьогодні — скільки днів задача вже з вами. Нові (молодші доби) смуги не мають.
 */
function ageOf(task: Task): { value: number; tip: string } | undefined {
  if (task.status !== 'inbox' && task.status !== 'today') return undefined
  const from = task.status === 'inbox' ? task.inboxAt : task.createdAt
  const n = Math.floor((now() - from) / DAY)
  if (n < 1) return undefined
  if (task.status === 'today') return { value: n / STALE_DAYS, tip: `Задача з вами ${days(n)}` }
  const left = STALE_DAYS - n
  return { value: n / STALE_DAYS, tip: `У Вхідних ${days(n)} · ${left > 0 ? `у «Колись» через ${days(left)}` : 'скоро піде в «Колись»'}` }
}
