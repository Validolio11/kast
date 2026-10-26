import { useState } from 'react'
import { Button, InlineChoice, type ChipOption } from '@/design-system'
import type { Task } from '@/data/db'
import { finishReview, skipReview, type ReviewChoice } from '@/data/tasks'

const CHOICES: ChipOption<ReviewChoice>[] = [
  { value: 'keep', label: 'Актуально', icon: 'inbox' },
  { value: 'someday', label: 'Колись', icon: 'archive' },
  { value: 'delete', label: 'Видалити', icon: 'trash' },
]

/** Раз на тиждень: коротке «Ще актуально?» для задач, що тихо застаріли */
export function WeeklyReview({ tasks, onDone }: { tasks: Task[]; onDone: () => void }) {
  const [choices, setChoices] = useState<Record<string, ReviewChoice>>(() =>
    Object.fromEntries(tasks.map((t) => [t.id, 'someday' as ReviewChoice])),
  )
  return (
    <section className="flex animate-fade-up flex-col gap-2 rounded-field bg-graphite p-2 pt-4">
      <div className="flex items-start justify-between gap-4 px-3">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">Ще актуально?</h2>
          <p className="mt-0.5 text-[13px] font-medium text-fog">
            Ці записи лежали понад 2 тижні, тож Kast прибрав їх у «Колись». Хвилина — і список знову чистий.
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            await skipReview()
            onDone()
          }}
        >
          Пізніше
        </Button>
      </div>
      <ul className="flex flex-col">
        {tasks.map((t) => (
          <li key={t.id} className="flex min-h-11 items-center gap-3 px-3">
            <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{t.title}</span>
            <InlineChoice label={`Рішення для «${t.title}»`} value={choices[t.id]} options={CHOICES} onChange={(v) => setChoices((s) => ({ ...s, [t.id]: v }))} />
          </li>
        ))}
      </ul>
      <div className="flex justify-end px-1 pb-1">
        <Button
          size="sm"
          variant="paper"
          onClick={async () => {
            await finishReview(choices)
            onDone()
          }}
        >
          Готово
        </Button>
      </div>
    </section>
  )
}
