import { useState } from 'react'
import { CaptureField, InfoRow, ListSection, MiniWeek, RowAction } from '@/design-system'
import { Page } from '@/components/Page'
import { TaskRow } from '@/components/TaskRow'
import { useDone, useStatus } from '@/data/hooks'
import { toInbox } from '@/data/tasks'
import { dayKey, fmtShortDay, fmtTime, fmtWeekday, nowDate, plural, weekStart } from '@/lib/time'

export function Done({ captureRef, onOpen }: { captureRef: React.RefObject<HTMLInputElement | null>; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const loaded = useDone()
  const dropped = useStatus('dropped') ?? []
  const done = loaded ?? []

  const today = dayKey()
  const monday = weekStart()
  const q = query.trim().toLowerCase()
  const list = q ? done.filter((t) => t.title.toLowerCase().includes(q)) : done
  const shownDropped = q ? dropped.filter((t) => t.title.toLowerCase().includes(q)) : dropped
  const keyOf = (ts: number | null) => dayKey(new Date(ts ?? 0))

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    const k = dayKey(d)
    return { label: fmtWeekday(d), count: done.filter((t) => keyOf(t.doneAt) === k).length, today: k === today, future: d > nowDate() }
  })
  const weekTotal = week.reduce((s, d) => s + d.count, 0)

  const todays = list.filter((t) => keyOf(t.doneAt) === today)
  const thisWeek = list.filter((t) => keyOf(t.doneAt) !== today && (t.doneAt ?? 0) >= monday.getTime())
  const earlier = list.filter((t) => (t.doneAt ?? 0) < monday.getTime()).slice(0, 100)

  return (
    <Page
      light="Що вже"
      heavy="зроблено"
      sub="Видимий прогрес — без оцінок і прострочень"
      side={
        <>
          <CaptureField
            ref={captureRef}
            icon="search"
            search
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onSubmit={() => {}}
            placeholder="Пошук у зробленому"
            autoFocus
          />
          {!q && (
            <InfoRow icon="calendar" title="Цей тиждень" text={plural(weekTotal, ['справа', 'справи', 'справ'])}>
              <MiniWeek days={week} />
            </InfoRow>
          )}
          {loaded && list.length === 0 && (
            <InfoRow
              icon={q ? 'search' : 'check'}
              title={q ? 'Нічого не знайдено' : 'Ще нічого не зроблено'}
              tip={q ? undefined : 'Кожна галочка з’явиться тут'}
            />
          )}
        </>
      }
      main={
        <>
          {todays.length > 0 && (
            <ListSection title="Сьогодні" count={todays.length}>
              {todays.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={onOpen} meta={<span className="tabular-nums">{fmtTime(t.doneAt!)}</span>} />
              ))}
            </ListSection>
          )}
          {thisWeek.length > 0 && (
            <ListSection title="Цей тиждень" count={thisWeek.length}>
              {thisWeek.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={onOpen} meta={fmtWeekday(new Date(t.doneAt!))} />
              ))}
            </ListSection>
          )}
          {earlier.length > 0 && (
            <ListSection title="Раніше" count={earlier.length} collapsible defaultOpen={!!q}>
              {earlier.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={onOpen} meta={fmtShortDay(t.doneAt!)} />
              ))}
            </ListSection>
          )}
          {/* Відпущене при закритті дня: без провини, але не безповоротно */}
          {shownDropped.length > 0 && (
            <ListSection title="Відпущено" count={shownDropped.length} collapsible defaultOpen={false}>
              {[...shownDropped]
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    onOpen={onOpen}
                    muted
                    meta={fmtShortDay(t.updatedAt)}
                    actions={<RowAction icon="inbox" label="Повернути у Вхідні" onClick={() => toInbox(t.id)} />}
                  />
                ))}
            </ListSection>
          )}
        </>
      }
    />
  )
}
