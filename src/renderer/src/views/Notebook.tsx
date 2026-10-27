import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, CaptureField, cn, ContextMenu, InfoRow, Icon, PulseChip, RoundButton, useToast } from '@/design-system'
import { Page } from '@/components/Page'
import { useNotes } from '@/data/hooks'
import { createNote, notePreview, noteTitle, removeNote, updateNote } from '@/data/notes'
import { captureToInbox } from '@/data/tasks'
import { RichNote, type RichNoteHandle } from '@/components/RichNote'
import { AddImageButton, DropHint, useImageDrop } from '@/components/Attachments'
import { db } from '@/data/db'
import { htmlToText, textToHtml } from '@/components/richText'
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
      sub={`${notes.length} ${pluralWord(notes.length, ['нотатка', 'нотатки', 'нотаток'])}`}
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
            <InfoRow icon="notebook" title="Нотаток ще немає">
              <Button size="sm" iconLeft="plus" onClick={() => create()}>
                Нова нотатка
              </Button>
            </InfoRow>
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
        'row-enter flex shrink-0 items-center gap-3 rounded-[30px] px-6 py-[18px] text-left transition-colors duration-150',
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

/** Аркуш нотатки: заголовок — перший рядок, далі форматований текст. Зберігається сам. */
function Sheet({ note, titleRef, onDeleted }: { note: Note; titleRef: React.RefObject<HTMLInputElement | null>; onDeleted: () => void }) {
  const toast = useToast()
  const editorRef = useRef<RichNoteHandle>(null)
  const split = (body: string) => {
    const nl = body.indexOf('\n')
    return nl === -1 ? [body, ''] : [body.slice(0, nl), body.slice(nl + 1)]
  }
  // Сторінки: збережені, або (стара нотатка) одна сторінка з html чи простого тексту
  const pagesOf = (n: Note) => (n.pages?.length ? n.pages : [n.html ?? textToHtml(split(n.body)[1])])
  const [title, setTitle] = useState(() => split(note.body)[0])
  const [pages, setPages] = useState(() => pagesOf(note))
  const [page, setPage] = useState(0)
  const [pageMenu, setPageMenu] = useState<{ x: number; y: number; index: number } | null>(null)
  const draft = useRef({ title: split(note.body)[0], pages: pagesOf(note), texts: pagesOf(note).map(htmlToText) })
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pending = useRef(false)

  // Зміни ззовні (синхронізація, швидкий запис) підхоплюємо, якщо ви зараз не друкуєте
  useEffect(() => {
    if (pending.current) return
    const next = pagesOf(note)
    draft.current = { title: split(note.body)[0], pages: next, texts: next.map(htmlToText) }
    setTitle(draft.current.title)
    setPages(next)
    setPage((p) => Math.min(p, next.length - 1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.body, note.html, note.pages])

  const flush = () => {
    clearTimeout(saveTimer.current)
    if (!pending.current) return
    const { title: t, pages: all, texts } = draft.current
    // Простий текст — усі сторінки підряд: пошук і прев'ю бачать увесь зміст
    const rest = texts.filter((x) => x.trim()).join('\n')
    updateNote(note.id, { body: rest ? `${t}\n${rest}` : t, html: all[0], pages: all })
    pending.current = false
  }
  useEffect(
    () => () => {
      flush()
      // Порожня нотатка (створили «+» і пішли) не лишається сміттям у списку
      const { title: t, pages: all, texts } = draft.current
      // …але нотатка лише з фото — не порожня
      if (!t.trim() && texts.every((x) => !x.trim()) && !all.some((h) => h.includes('note-chip') || h.includes('note-img')))
        db.files.where('owner').equals(note.id).count().then((n) => {
          if (n === 0) removeNote(note.id)
        })
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const schedule = () => {
    pending.current = true
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flush, 400)
  }

  const setDraftPages = (all: string[], texts: string[]) => {
    draft.current = { ...draft.current, pages: all, texts }
    setPages(all)
    schedule()
  }

  const pageRef = useRef(page)
  pageRef.current = page
  const onText = useCallback((html: string, text: string) => {
    const i = pageRef.current
    const all = [...draft.current.pages]
    const texts = [...draft.current.texts]
    all[i] = html
    texts[i] = text
    draft.current = { ...draft.current, pages: all, texts }
    schedule()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ───────── Сторінки, як у Karkas ───────── */
  const focusAfterSwitch = useRef(false)
  const openPage = (i: number) => {
    setPage(i)
    setPageMenu(null)
  }
  const addPage = () => {
    const all = [...draft.current.pages, '<div><br></div>']
    setDraftPages(all, [...draft.current.texts, ''])
    focusAfterSwitch.current = true
    openPage(all.length - 1)
  }
  const deletePage = (i: number) => {
    if (draft.current.pages.length < 2) return
    const before = { pages: draft.current.pages, texts: draft.current.texts, page }
    setDraftPages(
      draft.current.pages.filter((_, j) => j !== i),
      draft.current.texts.filter((_, j) => j !== i),
    )
    // Лишаємось на тій самій сторінці; якщо видалили поточну — на сусідній
    const last = draft.current.pages.length - 1
    openPage(i < page ? page - 1 : Math.min(page, last))
    toast({
      kind: 'info',
      icon: 'trash',
      title: `Сторінку ${i + 1} видалено`,
      action: {
        label: 'Скасувати',
        onClick: () => {
          setDraftPages(before.pages, before.texts)
          openPage(before.page)
        },
      },
    })
  }
  useEffect(() => {
    if (!focusAfterSwitch.current) return
    focusAfterSwitch.current = false
    requestAnimationFrame(() => editorRef.current?.focusStart())
  }, [page])

  const html = pages[page] ?? pages[0]
  const locked = !!note.locked
  // Фото можна кинути будь-куди на аркуш — додається в кінець тексту (або туди, де курсор)
  const drop = useImageDrop((files) => editorRef.current?.insertImages(files), !locked)
  const toggleLock = () => {
    flush()
    updateNote(note.id, { locked: locked ? undefined : 1 })
    toast({ kind: 'info', icon: locked ? 'lockOpen' : 'lock', title: locked ? 'Редагування увімкнено' : 'Редагування заблоковано', text: locked ? undefined : 'Текст можна читати й копіювати' })
  }

  return (
    // Фіксований розмір за будь-якої ширини вікна; довгий текст прокручується всередині
    <section className="relative flex h-[720px] flex-col rounded-panel bg-paper p-10 pb-6 text-ink max-[640px]:p-6" {...drop.dropProps}>
      <DropHint show={drop.over} />
      <div className="flex items-center gap-3">
        {!!note.pinned && <PulseChip tone="growth">Закріплено</PulseChip>}
        {locked && <PulseChip tone="canvas">Лише читання</PulseChip>}
        <span className="text-[14px] font-bold text-dim">
          Змінено {age(note.updatedAt)}, {fmtTime(note.updatedAt)}
        </span>
      </div>
      <input
        ref={titleRef}
        value={title}
        readOnly={locked}
        onChange={(e) => {
          const t = e.target.value.replace(/\n/g, ' ')
          setTitle(t)
          draft.current = { ...draft.current, title: t }
          schedule()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            editorRef.current?.focusStart()
          }
        }}
        onBlur={flush}
        placeholder="Заголовок"
        className="mt-5 w-full bg-transparent text-[44px] leading-[0.95] font-extrabold tracking-[-0.04em] text-ink outline-none placeholder:text-dim max-[640px]:text-[32px]"
      />
      <div className="mt-6 flex min-h-0 flex-1 flex-col">
        <RichNote
          key={page}
          ref={editorRef}
          html={html}
          placeholder="Напишіть щось…"
          onChange={onText}
          readOnly={locked}
          imageOwner={note.id}
          onLineToTask={async (t) => {
            await captureToInbox(t, { sourceNoteId: note.id })
          }}
        />
      </div>
      {/* Підвал як у Karkas: дія ліворуч, сторінки по центру, закріпити й видалити праворуч; тісно — переноситься */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-paper-line pt-4">
        {locked ? (
          <Button variant="canvas" size="md" iconLeft="pencil" onClick={toggleLock}>
            Редагувати
          </Button>
        ) : (
          <Button variant="canvas" size="md" iconLeft="arrowUpRight" onClick={() => editorRef.current?.convertCurrent()} data-tip="Ctrl + Enter">
            Рядок у задачі
          </Button>
        )}
        <div className="flex flex-1 justify-center">
          <div
            role="tablist"
            aria-label="Сторінки"
            className="flex shrink-0 items-center gap-0.5 rounded-[22px] bg-paper-line p-[3px]"
            onKeyDown={(e) => {
              const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
              if (!dir) return
              e.preventDefault()
              openPage((page + dir + pages.length) % pages.length)
            }}
          >
            {pages.map((_, i) => (
              <button
                key={i}
                role="tab"
                aria-selected={i === page}
                aria-label={`Сторінка ${i + 1}`}
                tabIndex={i === page ? 0 : -1}
                onClick={() => openPage(i)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  if (pages.length > 1 && !locked) setPageMenu({ x: e.clientX, y: e.clientY, index: i })
                }}
                className={cn(
                  'size-9 rounded-full text-[14px] font-extrabold tabular-nums transition-[background-color,color,transform] duration-200 active:scale-[0.88]',
                  i === page ? 'bg-canvas text-white' : 'text-paper-muted hover:text-ink',
                )}
              >
                {i + 1}
              </button>
            ))}
            {!locked && (
              <button
                onClick={addPage}
                aria-label="Нова сторінка"
                data-tip="Нова сторінка"
                className="grid size-9 place-items-center rounded-full text-paper-muted transition-[color,transform] hover:text-ink active:scale-[0.88]"
              >
                <Icon name="plus" size={15} strokeWidth={2.6} />
              </button>
            )}
          </div>
        </div>
        {!locked && <AddImageButton onFiles={(files) => editorRef.current?.insertImages(files)} />}
        {!locked && <RoundButton icon="lock" tone="paper-line" label="Заблокувати редагування" onClick={toggleLock} />}
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
            if (locked) return toast({ kind: 'info', icon: 'lock', title: 'Нотатку заблоковано', text: 'Натисніть «Редагувати», щоб її видалити' })
            flush()
            await removeNote(note.id)
            onDeleted()
            toast({ kind: 'info', icon: 'trash', title: 'Нотатку видалено', action: { label: 'Скасувати', onClick: () => updateNote(note.id, { deleted: 0 }) } })
          }}
        />
      </div>
      {pageMenu && (
        <ContextMenu
          x={pageMenu.x}
          y={pageMenu.y}
          label={`Сторінка ${pageMenu.index + 1}`}
          onClose={() => setPageMenu(null)}
          items={[
            { label: 'Відкрити', icon: 'arrowUpRight', onSelect: () => openPage(pageMenu.index) },
            { label: 'Нова сторінка', icon: 'plus', onSelect: addPage },
            { label: 'Видалити сторінку', icon: 'trashLines', tone: 'danger', onSelect: () => (setPageMenu(null), deletePage(pageMenu.index)) },
          ]}
        />
      )}
    </section>
  )
}
