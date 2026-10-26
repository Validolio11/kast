import { useEffect, useRef, useState } from 'react'
import { Button, CaptureField, cn, EmptyCard, Icon, PulseChip, RoundButton, useToast } from '@/design-system'
import { Page } from '@/components/Page'
import { useNotes } from '@/data/hooks'
import { createNote, lineToTask, notePreview, noteTitle, removeNote, TASK_LINE, updateNote } from '@/data/notes'
import type { Note } from '@/data/db'
import { age, fmtTime, pluralWord } from '@/lib/time'

export function Notebook({ captureRef }: { captureRef: React.RefObject<HTMLInputElement | null> }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const loaded = useNotes()
  const notes = loaded ?? []

  const q = query.trim().toLowerCase()
  const shown = q ? notes.filter((n) => n.body.toLowerCase().includes(q)) : notes
  const current = notes.find((n) => n.id === selected) ?? shown[0]

  const create = async (first = '') => {
    setQuery('')
    const n = await createNote(first ? `${first}\n` : '')
    setSelected(n.id)
    requestAnimationFrame(() => titleRef.current?.focus())
  }

  return (
    <Page
      light="Мій"
      heavy="блокнот"
      sub={`${notes.length} ${pluralWord(notes.length, ['нотатка', 'нотатки', 'нотаток'])} · рядок із [] + Enter — і це задача`}
      fill
      side={
        <>
          <CaptureField
            ref={captureRef}
            icon="search"
            search
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onSubmit={() => {}}
            onKeyDown={(e) => {
              // Enter у порожньому пошуку створює нотатку з введеним текстом як заголовком
              if (e.key === 'Enter' && query.trim() && !shown.length) {
                e.preventDefault()
                create(query.trim())
              }
            }}
            placeholder="Пошук"
            action={{ icon: 'plus', label: 'Нова нотатка', onClick: () => create() }}
            autoFocus
          />
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pb-1 min-[1040px]:flex-1">
            {shown.map((n) => (
              <NoteTile key={n.id} note={n} selected={n.id === current?.id} onClick={() => setSelected(n.id)} />
            ))}
            {loaded && q && !shown.length && (
              <p className="px-4 py-2 text-[14px] font-semibold text-muted">Нічого не знайдено. Enter — створити нотатку «{query.trim()}».</p>
            )}
          </div>
        </>
      }
      main={
        current ? (
          <Sheet key={current.id} note={current} titleRef={titleRef} onDeleted={() => setSelected(null)} />
        ) : (
          loaded && (
            <EmptyCard icon="notebook" title="Тут народжуються думки" text="Нотатки, протоколи, чернетки. Коли думка стає справою — один Enter, і вона у Вхідних.">
              <Button iconLeft="plus" onClick={() => create()}>
                Нова нотатка
              </Button>
            </EmptyCard>
          )
        )
      }
    />
  )
}

