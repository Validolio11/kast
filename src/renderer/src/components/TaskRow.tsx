import type { ReactNode } from 'react'
import { CheckCircle, CycleChip, PulseRow, type ChipOption } from '@/design-system'
import type { Task, When } from '@/data/db'
import { complete, update } from '@/data/tasks'

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
  return (
    <PulseRow
      leading={<CheckCircle checked={done} onChange={(v) => complete(task.id, v)} label={`Виконано: ${task.title}`} />}
      title={task.title}
      sub={task.firstStep && !done ? `Перший крок: ${task.firstStep}` : undefined}
      done={done}
      muted={muted}
      onClick={() => onOpen(task.id)}
      actions={actions}
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
