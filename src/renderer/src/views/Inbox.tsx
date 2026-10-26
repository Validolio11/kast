import { useEffect, useState } from 'react'
import { CaptureBar, EmptyState, Kbd, ListGroup, RowAction, useToast } from '@/design-system'
import { Page } from '@/components/Page'
import { TaskRow } from '@/components/TaskRow'
import { WeeklyReview } from '@/flows/WeeklyReview'
import { useStatus } from '@/data/hooks'
import { captureToInbox, remove, reviewCandidates, takeToToday, toInbox, toSomeday, update } from '@/data/tasks'
import type { Task } from '@/data/db'
import { age, plural } from '@/lib/time'
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
      title="Вхідні"
      subtitle="Усе записане чекає тут. На сьогодні беремо лише 3 головні"
      meta={plural(inbox.length, ['запис', 'записи', 'записів'])}
      capture={
        <CaptureBar
          ref={captureRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onSubmit={async (v) => {
            setText('')
            await captureToInbox(v)
          }}
          placeholder="Записати думку, справу, ідею…"
          hint="Ctrl N"
          autoFocus
        />
      }
    >
      {review.length > 0 && <WeeklyReview tasks={review} onDone={() => setReview([])} />}

      <ListGroup label="Нові" count={inbox.length}>
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
        {loaded && inbox.length === 0 && (
          <EmptyState
            icon="inbox"
            title="Вхідні порожні"
            text={
              <>
                Записуйте все, що спадає на думку, — навіть з інших програм через <Kbd>{prettyHotkey(hotkey)}</Kbd>
              </>
            }
          />
        )}
      </ListGroup>

      {someday.length > 0 && (
        <ListGroup label="Колись" count={someday.length} collapsible defaultOpen={false}>
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
        </ListGroup>
      )}
    </Page>
  )
}
