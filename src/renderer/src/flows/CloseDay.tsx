import { useEffect, useState } from 'react'
import { Button, Icon, Modal, SegTabs, useToast, type ChipOption } from '@/design-system'
import { db, type Task } from '@/data/db'
import { closeDay, type CloseChoice } from '@/data/tasks'
import { dayKey } from '@/lib/time'

const CHOICES: ChipOption<CloseChoice>[] = [
  { value: 'tomorrow', label: 'Завтра', icon: 'sunrise' },
  { value: 'inbox', label: 'У Вхідні', icon: 'inbox' },
  { value: 'letgo', label: 'Відпустити', icon: 'wind' },
]

/**
 * Ритуал завершення дня (shutdown ritual): один екран, три кроки.
 * Мета — закрити всі відкриті петлі, щоб справи не крутилися в голові ввечері.
 */
export function CloseDay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [done, setDone] = useState<Task[]>([])
  const [unfinishedTasks, setUnfinished] = useState<Task[]>([])
  const [choices, setChoices] = useState<Record<string, CloseChoice>>({})
  const [note, setNote] = useState('')
  const toast = useToast()

  useEffect(() => {
    if (!open) return
    const today = dayKey()
    db.tasks.toArray().then((rows) => {
      const live = rows.filter((t) => !t.deleted)
      setDone(live.filter((t) => t.status === 'done' && t.doneAt && dayKey(new Date(t.doneAt)) === today))
      const unfinished = live.filter((t) => t.status === 'today' && t.planDate && t.planDate <= today)
      setUnfinished(unfinished)
      setChoices(Object.fromEntries(unfinished.map((t) => [t.id, 'tomorrow' as CloseChoice])))
      setNote('')
    })
  }, [open])

  const submit = async () => {
    await closeDay(choices, note)
    onClose()
    toast({ title: 'День закрито', text: 'Завтрашній план уже чекає' })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Закрити день"
      description="Три кроки — і можна відпочивати з порожньою головою."
      footer={
        <Button variant="paper" size="lg" iconLeft="moon" onClick={submit}>
          Закрити день
        </Button>
      }
    >
      <div className="flex flex-col gap-8 pb-2">
        <Step n={1} title="Що зроблено">
          {done.length ? (
            <ul className="flex flex-col gap-2">
              {done.map((t) => (
                <li key={t.id} className="flex min-h-11 items-center gap-3.5 text-[15px] font-semibold">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-paper text-ink">
                    <Icon name="check" size={16} strokeWidth={3} />
                  </span>
                  <span className="truncate">{t.title}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[15px] font-medium text-grey">Сьогодні без галочок — і це теж нормально. Завтра новий день.</p>
          )}
        </Step>

        {unfinishedTasks.length > 0 && (
          <Step n={2} title="Незавершене — куди далі?">
            <ul className="flex flex-col gap-2">
              {unfinishedTasks.map((t) => (
                <li key={t.id} className="flex min-h-[60px] flex-wrap items-center gap-3 rounded-[30px] py-2 pr-2 pl-5 shadow-[inset_0_0_0_1px_var(--color-steel)]">
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{t.title}</span>
                  <SegTabs
                    surface="canvas"
                    label={`Що робити з «${t.title}»`}
                    value={choices[t.id]}
                    options={CHOICES}
                    onChange={(v) => setChoices((s) => ({ ...s, [t.id]: v }))}
                  />
                </li>
              ))}
            </ul>
          </Step>
        )}

        <Step n={unfinishedTasks.length > 0 ? 3 : 2} title="Що в голові на завтра?">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Вивантажте все, що крутиться. Кожен рядок стане записом у Вхідних."
            className="w-full resize-none rounded-[28px] bg-canvas px-5 py-4 text-[16px] leading-relaxed font-semibold text-paper caret-growth outline-none placeholder:text-muted focus:shadow-[inset_0_0_0_2px_var(--color-growth)]"
          />
        </Step>
      </div>
    </Modal>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="grid size-8 place-items-center rounded-full bg-canvas text-[14px] font-extrabold tabular-nums">{n}</span>
        <h3 className="text-[20px] font-extrabold tracking-[-0.02em]">{title}</h3>
      </div>
      <div>{children}</div>
    </section>
  )
}
