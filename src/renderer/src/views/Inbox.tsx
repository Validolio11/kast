import { useEffect, useState } from 'react'
import { CaptureField, Card, EmptyCard, ListSection, RowAction, useToast } from '@/design-system'
import { Page } from '@/components/Page'
import { TaskRow } from '@/components/TaskRow'
import { WeeklyReview } from '@/flows/WeeklyReview'
import { useStatus } from '@/data/hooks'
import { captureToInbox, remove, reviewCandidates, STALE_DAYS, takeToToday, toInbox, toSomeday, update } from '@/data/tasks'
import type { Task } from '@/data/db'
import { age, pluralWord } from '@/lib/time'
import { prettyHotkey } from '@/lib/hooks'

export function Inbox({
  captureRef,
  hotkey,
  onOpen,
}: {
  captureRef: React.RefObject<HTMLInputElement | null>
  hotkey: string
  onOpen: (id: string) => void
}) {
  const [text, setText] = useState('')
  const [review, setReview] = useState<Task[]>([])
  const toast = useToast()
  const loaded = useStatus('inbox')
  const inbox = loaded ?? []
  const someday = useStatus('someday') ?? []

  useEffect(() => {
    reviewCandidates().then(setReview)
  }, [])

  const fresh = [...inbox].sort((a, b) => b.inboxAt - a.inboxAt)
  const oldest = inbox.length ? Math.min(...inbox.map((t) => t.inboxAt)) : null
  const n = inbox.length
  const waitWord = pluralWord(n, ['запис чекає', 'записи чекають', 'записів чекають'])

  const take = async (id: string) => {
    const p = await takeToToday(id)
    toast(
      p === 'inbox'
        ? { kind: 'info', title: 'На сьогодні вже 3 головні й 5 дрібниць', text: 'Закрийте щось або візьміть завтра' }
        : { title: p === 'main' ? 'Взято на сьогодні' : 'Взято як дрібницю' },
    )
  }

  const del = async (id: string) => {
    await remove(id)
    toast({ kind: 'info', title: 'Задачу видалено', action: { label: 'Скасувати', onClick: () => update(id, { deleted: 0 }) } })
  }

  return (
    <Page
      light="Усе"
      heavy="записане"
      sub="Звідси беремо лише 3 головні на день"
      side={
        <>
          <CaptureField
            ref={captureRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onSubmit={async (v) => {
              setText('')
              await captureToInbox(v)
            }}
            placeholder="Записати думку, справу, ідею…"
            autoFocus
          />
          {n > 0 && (
          <Card className="flex flex-col gap-2 p-7">
            <span className="text-[48px] leading-none font-extrabold tracking-[-0.045em] tabular-nums">{n}</span>
            <span className="text-[14px] font-bold text-grey">
              {waitWord}
              {oldest ? ` · найстаріший ${age(oldest)}` : ''}
            </span>
            <p className="mt-2 text-[13px] font-semibold text-muted">
              Записи, що лежать понад {STALE_DAYS} днів, тихо йдуть у «Колись». Нічого не губиться, але й не тисне.
            </p>
          </Card>
          )}
        </>
      }
      main={
        <>
          {review.length > 0 && <WeeklyReview tasks={review} onDone={() => setReview([])} />}

          {loaded && n === 0 ? (
            <EmptyCard
              icon="inbox"
              title="Вхідні порожні"
              text={`Записуйте все, що спадає на думку, — навіть з інших програм через ${prettyHotkey(hotkey)}.`}
            />
          ) : (
            n > 0 && (
              <ListSection title="Нові" count={n} first={!review.length}>
                {fresh.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    onOpen={onOpen}
                    meta={<span className="tabular-nums">{age(t.inboxAt)}</span>}
                    actions={
                      <>
                        <RowAction icon="sun" label="На сьогодні" onClick={() => take(t.id)} />
                        <RowAction icon="archive" label="У «Колись»" onClick={() => toSomeday(t.id)} />
                        <RowAction icon="trash" label="Видалити" tone="danger" onClick={() => del(t.id)} />
                      </>
                    }
                  />
                ))}
              </ListSection>
            )
          )}

          {someday.length > 0 && (
            <ListSection title="Колись" count={someday.length} collapsible defaultOpen={false}>
              {someday.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onOpen={onOpen}
                  muted
                  actions={
                    <>
                      <RowAction icon="inbox" label="Повернути у Вхідні" onClick={() => toInbox(t.id)} />
                      <RowAction icon="trash" label="Видалити" tone="danger" onClick={() => del(t.id)} />
                    </>
                  }
                />
              ))}
            </ListSection>
          )}
        </>
      }
    />
  )
}
