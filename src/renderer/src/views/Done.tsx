import { useState } from 'react'
import { CaptureBar, EmptyState, ListGroup, WeekStrip } from '@/design-system'
import { Page } from '@/components/Page'
import { TaskRow } from '@/components/TaskRow'
import { useDone } from '@/data/hooks'
import { dayKey, fmtShortDay, fmtTime, fmtWeekday, nowDate, weekStart } from '@/lib/time'

export function Done({ captureRef, onOpen }: { captureRef: React.RefObject<HTMLInputElement | null>; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const loaded = useDone()
  const done = loaded ?? []

  const today = dayKey()
  const monday = weekStart()
  const q = query.trim().toLowerCase()
  const list = q ? done.filter((t) => t.title.toLowerCase().includes(q)) : done
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
      title="Готово"
      subtitle="Видимий прогрес — без оцінок і прострочень"
      meta={`${weekTotal} цього тижня`}
      capture={
        <CaptureBar
          ref={captureRef}
          icon="search"
          search
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onSubmit={() => {}}
          placeholder="Пошук у зробленому…"
          autoFocus
          hint="Ctrl N"
        />
      }
    >
      {!q && <WeekStrip days={week} />}

      {todays.length > 0 && (
        <ListGroup label="Сьогодні" count={todays.length}>
          {todays.map((t) => (
            <TaskRow key={t.id} task={t} onOpen={onOpen} meta={<span className="tabular-nums">{fmtTime(t.doneAt!)}</span>} />
          ))}
        </ListGroup>
      )}
      {thisWeek.length > 0 && (
        <ListGroup label="Цей тиждень" count={thisWeek.length}>
          {thisWeek.map((t) => (
            <TaskRow key={t.id} task={t} onOpen={onOpen} meta={fmtWeekday(new Date(t.doneAt!))} />
          ))}
        </ListGroup>
      )}
      {earlier.length > 0 && (
        <ListGroup label="Раніше" count={earlier.length} collapsible defaultOpen={!!q}>
          {earlier.map((t) => (
            <TaskRow key={t.id} task={t} onOpen={onOpen} meta={fmtShortDay(t.doneAt!)} />
          ))}
        </ListGroup>
      )}
      {loaded && list.length === 0 && (
        <EmptyState
          icon={q ? 'search' : 'check'}
          title={q ? 'Нічого не знайдено' : 'Тут збиратиметься зроблене'}
          text={q ? undefined : 'Кожна галочка лишається тут. Наприкінці тижня приємно подивитися, скільки всього позаду.'}
        />
      )}
    </Page>
  )
}
