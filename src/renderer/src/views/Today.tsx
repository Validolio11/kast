import { useState } from 'react'
import { Banner, Button, CaptureBar, EmptyState, ListGroup, ListRow, RowAction, useToast } from '@/design-system'
import { TaskRow } from '@/components/TaskRow'
import { Page } from '@/components/Page'
import { useDay, useLeftovers, useStatus, useToday } from '@/data/hooks'
import { addToToday, MAIN_LIMIT, markPlanned, SMALL_LIMIT, takeToToday, toInbox, type Placement } from '@/data/tasks'
import type { Task } from '@/data/db'
import { age, fmtLongDay, fromKey } from '@/lib/time'
import { useHour } from '@/lib/hooks'

const placedToast: Record<Exclude<Placement, 'main'>, string> = {
  small: '3 головні вже є — додано як дрібницю',
  inbox: 'День уже повний — записано у Вхідні',
}

export function Today({
  date,
  eveningHour,
  captureRef,
  onOpen,
  onCloseDay,
}: {
  date: string
  eveningHour: number
  captureRef: React.RefObject<HTMLInputElement | null>
  onOpen: (id: string) => void
  onCloseDay: () => void
}) {
  const [text, setText] = useState('')
  const toast = useToast()
  const hour = useHour()
  const loaded = useToday(date)
  const day = useDay(date)
  const leftovers = useLeftovers(date) ?? []
  const inbox = useStatus('inbox') ?? []
  const { main, small, done } = loaded ?? { main: [], small: [], done: [] }
  const full = main.length >= MAIN_LIMIT
  const planning = !!loaded && !day?.plannedAt && !day?.closedAt && !full && (leftovers.length > 0 || inbox.length > 0)
  const evening = hour >= eveningHour && !day?.closedAt && main.length + small.length + done.length > 0

  const notifyPlacement = (p: Placement) => {
    if (p !== 'main') toast({ kind: 'info', title: placedToast[p] })
  }

  return (
    <Page
      title="Сьогодні"
      subtitle={fmtLongDay()}
      meta={done.length ? `${done.length} зроблено` : undefined}
      capture={
        <CaptureBar
          ref={captureRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onSubmit={async (v) => {
            setText('')
            notifyPlacement(await addToToday(v))
          }}
          placeholder={full ? 'Додати дрібницю…' : 'Що найважливіше сьогодні?'}
          hint="Ctrl N"
          autoFocus
        />
      }
      footer={
        day?.closedAt ? (
          <Banner icon="moon" title="День закрито" text="Усе записано. Голова може відпочити." />
        ) : evening ? (
          <Banner
            tone="volt"
            icon="moon"
            title="Час закрити день"
            text="3 короткі кроки — і нічого не крутиться в голові"
            action={
              <Button size="sm" variant="paper" onClick={onCloseDay}>
                Закрити день
              </Button>
            }
          />
        ) : undefined
      }
    >
      {planning && (
        <PlanDay
          leftovers={leftovers}
          inbox={inbox}
          mainLeft={MAIN_LIMIT - main.length}
          onTake={async (id) => notifyPlacement(await takeToToday(id))}
          onDone={markPlanned}
        />
      )}

      <ListGroup label="Головні" count={`${main.length} / ${MAIN_LIMIT}`}>
        {main.map((t) => (
          <TaskRow key={t.id} task={t} onOpen={onOpen} showWhen actions={<BackToInbox id={t.id} />} />
        ))}
        {loaded && main.length === 0 && !planning && (
          <EmptyState
            icon="target"
            title="Що найважливіше сьогодні?"
            text="Запишіть 1–3 справи вгорі. Не більше: решта спокійно почекає у Вхідних."
          />
        )}
      </ListGroup>

      {small.length > 0 && (
        <ListGroup label="Дрібниці" count={`${small.length} / ${SMALL_LIMIT}`} collapsible>
          {small.map((t) => (
            <TaskRow key={t.id} task={t} onOpen={onOpen} actions={<BackToInbox id={t.id} />} />
          ))}
        </ListGroup>
      )}

      {done.length > 0 && (
        <ListGroup label="Зроблено" count={done.length} collapsible defaultOpen={false}>
          {done.map((t) => (
            <TaskRow key={t.id} task={t} onOpen={onOpen} />
          ))}
        </ListGroup>
      )}
    </Page>
  )
}

function BackToInbox({ id }: { id: string }) {
  return <RowAction icon="inbox" label="Повернути у Вхідні" onClick={() => toInbox(id)} />
}

/** Ранковий вибір: спершу незавершене, потім Вхідні. Один клік — задача на сьогодні. */
function PlanDay({
  leftovers,
  inbox,
  mainLeft,
  onTake,
  onDone,
}: {
  leftovers: Task[]
  inbox: Task[]
  mainLeft: number
  onTake: (id: string) => void
  onDone: () => void
}) {
  const fresh = [...inbox].sort((a, b) => b.inboxAt - a.inboxAt).slice(0, 7)
  const row = (t: Task, meta: string) => (
    <ListRow
      key={t.id}
      leading={
        <button
          onClick={() => onTake(t.id)}
          aria-label={`Взяти на сьогодні: ${t.title}`}
          className="grid size-[22px] place-items-center rounded-[7px] bg-paper text-night transition active:scale-90"
        >
          <span className="text-[15px] leading-none font-bold">+</span>
        </button>
      }
      title={t.title}
      meta={meta}
      onClick={() => onTake(t.id)}
    />
  )
  return (
    <section className="flex animate-fade-up flex-col gap-2 rounded-field bg-graphite p-2 pt-4">
      <div className="flex items-start justify-between gap-4 px-3">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">План на день</h2>
          <p className="mt-0.5 text-[13px] font-medium text-fog">
            Виберіть ще {mainLeft} {mainLeft === 1 ? 'головну' : 'головні'}. Потім задайте кожній «коли» — так вона справді станеться.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Готово
        </Button>
      </div>
      {leftovers.length > 0 && (
        <ListGroup label="Не завершено раніше" count={leftovers.length}>
          {leftovers.map((t) => row(t, t.planDate ? age(fromKey(t.planDate).getTime()) : ''))}
        </ListGroup>
      )}
      {fresh.length > 0 && (
        <ListGroup label="З Вхідних" count={inbox.length}>
          {fresh.map((t) => row(t, age(t.inboxAt)))}
        </ListGroup>
      )}
    </section>
  )
}
