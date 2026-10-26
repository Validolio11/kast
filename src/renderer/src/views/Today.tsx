import { useState } from 'react'
import { Button, CaptureField, Card, EmptyCard, Glass, Hatch, ListSection, PulseChip, PulseRow, RowAction, useToast } from '@/design-system'
import { TaskRow, WHEN_OPTIONS } from '@/components/TaskRow'
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

  const [light, heavy] = day?.closedAt
    ? ['День', 'закрито']
    : main.length
      ? ['Сьогодні', MAIN_WORDS[main.length]]
      : total
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
            <Card tone="paper" className="flex flex-col gap-4 p-7">
              <PulseChip dot="#13f287" className="self-start">
                Зараз{now.when !== 'any' ? ` · ${WHEN_OPTIONS.find((o) => o.value === now.when)?.label}` : ''}
              </PulseChip>
              <div>
                <h2 className="text-[30px] leading-[1.05] font-extrabold tracking-[-0.03em] break-words">{now.title}</h2>
                {now.firstStep && <p className="mt-2 text-[15px] font-semibold text-paper-muted">Перший крок: {now.firstStep}</p>}
              </div>
              <Button variant="canvas" size="lg" iconLeft="play" fullWidth onClick={() => onOpen(now.id)}>
                Почати
              </Button>
            </Card>
          ) : (
            !planning &&
            !day?.closedAt && (
              <Card tone="data" className="flex flex-col gap-4 p-7">
                <p className="text-[34px] leading-[0.95] font-light tracking-[-0.035em] uppercase">
                  Запиши
                  <strong className="block font-extrabold">1–3 справи</strong>
                </p>
                <p className="text-[15px] leading-[1.45] font-medium text-white/85">
                  Не більше. Решта спокійно почекає у Вхідних — так голова не розпорошується.
                </p>
              </Card>
            )
          )}

          {total > 0 && <ProgressTile done={done.length} total={total} />}

          {evening && (
            <Card tone="outline" className="flex flex-col gap-3 shadow-[inset_0_0_0_1px_var(--color-growth)]">
              <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-growth">Час закрити день</h2>
              <p className="text-[15px] font-medium text-grey">Три короткі кроки — і нічого не крутиться в голові до завтра.</p>
              <Button variant="paper" iconLeft="moon" onClick={onCloseDay} className="self-start">
                Закрити день
              </Button>
            </Card>
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

          {loaded && main.length === 0 && !planning ? (
            <EmptyCard
              icon={day?.closedAt ? 'moon' : 'target'}
              title={day?.closedAt ? 'Усе записано' : 'Почніть з однієї справи'}
              text={
                day?.closedAt
                  ? 'Завтрашнє вже чекає. Голова може відпочити.'
                  : 'Напишіть її в полі ліворуч і натисніть Enter. Три головні — межа, щоб день не розсипався.'
              }
            />
          ) : (
            main.length > 0 && (
              <ListSection title="Головні" count={`${main.length} / ${MAIN_LIMIT}`} first={!planning}>
                {main.map((t) => (
                  <TaskRow key={t.id} task={t} onOpen={onOpen} showWhen actions={<BackToInbox id={t.id} />} />
                ))}
              </ListSection>
            )
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

/** Плитка дня: штрихування — частка зробленого, цифра — герой */
function ProgressTile({ done, total }: { done: number; total: number }) {
  const pct = Math.round((done / total) * 100)
  return (
    <section className="relative flex h-32 animate-fade-up items-center justify-between overflow-hidden rounded-tile bg-tile pr-5 pl-8">
      <Hatch value={pct} color="#13f287" />
      <Glass className="-ml-3.5 flex flex-col gap-1.5 py-3 pr-4 pl-3.5">
        <span className="text-[20px] font-extrabold tracking-[-0.02em]">Зроблено сьогодні</span>
        <span className="text-[14px] font-bold text-grey">{done ? `${done} з ${total}` : 'Перша галочка — найважча'}</span>
      </Glass>
      <Glass className="px-3.5 py-2.5">
        <span className="text-[48px] leading-none font-extrabold tracking-[-0.045em] tabular-nums">{pct}%</span>
      </Glass>
    </section>
  )
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
    <PulseRow
      key={t.id}
      leading={
        <button
          onClick={() => onTake(t.id)}
          aria-label={`Взяти на сьогодні: ${t.title}`}
          className="grid size-8 place-items-center rounded-full bg-paper text-[18px] leading-none font-extrabold text-ink transition active:scale-90"
        >
          +
        </button>
      }
      title={t.title}
      meta={meta}
      onClick={() => onTake(t.id)}
    />
  )
  return (
    <section className="flex animate-fade-up flex-col gap-2 rounded-tile bg-tile p-5 pt-7">
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
          {leftovers.map((t) => row(t, t.planDate ? age(fromKey(t.planDate).getTime()) : ''))}
        </>
      )}
      {fresh.length > 0 && (
        <>
          <span className="px-3 pt-2 text-[13px] font-extrabold text-muted">З Вхідних · {inbox.length}</span>
          {fresh.map((t) => row(t, age(t.inboxAt)))}
        </>
      )}
    </section>
  )
}
