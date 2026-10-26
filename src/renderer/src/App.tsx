import { useCallback, useEffect, useRef, useState } from 'react'
import { NavButton, NavRail, SyncDot, TitleBar, ToastProvider, UpdatePill, type NavItem } from '@/design-system'
import { useDay, useStatus, useToday } from '@/data/hooks'
import { sweepStale } from '@/data/tasks'
import { CloseDay } from '@/flows/CloseDay'
import { Focus } from '@/flows/Focus'
import { useDayKey, useHour, useSettings, useUpdateState } from '@/lib/hooks'
import { startSync, useSync } from '@/sync/engine'
import { Done } from '@/views/Done'
import { Inbox } from '@/views/Inbox'
import { Notebook } from '@/views/Notebook'
import { Settings } from '@/views/Settings'
import { Today } from '@/views/Today'

type Tab = 'today' | 'notebook' | 'inbox' | 'done'
const TABS: Tab[] = ['today', 'notebook', 'inbox', 'done']

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  )
}

function Shell() {
  const [tab, setTab] = useState<Tab>('today')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const captureRef = useRef<HTMLInputElement>(null)
  const date = useDayKey()
  const [settings] = useSettings()
  const update = useUpdateState()
  const sync = useSync()
  const today = useToday(date)
  const inbox = useStatus('inbox')

  useEffect(() => {
    startSync()
  }, [])

  // Тихе старіння Вхідних: при старті й щогодини
  useEffect(() => {
    sweepStale()
    const t = setInterval(sweepStale, 60 * 60_000)
    return () => clearInterval(t)
  }, [])

  useEveningReminder(settings.eveningHour, settings.notifyEvening, date)

  const go = useCallback((t: Tab) => {
    setFocusId(null)
    setTab(t)
    requestAnimationFrame(() => captureRef.current?.focus())
  }, [])

  // Перехід з трею / сповіщення
  useEffect(
    () =>
      window.kast?.onNavigate((t) => {
        if (t === 'close-day') {
          go('today')
          setClosing(true)
        } else if (t === 'settings') setSettingsOpen(true)
        else go(t)
      }),
    [go],
  )

  // Гарячі клавіші: Ctrl+1..4 — вкладки, Ctrl+N — поле дії, Ctrl+, — налаштування
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey) return
      const n = Number(e.key)
      if (n >= 1 && n <= 4) {
        e.preventDefault()
        go(TABS[n - 1])
      } else if (e.key.toLowerCase() === 'n' || e.code === 'KeyN') {
        e.preventDefault()
        setFocusId(null)
        requestAnimationFrame(() => captureRef.current?.focus())
      } else if (e.key === ',') {
        e.preventDefault()
        setSettingsOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  const openCount = today ? today.main.length + today.small.length : 0
  const nav: NavItem<Tab>[] = [
    { id: 'today', label: 'Сьогодні', icon: 'sun', meta: openCount ? String(openCount) : undefined, shortcut: 'Ctrl+1' },
    { id: 'notebook', label: 'Блокнот', icon: 'notebook', shortcut: 'Ctrl+2' },
    { id: 'inbox', label: 'Вхідні', icon: 'inbox', meta: inbox?.length ? String(inbox.length) : undefined, shortcut: 'Ctrl+3' },
    { id: 'done', label: 'Готово', icon: 'check', shortcut: 'Ctrl+4' },
  ]

  const onOpen = (id: string) => setFocusId(id)

  return (
    <div className="flex h-full flex-col bg-night">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <NavRail
          items={nav}
          active={tab}
          onSelect={go}
          footer={
            <>
              {update.kind === 'ready' && <UpdatePill version={update.version} onClick={() => window.kast.updates.install()} />}
              <NavButton
                icon="settings"
                label="Налаштування"
                onClick={() => setSettingsOpen(true)}
                badge={sync.state !== 'local' && <SyncDot state={sync.state} />}
              />
            </>
          }
        />
        <main className="min-w-0 flex-1 overflow-hidden rounded-tl-[20px] border-t border-l border-line bg-[#0c0d0d]">
          {focusId ? (
            <Focus id={focusId} onClose={() => setFocusId(null)} />
          ) : tab === 'today' ? (
            <Today date={date} eveningHour={settings.eveningHour} captureRef={captureRef} onOpen={onOpen} onCloseDay={() => setClosing(true)} />
          ) : tab === 'notebook' ? (
            <Notebook captureRef={captureRef} />
          ) : tab === 'inbox' ? (
            <Inbox captureRef={captureRef} hotkey={settings.hotkey} onOpen={onOpen} />
          ) : (
            <Done captureRef={captureRef} onOpen={onOpen} />
          )}
        </main>
      </div>
      <CloseDay open={closing} onClose={() => setClosing(false)} />
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

/** Одне сповіщення ввечері, якщо день ще не закрито і сьогодні щось планувалося */
function useEveningReminder(eveningHour: number, enabled: boolean, date: string) {
  const hour = useHour()
  const day = useDay(date)
  const today = useToday(date)
  useEffect(() => {
    if (!enabled || !today || day === undefined) return
    const planned = today.main.length + today.small.length + today.done.length
    if (hour < eveningHour || day?.closedAt || !planned) return
    if (localStorage.getItem('kast:eveningSent') === date) return
    localStorage.setItem('kast:eveningSent', date)
    window.kast?.notify('Час закрити день', 'Три короткі кроки — і голова вільна до завтра.', 'close-day')
  }, [hour, eveningHour, enabled, day, today, date])
}
