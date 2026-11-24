import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, CaptureField, cn, ContextMenu, InfoRow, Icon, PulseChip, RoundButton, useRowEnter, useToast, type MenuAction } from '@/design-system'
import { Page } from '@/components/Page'
import { useNotes } from '@/data/hooks'
import { EmojiPicker } from '@/components/EmojiPicker'
import { createNote, noteTitle, removeNote, updateNote } from '@/data/notes'
import { captureToInbox } from '@/data/tasks'
import { RichNote, type RichNoteHandle } from '@/components/RichNote'
import { DropHint, pickImages, useImageDrop } from '@/components/Attachments'
import { db } from '@/data/db'
import { htmlToText, textToHtml } from '@/components/richText'
import type { Note } from '@/data/db'
import { age, dayKey, fmtTime, pluralWord } from '@/lib/time'

/** Відкрити конкретну нотатку ззовні (швидкий пошук Ctrl+P); n — щоб той самий id відкривався повторно */
export type OpenNote = { id: string; n: number } | null

export function Notebook({ captureRef, openNote, onOpened }: { captureRef: React.RefObject<HTMLInputElement | null>; openNote?: OpenNote; onOpened?: () => void }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(openNote?.id ?? null)
  const [mobileDetail, setMobileDetail] = useState(!!openNote)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const loaded = useNotes()
  const notes = loaded ?? []

  const q = query.trim().toLowerCase()
  const shown = q ? notes.filter((n) => n.body.toLowerCase().includes(q)) : notes
  const current = notes.find((n) => n.id === selected) ?? shown[0]
  // Як у Notion: закріплені окремою групою вгорі, далі — усі за свіжістю
  const pinned = shown.filter((n) => n.pinned)
  const rest = shown.filter((n) => !n.pinned)

  useEffect(() => {
    if (!openNote) return
    setQuery('')
    setSelected(openNote.id)
    setMobileDetail(true)
    // Запит виконано — наступний вхід у блокнот не відкриватиме цю нотатку знову
    onOpened?.()
  }, [openNote, onOpened])

  const backToList = useCallback(() => setMobileDetail(false), [])
  useEffect(() => {
    const back = (e: Event) => {
      if (e.defaultPrevented || !mobileDetail || document.querySelector('[data-dialog-open], [role="menu"]')) return
      e.preventDefault()
      e.stopImmediatePropagation()
      backToList()
    }
    document.addEventListener('kast:back', back, true)
    return () => document.removeEventListener('kast:back', back, true)
  }, [mobileDetail, backToList])

  const create = async (first = '') => {
    setQuery('')
    const n = await createNote(first ? `${first}\n` : '')
    setSelected(n.id)
    setMobileDetail(true)
    requestAnimationFrame(() => titleRef.current?.focus())
  }
  const open = (id: string) => {
    setSelected(id)
    setMobileDetail(true)
  }
  const row = (n: Note) => <NoteRow key={n.id} note={n} selected={n.id === current?.id} onOpen={() => open(n.id)} />

  return (
    <div className="notebook-view h-full min-w-0 w-full" data-detail={mobileDetail}>
    <Page
      light="Мій"
      heavy="блокнот"
      sub={`${notes.length} ${pluralWord(notes.length, ['нотатка', 'нотатки', 'нотаток'])} · Ctrl + P — швидкий пошук`}
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
          <nav aria-label="Нотатки" className="notebook-list flex min-h-0 flex-col gap-0.5 overflow-y-auto pb-1 min-[1040px]:flex-1">
            {pinned.length > 0 && <NoteGroup label="Закріплені" />}
            {pinned.map(row)}
            {pinned.length > 0 && rest.length > 0 && <NoteGroup label="Усі нотатки" />}
            {rest.map(row)}
            {loaded && q && !shown.length && (
              <p className="px-3 py-2 text-[14px] font-semibold text-muted">Нічого не знайдено. Enter — створити нотатку «{query.trim()}».</p>
            )}
          </nav>
        </>
      }
      main={
        current ? (
          <Sheet key={current.id} note={current} titleRef={titleRef} onBack={backToList} onDeleted={() => { setSelected(null); backToList() }} />
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
    </div>
  )
}

function NoteGroup({ label }: { label: string }) {
  return <h3 className="px-3 pt-3 pb-1 text-[13px] font-extrabold text-grey first:pt-1">{label}</h3>
}

/** Сьогодні — час; раніше — «вчора», «3 дн», дата */
const stamp = (ts: number) => (dayKey(new Date(ts)) === dayKey() ? fmtTime(ts) : age(ts))

/** Рядок списку, як у бічній панелі Notion: іконка, назва, коли змінено. Права кнопка — дії. */
function NoteRow({ note, selected, onOpen }: { note: Note; selected: boolean; onOpen: () => void }) {
  const enter = useRowEnter()
  const toast = useToast()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const remove = async () => {
    setMenu(null)
    if (note.locked) return toast({ kind: 'info', icon: 'lock', title: 'Нотатку заблоковано', text: 'Відкрийте замок, щоб її видалити' })
    await removeNote(note.id)
    toast({ kind: 'info', icon: 'trash', title: 'Нотатку видалено', action: { label: 'Скасувати', onClick: () => updateNote(note.id, { deleted: 0 }) } })
  }
  return (
    <>
      <button
        onClick={onOpen}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY })
        }}
        aria-current={selected || undefined}
        className={cn(
          'note-row flex h-10 min-w-0 w-full shrink-0 items-center gap-2.5 rounded-control pr-3 pl-2.5 text-left transition-colors duration-150',
          enter,
          selected ? 'bg-steel text-white' : 'text-soft hover:bg-tile hover:text-white',
        )}
      >
        <span aria-hidden className="grid size-6 shrink-0 place-items-center">
          {note.icon ? <span className="note-emoji text-[17px] leading-none">{note.icon}</span> : <Icon name="notebook" size={16} className={selected ? 'text-soft' : 'text-muted'} />}
        </span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{noteTitle(note.body)}</span>
        <span className={cn('shrink-0 text-[12px] font-semibold tabular-nums', selected ? 'text-soft' : 'text-muted')}>{stamp(note.updatedAt)}</span>
      </button>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={noteTitle(note.body)}
          autoFocus
          onClose={() => setMenu(null)}
          items={[
            { label: 'Відкрити', icon: 'arrowUpRight', onSelect: () => (setMenu(null), onOpen()) },
            { label: note.pinned ? 'Відкріпити' : 'Закріпити вгорі', icon: 'pin', onSelect: () => (setMenu(null), updateNote(note.id, { pinned: note.pinned ? 0 : 1 })) },
            { label: 'Видалити', icon: 'trashLines', tone: 'danger', onSelect: remove },
          ]}
        />
      )}
    </>
  )
}

