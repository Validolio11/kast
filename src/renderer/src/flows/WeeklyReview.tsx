import { useState } from 'react'
import { Button, SegTabs, type ChipOption } from '@/design-system'
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
    <section className="flex flex-col gap-2 rounded-tile bg-tile p-5 pt-7">
      <div className="flex items-start justify-between gap-4 px-3 pb-2">
        <div>
          <h2 className="text-[30px] leading-[1.05] font-extrabold tracking-[-0.03em]">Ще актуально?</h2>
          <p className="mt-2 text-[15px] font-medium text-grey">
            Ці записи лежали понад 2 тижні, тож Kast прибрав їх у «Колись». Хвилина — і список знову чистий.
          </p>
        </div>
        <Button
          size="sm"
          variant="steel"
          onClick={async () => {
            await skipReview()
            onDone()
          }}
        >
          Пізніше
        </Button>
      </div>
      {tasks.map((t) => (
        <div key={t.id} className="flex min-h-[60px] flex-wrap items-center gap-3 rounded-[30px] py-2 pr-2 pl-5 shadow-[inset_0_0_0_1px_var(--color-steel)]">
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{t.title}</span>
          <SegTabs
            surface="canvas"
            label={`Рішення для «${t.title}»`}
            value={choices[t.id]}
            options={CHOICES}
            onChange={(v) => setChoices((s) => ({ ...s, [t.id]: v }))}
          />
        </div>
      ))}
      <div className="flex justify-end px-1 pt-2">
        <Button
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
