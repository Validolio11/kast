import { useState } from 'react'
import { Button, CaptureField, Card, Icon, InfoRow, ListSection, PulseChip, PulseRow, RowAction, useToast } from '@/design-system'
import { ageOf, TaskRow, WHEN_OPTIONS } from '@/components/TaskRow'
import { Page } from '@/components/Page'
import { useDay, useLeftovers, useStatus, useToday } from '@/data/hooks'
import { addToToday, MAIN_LIMIT, markPlanned, SMALL_LIMIT, takeToToday, toInbox, type Placement } from '@/data/tasks'
import type { Task } from '@/data/db'
import { fmtLongDay } from '@/lib/time'
import { useHour } from '@/lib/hooks'

const placedToast: Record<Exclude<Placement, 'main'>, string> = {
  small: '3 головні вже є — додано як дрібницю',
  inbox: 'День уже повний — записано у Вхідні',
}
const MAIN_WORDS = ['', 'одна головна', 'дві головні', 'три головні']

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
  const total = main.length + small.length + done.length
  const planning = !!loaded && !day?.plannedAt && !day?.closedAt && !full && (leftovers.length > 0 || inbox.length > 0)
  const evening = hour >= eveningHour && !day?.closedAt && total > 0
  const now = main[0] ?? small[0]

  const notifyPlacement = (p: Placement) => {
    if (p !== 'main') toast({ kind: 'info', title: placedToast[p] })
  }

  // «День закрито» — лише поки після закриття не з'явилося нових справ
  const [light, heavy] = day?.closedAt && !main.length && !small.length
    ? ['День', 'закрито']
    : main.length
      ? ['Сьогодні', MAIN_WORDS[main.length]]
      : done.length
        ? ['Головне', 'зроблено']
        : ['Що головне', 'сьогодні?']

  return (
    <Page
      light={light}
      heavy={heavy}
      sub={fmtLongDay()}
      side={
        <>
          <CaptureField
            ref={captureRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onSubmit={async (v) => {
              setText('')
              notifyPlacement(await addToToday(v))
            }}
            placeholder={full ? 'Додати дрібницю…' : 'Що найважливіше сьогодні?'}
            autoFocus
          />

          {now ? (
            // Герой картки — сама задача; дія — тиха кругла кнопка, зелений лише на «Зараз»
            <Card tone="paper" className="flex flex-col gap-5 p-7">
              <PulseChip tone="growth" dot="#090a0a" className="self-start">
                Зараз{now.when !== 'any' ? ` · ${WHEN_OPTIONS.find((o) => o.value === now.when)?.label}` : ''}
              </PulseChip>
              <div className="flex items-end gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-[44px] leading-[0.95] font-extrabold tracking-[-0.04em] break-words">{now.title}</h2>
                  {now.firstStep && <p className="mt-3 text-[15px] font-semibold text-paper-muted">{now.stepsDone ? 'Наступний крок' : 'Перший крок'}: {now.firstStep}</p>}
                </div>
                <button
                  onClick={() => onOpen(now.id)}
                  aria-label={`Почати: ${now.title}`}
                  data-tip="Почати"
                  className="grid size-14 shrink-0 place-items-center rounded-full bg-canvas text-white transition hover:-translate-y-0.5 active:scale-[0.97]"
                >
                  <Icon name="play" size={20} />
                </button>
              </div>
            </Card>
          ) : null}

          {total > 0 && (
            <InfoRow
              icon="check"
              title="Зроблено сьогодні"
              text={done.length ? `${done.length} з ${total}` : 'ще попереду'}
              progress={(done.length / total) * 100}
            >
              <span className="text-[15px] font-extrabold text-white tabular-nums">{Math.round((done.length / total) * 100)}%</span>
            </InfoRow>
          )}

          {evening && (
            <InfoRow tone="accent" icon="moon" title="Час закрити день" tip="Три кроки — і голова вільна до завтра">
              <Button size="sm" variant="paper" onClick={onCloseDay}>
                Закрити день
              </Button>
            </InfoRow>
          )}

          {loaded && main.length === 0 && !planning && (
            <InfoRow
              icon={day?.closedAt ? 'moon' : 'target'}
              title={day?.closedAt ? 'Усе записано' : 'Почніть з однієї справи'}
              text={day?.closedAt ? 'до завтра' : undefined}
              tip={day?.closedAt ? undefined : 'До трьох головних на день — решта у Вхідних'}
            />
          )}
        </>
      }
      main={
        <>

          {planning && (
            <PlanDay
              leftovers={leftovers}
              inbox={inbox}
              mainLeft={MAIN_LIMIT - main.length}
              onTake={async (id) => notifyPlacement(await takeToToday(id))}
              onDone={markPlanned}
            />
          )}

          {main.length > 0 && (
            <ListSection title="Головні" count={`${main.length} / ${MAIN_LIMIT}`}>
              {main.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={onOpen} showWhen actions={<BackToInbox id={t.id} />} />
              ))}
            </ListSection>
          )}

          {small.length > 0 && (
            <ListSection title="Дрібниці" count={`${small.length} / ${SMALL_LIMIT}`} collapsible>
              {small.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={onOpen} actions={<BackToInbox id={t.id} />} />
              ))}
            </ListSection>
          )}

          {done.length > 0 && (
            <ListSection title="Зроблено" count={done.length} collapsible defaultOpen={false}>
              {done.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={onOpen} />
              ))}
            </ListSection>
          )}
        </>
      }
    />
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
  // Незавершені з минулих днів показані окремо — у «З Вхідних» їх не дублюємо
  const fresh = inbox.filter((t) => !t.planDate).sort((a, b) => b.inboxAt - a.inboxAt).slice(0, 7)
  const row = (t: Task) => (
    <PulseRow
      key={t.id}
      leading={
        <button
          onClick={() => onTake(t.id)}
          aria-label={`Взяти на сьогодні: ${t.title}`}
          className="grid size-8 place-items-center rounded-full bg-paper text-ink transition active:scale-90"
        >
          <Icon name="plus" size={16} strokeWidth={2.8} />
        </button>
      }
      title={t.title}
      age={ageOf(t)}
      onClick={() => onTake(t.id)}
    />
  )
  return (
    <section className="flex flex-col gap-2 rounded-tile bg-tile p-5 pt-7">
      <div className="flex items-start justify-between gap-4 px-3 pb-2">
        <div>
          <h2 className="text-[30px] leading-[1.05] font-extrabold tracking-[-0.03em]">План на день</h2>
          <p className="mt-2 text-[15px] font-medium text-grey">
            Візьміть ще {mainLeft} {mainLeft === 1 ? 'головну' : 'головні'}. Потім кожній — «коли»: так вона справді станеться.
          </p>
        </div>
        <Button size="sm" variant="steel" onClick={onDone}>
          Готово
        </Button>
      </div>
      {leftovers.length > 0 && (
        <>
          <span className="px-3 pt-2 text-[13px] font-extrabold text-muted">Не завершено раніше</span>
          {leftovers.map(row)}
        </>
      )}
      {fresh.length > 0 && (
        <>
          <span className="px-3 pt-2 text-[13px] font-extrabold text-muted">З Вхідних · {inbox.length}</span>
          {fresh.map(row)}
        </>
      )}
    </section>
  )
}