/** Аркуш нотатки: заголовок — перший рядок, далі форматований текст. Зберігається сам. */
function Sheet({ note, titleRef, onDeleted, onBack }: { note: Note; titleRef: React.RefObject<HTMLTextAreaElement | null>; onDeleted: () => void; onBack: () => void }) {
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
  // Усі дії з нотаткою — в одному меню «…», як у Notion; на аркуші лишається лише текст
  const [actions, setActions] = useState<{ x: number; y: number } | null>(null)
  const moreRef = useRef<HTMLSpanElement>(null)
  const draft = useRef({ title: split(note.body)[0], pages: pagesOf(note), texts: pagesOf(note).map(htmlToText) })
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pending = useRef(false)
  /** Текст нотатки в базі, з якого почалися ваші правки: якщо до збереження він змінився — це зробив хтось інший */
  const base = useRef(note.body)

  // Зміни ззовні (синхронізація, швидкий запис) підхоплюємо, якщо ви зараз не друкуєте
  useEffect(() => {
    if (pending.current) return
    base.current = note.body
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
    pending.current = false
    save().catch((e) => {
      console.error('note save failed', e)
      toast({ kind: 'error', title: 'Не вдалося зберегти нотатку', text: 'Спробуйте ще раз' })
    })
  }

  /**
   * Поки ви друкували, нотатку могли змінити ззовні: швидкий запис, інший пристрій.
   * Дописане в кінець — додаємо до вашого тексту; інші зміни — зберігаємо окремою копією, а не затираємо.
   */
  const save = async () => {
    let { pages: all, texts } = draft.current
    const t = draft.current.title
    const cur = await db.notes.get(note.id)
    const from = base.current.trimEnd()
    if (cur && !cur.deleted && cur.body !== base.current) {
      if (cur.body.startsWith(from)) {
        const added = cur.body.slice(from.length).split('\n').filter((l) => l.trim())
        if (added.length) {
          const rows = added.map((l) => `<div>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`).join('')
          all = [...all]
          all[all.length - 1] += rows
          texts = all.map(htmlToText)
          draft.current = { ...draft.current, pages: all, texts }
          setPages(all)
          // Відкрита остання сторінка — рядки з'являються в редакторі одразу
          if (pageRef.current === all.length - 1) editorRef.current?.appendHtml(rows)
        }
      } else {
        await createNote(`${noteTitle(cur.body)} (з іншого пристрою)\n${cur.body.split('\n').slice(1).join('\n')}`, {
          html: cur.html,
          pages: cur.pages,
          icon: cur.icon,
        })
        toast({ kind: 'info', title: 'Нотатку змінили на іншому пристрої', text: 'Ту версію збережено окремою нотаткою' })
      }
    }
    // Простий текст — усі сторінки підряд: пошук і прев'ю бачать увесь зміст
    const rest = texts.filter((x) => x.trim()).join('\n')
    const body = rest ? `${t}\n${rest}` : t
    base.current = body
    await updateNote(note.id, { body, html: all[0], pages: all })
  }

  // Згорнули застосунок чи закрили вікно — не чекаємо таймера: на телефоні процес можуть зупинити одразу
  useEffect(() => {
    const now = () => document.visibilityState === 'hidden' && flush()
    document.addEventListener('visibilitychange', now)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', now)
      window.removeEventListener('pagehide', flush)
    }
  })
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

  const removeThis = async () => {
    setActions(null)
    if (locked) return toast({ kind: 'info', icon: 'lock', title: 'Нотатку заблоковано', text: 'Відкрийте замок, щоб її видалити' })
    flush()
    await removeNote(note.id)
    onDeleted()
    toast({ kind: 'info', icon: 'trash', title: 'Нотатку видалено', action: { label: 'Скасувати', onClick: () => updateNote(note.id, { deleted: 0 }) } })
  }
  const actionItems: MenuAction[] = [
    ...(!locked
      ? ([
          { label: 'Додати фото · або Ctrl+V', icon: 'image', onSelect: () => (setActions(null), pickImages((files) => editorRef.current?.insertImages(files))) },
          { label: 'Нова сторінка', icon: 'plus', onSelect: () => (setActions(null), addPage()) },
        ] as MenuAction[])
      : []),
    { label: note.pinned ? 'Відкріпити' : 'Закріпити вгорі', icon: 'pin', onSelect: () => (setActions(null), updateNote(note.id, { pinned: note.pinned ? 0 : 1 })) },
    { label: locked ? 'Розблокувати редагування' : 'Лише читання', icon: locked ? 'lockOpen' : 'lock', onSelect: () => (setActions(null), toggleLock()) },
    { label: 'Видалити нотатку', icon: 'trashLines', tone: 'danger', onSelect: removeThis },
  ]

  return (
    // Темний холст, як у Notion: без картки й рамок; текст — колонкою для читання посередині (кольори — у .notebook-canvas)
    <section className="notebook-sheet notebook-canvas relative flex h-[720px] min-w-0 w-full flex-col text-ink" {...drop.dropProps}>
      <DropHint show={drop.over} />
      <button className="notebook-back" onClick={onBack}><Icon name="chevronLeft" size={18} /> Усі нотатки</button>
      {/* Верхній рядок сторінки: коли змінено ліворуч, дії праворуч */}
      <div className="notebook-sheet-meta flex min-w-0 items-center gap-2">
        {locked && <PulseChip tone="canvas">Лише читання</PulseChip>}
        <span className="min-w-0 truncate text-[13px] font-bold text-muted">
          Змінено {age(note.updatedAt)}, {fmtTime(note.updatedAt)}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {!locked && (
            <Button variant="canvas" size="sm" iconLeft="arrowUpRight" className="notebook-convert-action" onClick={() => editorRef.current?.convertCurrent()} data-tip="Ctrl + Enter">
              Рядок у задачі
            </Button>
          )}
          <span ref={moreRef} className="contents">
            <RoundButton
              icon="more"
              tone="paper-line"
              label="Дії з нотаткою"
              onClick={() => {
                const r = moreRef.current?.firstElementChild?.getBoundingClientRect()
                if (r) setActions({ x: r.right - 288, y: r.bottom + 6 })
              }}
            />
          </span>
        </div>
      </div>
      <div className="notebook-doc mx-auto flex min-h-0 w-full max-w-[760px] flex-1 flex-col pt-6">
        <div className="notebook-doc-icon shrink-0">
          <EmojiPicker large value={note.icon} disabled={locked} onChange={(icon) => updateNote(note.id, { icon })} />
        </div>
        <textarea
          rows={1}
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
          placeholder="Без назви"
          className="notebook-title mt-3 w-full shrink-0 resize-none overflow-hidden bg-transparent text-[clamp(30px,3.2vw,40px)] leading-[1.08] font-extrabold tracking-[-0.035em] text-ink outline-none [field-sizing:content] placeholder:text-dim"
        />
        {/* Сторінки — лише коли їх кілька; додати — у меню «…» */}
        {pages.length > 1 && (
          <div className="notebook-page-controls mt-4 flex min-w-0 max-w-full shrink-0 items-center gap-1.5">
            <div
              role="tablist"
              aria-label="Сторінки"
              className="flex min-w-0 max-w-full items-center gap-0.5 overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-[20px] bg-paper-line p-1 [scrollbar-width:none]"
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
                    if (!locked) setPageMenu({ x: e.clientX, y: e.clientY, index: i })
                  }}
                  className={cn(
                    'h-8 min-w-8 shrink-0 rounded-full px-2.5 text-[13px] font-extrabold tabular-nums transition-colors duration-150',
                    i === page ? 'bg-canvas text-white' : 'text-paper-muted hover:text-ink',
                  )}
                >
                  {i + 1}
                </button>
              ))}
              {!locked && (
                <button onClick={addPage} aria-label="Нова сторінка" className="grid size-8 shrink-0 place-items-center rounded-full text-paper-muted transition-colors hover:text-ink">
                  <Icon name="plus" size={15} strokeWidth={2.6} />
                </button>
              )}
            </div>
            {!locked && (
              <button
                className="notebook-page-menu"
                aria-label={`Дії сторінки ${page + 1}`}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  setPageMenu({ x: rect.left, y: rect.bottom, index: page })
                }}
              >
                <Icon name="more" size={20} />
              </button>
            )}
          </div>
        )}
        <div className="mt-5 flex min-h-0 flex-1 flex-col">
          <RichNote
            key={page}
            ref={editorRef}
            html={html}
            placeholder="Напишіть щось або натисніть «/» для блоків…"
            onChange={onText}
            readOnly={locked}
            imageOwner={note.id}
            onLineToTask={async (t) => {
              await captureToInbox(t, { sourceNoteId: note.id })
            }}
          />
        </div>
      </div>
      {actions && <ContextMenu x={actions.x} y={actions.y} label="Дії з нотаткою" autoFocus onClose={() => setActions(null)} items={actionItems} />}
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
