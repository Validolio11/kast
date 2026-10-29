import { useEffect, useState } from 'react'
import { CaptureField, InfoRow, ListSection, RowAction, useToast } from '@/design-system'
import { Page } from '@/components/Page'
import { TaskRow } from '@/components/TaskRow'
import { WeeklyReview } from '@/flows/WeeklyReview'
import { useStatus } from '@/data/hooks'
import { captureToInbox, remove, repeatNext, reviewCandidates, STALE_DAYS, takeToToday, toInbox, toSomeday, update } from '@/data/tasks'
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
  // Повтори, що чекають свого дня: видно, коли кожен повернеться
  const repeats = [...(useStatus('scheduled') ?? [])].sort((a, b) => (a.planDate ?? '').localeCompare(b.planDate ?? ''))

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
    toast({ kind: 'info', icon: 'trash', title: 'Задачу видалено', action: { label: 'Скасувати', onClick: () => update(id, { deleted: 0 }) } })
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
            <InfoRow
              icon="inbox"
              title={`${n} ${waitWord}`}
              text={oldest ? `найстаріший ${age(oldest)}` : undefined}
              tip={`Старше ${STALE_DAYS} днів тихо йде в «Колись»`}
            />
          )}
          {loaded && n === 0 && (
            <InfoRow icon="inbox" title="Вхідні порожні" text={prettyHotkey(hotkey)} tip="Швидкий запис з будь-якої програми" />
          )}
        </>
      }
      main={
        <>
          {review.length > 0 && <WeeklyReview tasks={review} onDone={() => setReview([])} />}

          {n > 0 && (
              <ListSection title="Нові" count={n}>
                {fresh.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    onOpen={onOpen}
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
          )}

          {repeats.length > 0 && (
            <ListSection title="Повтори" count={repeats.length} collapsible defaultOpen={false}>
              {repeats.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onOpen={onOpen}
                  muted
                  meta={t.planDate ? <span>{repeatNext(t.planDate)}</span> : undefined}
                  actions={<RowAction icon="sun" label="Зробити сьогодні" onClick={() => take(t.id)} />}
                />
              ))}
            </ListSection>
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