function NoteTile({ note, selected, onClick }: { note: Note; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-current={selected || undefined}
      className={cn(
        'flex shrink-0 animate-row-in items-center gap-3 rounded-[30px] px-6 py-[18px] text-left transition-colors duration-150',
        selected ? 'bg-steel' : 'bg-tile hover:bg-[#2a2a2c]',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-extrabold text-white">{noteTitle(note.body)}</span>
        <span className="mt-1 block truncate text-[13px] font-semibold text-muted">{notePreview(note.body) || age(note.updatedAt)}</span>
      </span>
      {!!note.pinned && (
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-paper text-ink">
          <Icon name="pin" size={14} />
        </span>
      )}
    </button>
  )
}

/** Аркуш нотатки: заголовок — перший рядок, далі текст. Зберігається сам. */
function Sheet({ note, titleRef, onDeleted }: { note: Note; titleRef: React.RefObject<HTMLInputElement | null>; onDeleted: () => void }) {
  const [body, setBody] = useState(note.body)
  const toast = useToast()
  const textRef = useRef<HTMLTextAreaElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pending = useRef<string | null>(null)

  const nl = body.indexOf('\n')
  const title = nl === -1 ? body : body.slice(0, nl)
  const rest = nl === -1 ? '' : body.slice(nl + 1)

  // Зміни ззовні (синхронізація, швидкий запис) підхоплюємо, якщо ви зараз не друкуєте
  useEffect(() => {
    if (pending.current === null && note.body !== body) setBody(note.body)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.body])

  const flush = () => {
    clearTimeout(saveTimer.current)
    if (pending.current !== null) updateNote(note.id, { body: pending.current })
    pending.current = null
  }
  useEffect(() => flush, []) // eslint-disable-line react-hooks/exhaustive-deps

  const change = (v: string) => {
    setBody(v)
    pending.current = v
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flush, 400)
  }

  /** lineIndex — номер рядка в тексті під заголовком */
  const convert = async (lineIndex: number, addNewLine: boolean) => {
    flush()
    const next = await lineToTask(note.id, body, lineIndex + 1)
    if (next === null) return
    const lines = next.split('\n')
    if (addNewLine) lines.splice(lineIndex + 2, 0, '')
    const result = lines.join('\n')
    setBody(result)
    if (addNewLine) {
      updateNote(note.id, { body: result })
      const caret = lines.slice(1, lineIndex + 2).join('\n').length + 1
      requestAnimationFrame(() => textRef.current?.setSelectionRange(caret, caret))
    }
    toast({ title: 'Задачу додано у Вхідні' })
  }

  const onKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    const pos = e.currentTarget.selectionStart
    const lineIndex = rest.slice(0, pos).split('\n').length - 1
    const line = rest.split('\n')[lineIndex] ?? ''
    const atLineEnd = rest.indexOf('\n', pos) === -1 ? pos === rest.length : rest[pos] === '\n'
    if (e.ctrlKey || (TASK_LINE.test(line) && line.replace(TASK_LINE, '').trim() && atLineEnd)) {
      e.preventDefault()
      await convert(lineIndex, !e.ctrlKey)
    }
  }

  const convertCurrent = () => {
    const el = textRef.current
    if (!el) return
    convert(rest.slice(0, el.selectionStart).split('\n').length - 1, false)
  }

  return (
    <section className="flex min-h-[520px] animate-fade-up flex-col rounded-panel bg-paper p-10 pb-6 text-ink max-[640px]:p-6 min-[1040px]:min-h-0 min-[1040px]:flex-1">
      <div className="flex items-center gap-3">
        {!!note.pinned && <PulseChip tone="growth">Закріплено</PulseChip>}
        <span className="text-[14px] font-bold text-dim">
          Змінено {age(note.updatedAt)}, {fmtTime(note.updatedAt)}
        </span>
      </div>
      <input
        ref={titleRef}
        value={title}
        onChange={(e) => change(e.target.value.replace(/\n/g, ' ') + (nl === -1 && !rest ? '' : '\n' + rest))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (nl === -1) change(`${title}\n`)
            requestAnimationFrame(() => {
              textRef.current?.focus()
              textRef.current?.setSelectionRange(0, 0)
            })
          }
        }}
        onBlur={flush}
        placeholder="Заголовок"
        className="mt-5 w-full bg-transparent text-[44px] leading-[0.95] font-extrabold tracking-[-0.04em] text-ink outline-none placeholder:text-dim max-[640px]:text-[32px]"
      />
      <textarea
        ref={textRef}
        value={rest}
        onChange={(e) => change(`${title}\n${e.target.value}`)}
        onKeyDown={onKeyDown}
        onBlur={flush}
        spellCheck
        placeholder={'Думки, плани, протокол зустрічі…\n[] Рядок із дужками + Enter стане задачею'}
        className="mt-6 min-h-0 w-full flex-1 resize-none bg-transparent text-[17px] leading-[1.6] font-medium text-ink outline-none placeholder:text-dim"
      />
      <div className="mt-4 flex items-center gap-2 border-t border-paper-line pt-4">
        <Button variant="canvas" size="md" iconLeft="arrowUpRight" onClick={convertCurrent} data-tip="Ctrl + Enter">
          Рядок у задачі
        </Button>
        <span className="ml-auto" />
        <RoundButton
          icon="pin"
          tone="paper-line"
          label={note.pinned ? 'Відкріпити' : 'Закріпити вгорі'}
          onClick={() => updateNote(note.id, { pinned: note.pinned ? 0 : 1 })}
        />
        <RoundButton
          icon="trash"
          tone="paper-line"
          label="Видалити нотатку"
          onClick={async () => {
            flush()
            await removeNote(note.id)
            onDeleted()
            toast({ kind: 'info', title: 'Нотатку видалено', action: { label: 'Скасувати', onClick: () => updateNote(note.id, { deleted: 0 }) } })
          }}
        />
      </div>
    </section>
  )
}
