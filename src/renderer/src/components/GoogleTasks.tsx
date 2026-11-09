/*
 * Група «Google Tasks» у «Сьогодні»: завдання з датою на сьогодні або раніше, а без дати — згорнуто.
 * Вони не займають місць у ліміті 3 + 5: це чужий список, Kast лише показує його поруч.
 */
import { useEffect, useRef, useState } from 'react'
import { CheckCircle, ContextMenu, Icon, ListSection, PulseRow, RowAction, useToast } from '@/design-system'
import { addToToday, type Placement } from '@/data/tasks'
import { completeGTask, removeGTask, useGTasks } from '@/lib/gtasks'
import { fmtShortDay } from '@/lib/time'
import type { GTask } from '../../../shared/types'

const FINISH_MS = 1150

const placedToast: Record<Placement, string> = {
  main: 'Перенесено в Kast — це головна на сьогодні',
  small: 'Перенесено в Kast як дрібницю',
  inbox: 'Перенесено у Вхідні Kast',
}

export function GoogleTasksSection({ date }: { date: string }) {
  const { status, items } = useGTasks()
  if (!status.connected || !items.length) return null

  const dated = items.filter((t) => t.due && t.due <= date).sort((a, b) => (a.due! < b.due! ? -1 : a.due! > b.due! ? 1 : 0))
  const undated = items.filter((t) => !t.due)
  const lists = new Set(items.map((t) => t.list)).size
  if (!dated.length && !undated.length) return null

  return (
    <>
      {dated.length > 0 && (
        <ListSection title="Google Tasks" count={dated.length} collapsible>
          {dated.map((t) => (
            <GTaskRow key={t.id} task={t} today={date} showList={lists > 1} />
          ))}
        </ListSection>
      )}
      {undated.length > 0 && (
        <ListSection title="Google Tasks · без дати" count={undated.length} collapsible defaultOpen={false}>
          {undated.map((t) => (
            <GTaskRow key={t.id} task={t} today={date} showList={lists > 1} />
          ))}
        </ListSection>
      )}
    </>
  )
}

function GTaskRow({ task, today, showList }: { task: GTask; today: string; showList: boolean }) {
  const toast = useToast()
  const [finishing, setFinishing] = useState(false)
  const pending = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(pending.current), [])

  const done = async () => {
    try {
      await completeGTask(task)
    } catch (e) {
      setFinishing(false)
      toast({ kind: 'error', title: 'Google не прийняв зміну', text: (e as Error).message })
    }
  }
  const toggle = (v: boolean) => {
    if (!v) {
      clearTimeout(pending.current)
      return setFinishing(false)
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return void done()
    setFinishing(true)
    pending.current = setTimeout(done, FINISH_MS)
  }
  const moveToKast = async () => {
    const placed = await addToToday(task.title)
    try {
      await completeGTask(task)
      toast({ title: placedToast[placed] })
    } catch {
      toast({ kind: 'info', title: placedToast[placed], text: 'У Google завдання лишилось відкритим' })
    }
  }

  // Контекстне меню: перенести або видалити в Google (з паузою на «Скасувати»)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const del = () => {
    setMenu(null)
    const undo = removeGTask(task, (msg) => toast({ kind: 'error', title: 'Google не видалив завдання', text: msg }))
    toast({ kind: 'info', icon: 'trash', title: 'Видалено з Google Tasks', action: { label: 'Скасувати', onClick: undo } })
  }

  // Минула дата — тиха позначка, без червоного «прострочено»
  const since = task.due && task.due < today ? `з ${fmtShortDay(Date.parse(`${task.due}T12:00:00`))}` : undefined
  const meta = [showList ? task.list : '', since].filter(Boolean).join(' · ')

  return (
    <>
      <PulseRow
        leading={<CheckCircle checked={finishing} onChange={toggle} label={`Виконано в Google: ${task.title}`} />}
        title={task.title}
        sub={task.notes?.split('\n')[0]}
        finishing={finishing}
        onMenu={finishing ? undefined : (x, y) => setMenu({ x, y })}
        meta={
          meta ? (
            <span className="inline-flex items-center gap-1 text-[12px] font-bold text-muted">
              <Icon name={since ? 'calendar' : 'list'} size={14} />
              {meta}
            </span>
          ) : undefined
        }
        actions={<RowAction icon="arrowUpRight" label="Перенести в Kast" onClick={moveToKast} />}
      />
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={task.title}
          autoFocus
          onClose={() => setMenu(null)}
          items={[
            { label: 'Перенести в Kast', icon: 'arrowUpRight', onSelect: () => (setMenu(null), void moveToKast()) },
            { label: 'Видалити з Google', icon: 'trashLines', tone: 'danger', onSelect: del },
          ]}
        />
      )}
    </>
  )
}
