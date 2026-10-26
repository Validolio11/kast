import { useEffect, useRef, useState } from 'react'
import { CaptureBar, EmptyState, Icon, Kbd, ListRow, RowAction, useToast } from '@/design-system'
import { Page } from '@/components/Page'
import { useNotes } from '@/data/hooks'
import { createNote, lineToTask, notePreview, noteTitle, removeNote, TASK_LINE, updateNote } from '@/data/notes'
import type { Note } from '@/data/db'
import { age, fmtTime, plural } from '@/lib/time'

export function Notebook({ captureRef }: { captureRef: React.RefObject<HTMLInputElement | null> }) {
  const [text, setText] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const loaded = useNotes()
  const notes = loaded ?? []

  const current = notes.find((n) => n.id === selected) ?? notes[0]

  return (
    <Page
      title="Блокнот"
      subtitle={
        <>
          Пишіть вільно. Рядок із <b className="text-paper">[]</b> на початку + Enter — і це задача у Вхідних
        </>
      }
      meta={plural(notes.length, ['нотатка', 'нотатки', 'нотаток'])}
      fill
      capture={
        <CaptureBar
          ref={captureRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onSubmit={async (v) => {
            setText('')
            const n = await createNote(`${v}\n`)
            setSelected(n.id)
            requestAnimationFrame(() => {
              const el = editorRef.current
              if (!el) return
              el.focus()
              el.setSelectionRange(el.value.length, el.value.length)
            })
          }}
          placeholder="Нова нотатка — почніть із заголовка…"
          autoFocus
          hint="Ctrl N"
        />
      }
    >
      <div className="flex min-h-0 w-[280px] shrink-0 flex-col overflow-y-auto pr-3 max-[1000px]:w-[220px]">
        {notes.map((n) => (
          <ListRow
            key={n.id}
            selected={n.id === current?.id}
            leading={<Icon name={n.pinned ? 'pin' : 'notebook'} size={16} className={n.pinned ? 'text-paper' : 'text-fog-2'} />}
            title={noteTitle(n.body)}
            sub={notePreview(n.body) || age(n.updatedAt)}
            onClick={() => setSelected(n.id)}
          />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-field bg-graphite">
        {current ? (
          <Editor key={current.id} note={current} editorRef={editorRef} onDeleted={() => setSelected(null)} />
        ) : (
          loaded && <EmptyState
            icon="notebook"
            title="Тут народжуються думки"
            text="Нотатки, протоколи, чернетки. Коли думка стає справою — один Enter, і вона у Вхідних."
          />
        )}
      </div>
    </Page>
  )
}

function Editor({
  note,
  editorRef,
  onDeleted,
}: {
  note: Note
  editorRef: React.RefObject<HTMLTextAreaElement | null>
  onDeleted: () => void
}) {
  const [body, setBody] = useState(note.body)
  const toast = useToast()
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pending = useRef<string | null>(null)

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

  const convert = async (lineIndex: number, addNewLine: boolean) => {
    flush()
    const next = await lineToTask(note.id, body, lineIndex)
    if (next === null) return false
    const lines = next.split('\n')
    if (addNewLine) lines.splice(lineIndex + 1, 0, '')
    const result = lines.join('\n')
    setBody(result)
    if (addNewLine) {
      updateNote(note.id, { body: result })
      const caret = lines.slice(0, lineIndex + 1).join('\n').length + 1
      requestAnimationFrame(() => editorRef.current?.setSelectionRange(caret, caret))
    }
    toast({ title: 'Задачу додано у Вхідні' })
    return true
  }

  const onKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    const pos = e.currentTarget.selectionStart
    const lineIndex = body.slice(0, pos).split('\n').length - 1
    const line = body.split('\n')[lineIndex] ?? ''
    const atLineEnd = body.indexOf('\n', pos) === -1 ? pos === body.length : body[pos] === '\n'
    if (e.ctrlKey || (TASK_LINE.test(line) && line.replace(TASK_LINE, '').trim() && atLineEnd)) {
      e.preventDefault()
      await convert(lineIndex, !e.ctrlKey)
    }
  }

  const convertCurrent = () => {
    const el = editorRef.current
    if (!el) return
    convert(body.slice(0, el.selectionStart).split('\n').length - 1, false)
  }

  return (
    <>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line pr-2 pl-5">
        <span className="flex-1 truncate text-[13px] font-semibold text-fog">Змінено {age(note.updatedAt)}, {fmtTime(note.updatedAt)}</span>
        <button
          onClick={convertCurrent}
          className="flex h-8 items-center gap-2 rounded-full px-3 text-[13px] font-bold text-fog transition-colors hover:bg-white/10 hover:text-paper"
          title="Перетворити поточний рядок на задачу"
        >
          <Icon name="arrowUpRight" size={15} />
          Рядок → задача
          <Kbd>Ctrl Enter</Kbd>
        </button>
        <RowAction icon="pin" label={note.pinned ? 'Відкріпити' : 'Закріпити вгорі'} onClick={() => updateNote(note.id, { pinned: note.pinned ? 0 : 1 })} />
        <RowAction
          icon="trash"
          label="Видалити нотатку"
          tone="danger"
          onClick={async () => {
            flush()
            await removeNote(note.id)
            onDeleted()
            toast({ kind: 'info', title: 'Нотатку видалено', action: { label: 'Скасувати', onClick: () => updateNote(note.id, { deleted: 0 }) } })
          }}
        />
      </div>
      <textarea
        ref={editorRef}
        value={body}
        onChange={(e) => change(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={flush}
        spellCheck
        placeholder={'Заголовок\n\nДумки, плани, протокол зустрічі…\n[] Рядок із дужками стане задачею'}
        className="min-h-0 flex-1 resize-none bg-transparent px-6 py-5 text-[15px] leading-[1.7] font-medium text-paper outline-none placeholder:text-fog-2"
      />
    </>
  )
}
