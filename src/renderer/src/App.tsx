import { useCallback, useEffect, useRef, useState } from 'react'
import { startGoogleSync } from '@/lib/gtasks'
import { AppHeader, AppMobileHeader, AppSidebar, Button, Modal, PageHeaderContext, RoundButton, SyncDot, ToastProvider, UpdatePill, useToast, WindowControls, type NavTab } from '@/design-system'
import { useDay, useStatus, useToday } from '@/data/hooks'
import { activateRepeats, rolloverLeftovers, sweepStale } from '@/data/tasks'
import { markLegacyQuickNote } from '@/data/notes'
import { CloseDay } from '@/flows/CloseDay'
import { Focus } from '@/flows/Focus'
import { installUpdate, useDayKey, useHour, useSettings, useUpdateState } from '@/lib/hooks'
import { afterFirstPull, resolveAccountSwitch, startSync, upToDate, useSync } from '@/sync/engine'
import { cleanupFiles } from '@/data/files'
import { startAndroidUpdates } from '@/lib/androidUpdate'
import { Done } from '@/views/Done'
import { Inbox } from '@/views/Inbox'
import { Notebook, type OpenNote } from '@/views/Notebook'
import { QuickSwitcher } from '@/components/QuickSwitcher'
import { Settings } from '@/views/Settings'
import { Today } from '@/views/Today'

type Tab = 'today' | 'notebook' | 'inbox' | 'done'
const TABS: Tab[] = ['today', 'inbox', 'done', 'notebook']

/**
 * Вхід в інший акаунт, коли на пристрої дані попереднього: людина вирішує, куди їх подіти.
 * Поки вікно відкрите, синхронізація стоїть — нічого чужого в новий акаунт не потрапить.
 */
function AccountSwitch({ switching, email }: { switching: { from: string | null; unsynced: number } | null; email: string | null }) {
  const from = switching?.from ? `акаунта ${switching.from}` : 'попереднього акаунта'
  const lost = switching?.unsynced ? ` ${switching.unsynced} змін ще не встигли синхронізуватись — якщо прибрати, вони зникнуть.` : ''
  return (
    <Modal
      open={!!switching}
      onClose={() => resolveAccountSwitch('cancel')}
      size="sm"
      title="Дані іншого акаунта"
      description={`На цьому пристрої задачі й нотатки з ${from}. Ви увійшли як ${email ?? 'інший користувач'}.${lost}`}
      footer={
        <>
          <Button variant="steel" onClick={() => resolveAccountSwitch('clear')}>
            Прибрати з пристрою
          </Button>
          <Button variant="paper" onClick={() => resolveAccountSwitch('move')} data-autofocus>
            Перенести сюди
          </Button>
        </>
      }
    >
      <p className="pb-2 text-[14px] font-semibold text-muted">Прибрані дані лишаються в хмарі попереднього акаунта. Закрийте вікно, щоб вийти з нового акаунта.</p>
    </Modal>
  )
}

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
  const [switcher, setSwitcher] = useState(false)
  const [openNote, setOpenNote] = useState<OpenNote>(null)
  const clearOpenNote = useCallback(() => setOpenNote(null), [])
  const [maximized, setMaximized] = useState(false)
  const [pageHeader, setPageHeader] = useState<HTMLDivElement | null>(null)
  const [desktop, setDesktop] = useState(() => matchMedia('(min-width: 760px)').matches)
  useEffect(() => {
    const query = matchMedia('(min-width: 760px)')
    const change = () => setDesktop(query.matches)
    query.addEventListener('change', change)
    return () => query.removeEventListener('change', change)
  }, [])
  const captureRef = useRef<HTMLInputElement>(null)
  const date = useDayKey()
  const [settings] = useSettings()
  const update = useUpdateState()
  const toast = useToast()
  const sync = useSync()
  const today = useToday(date)
  const inbox = useStatus('inbox')

  useEffect(() => {
    startSync()
    startAndroidUpdates()
    // Задачі Kast → список «Kast» у Google Tasks (лише коли база вже знає все з хмари)
    afterFirstPull().then(startGoogleSync, startGoogleSync)
  }, [])

  useEffect(() => {
    if (!window.kast) return
    window.kast.window.isMaximized().then(setMaximized)
    return window.kast.window.onMaximized(setMaximized)
  }, [])

  // Новий день (при старті й опівночі): незакрите з минулих днів повертається у Вхідні.
  // Спершу чекаємо зміни з хмари: інакше вчорашній стан цього ПК перезапише закрите на телефоні.
  useEffect(() => {
    // Спершу незакрите з минулих днів, потім повтори, що настали, — так ліміт дня рахується чесно
    afterFirstPull()
      .then(() => rolloverLeftovers(date))
      .then(() => activateRepeats(date))
      .catch((e) => console.error('new day failed', e))
  }, [date])

  // Тихе старіння Вхідних: при старті й щогодини
  useEffect(() => {
    markLegacyQuickNote()
    // Фото, яких давно немає в жодній нотатці, — лише коли пристрій бачить усе з хмари
    afterFirstPull()
      .then(() => (upToDate() ? cleanupFiles() : undefined))
      .catch((e) => console.error('photo cleanup failed', e))
    sweepStale()
    const t = setInterval(sweepStale, 60 * 60_000)
    return () => clearInterval(t)
  }, [])

  useEveningReminder(settings.eveningHour, settings.notifyEvening, date)

  const go = useCallback((t: Tab) => {
    setFocusId(null)
    setTab(t)
    if (!matchMedia('(max-width: 759px)').matches) requestAnimationFrame(() => captureRef.current?.focus())
  }, [])

  useEffect(() => {
    const back = (e: Event) => {
      if (e.defaultPrevented) return
      if (settingsOpen) setSettingsOpen(false)
      else if (closing) setClosing(false)
      else if (focusId) setFocusId(null)
      else if (tab !== 'today') go('today')
      else return
      e.preventDefault()
    }
    document.addEventListener('kast:back', back)
    return () => document.removeEventListener('kast:back', back)
  }, [settingsOpen, closing, focusId, tab, go])

  // Перехід з трею / сповіщення
  const updateRef = useRef(update)
  updateRef.current = update
  useEffect(
    () =>
      window.kast?.onNavigate((t) => {
        if (t === 'close-day') {
          go('today')
          setClosing(true)
        } else if (t === 'settings') setSettingsOpen(true)
        else if (t === 'update') {
          // Клік по сповіщенню про оновлення: одна дія — перезапустити
          const u = updateRef.current
          if (u.kind === 'ready')
            toast({
              title: `Версія ${u.version} готова`,
              text: 'Перезапуск займе кілька секунд',
              ms: 10_000,
              action: { label: 'Перезапустити', onClick: installUpdate },
            })
        } else go(t)
      }),
    [go, toast],
  )

  // Гарячі клавіші: Ctrl+1..4 — вкладки, Ctrl+N — поле запису, Ctrl+P — швидкий пошук нотаток, Ctrl+, — налаштування
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey) return
      const n = Number(e.key)
      if (n >= 1 && n <= 4) {
        e.preventDefault()
        go(TABS[n - 1])
      } else if (!e.shiftKey && (e.key.toLowerCase() === 'n' || e.code === 'KeyN')) {
        e.preventDefault()
            setFocusId(null)
        requestAnimationFrame(() => captureRef.current?.focus())
      } else if (!e.shiftKey && (e.key.toLowerCase() === 'p' || e.code === 'KeyP')) {
        // Швидкий пошук нотаток з будь-якої вкладки
        e.preventDefault()
        setSwitcher(true)
      } else if (e.key === ',') {
        e.preventDefault()
            setSettingsOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  const tabs: NavTab<Tab>[] = [
    { id: 'today', label: 'Сьогодні', icon: 'sun', count: today ? today.main.length + today.small.length : 0, tip: 'Ctrl + 1' },
    { id: 'inbox', label: 'Вхідні', icon: 'inbox', count: inbox?.length, tip: 'Ctrl + 2' },
    { id: 'done', label: 'Готово', icon: 'check', tip: 'Ctrl + 3' },
    { id: 'notebook', label: 'Блокнот', icon: 'notebook', tip: 'Ctrl + 4' },
  ]

  const onOpen = (id: string) => setFocusId(id)

  return (
    <div className="app-shell flex h-full min-w-0 w-full bg-canvas">
      <AppSidebar
        tabs={tabs}
        active={tab}
        onSelect={go}
        onSettings={() => setSettingsOpen(true)}
        settingsBadge={sync.state !== 'local' ? <SyncDot state={sync.state} /> : undefined}
      />
      <div className="app-workspace">
      <AppMobileHeader
        tabs={tabs}
        active={tab}
        onSelect={go}
        actions={
          <>
            {update.kind === 'ready' && <UpdatePill version={update.version} onClick={installUpdate} />}
            <RoundButton icon="cog" label="Налаштування" onClick={() => setSettingsOpen(true)} badge={sync.state !== 'local' && <SyncDot state={sync.state} />} />
          </>
        }
      />
      <PageHeaderContext.Provider value={desktop ? pageHeader : null}>
      <AppHeader
        title={focusId ? 'Задача' : tabs.find(t => t.id === tab)?.label ?? 'Kast'}
        headingRef={setPageHeader}
        actions={update.kind === 'ready' ? <UpdatePill version={update.version} onClick={installUpdate} /> : undefined}
        windowControls={window.kast && <WindowControls maximized={maximized} onMinimize={() => window.kast.window.minimize()} onToggleMaximize={() => window.kast.window.toggleMaximize()} onClose={() => window.kast.window.close()} />}
      />
      <main className="app-main min-h-0 min-w-0 flex-1">
        {focusId ? (
          <Focus id={focusId} onClose={() => setFocusId(null)} />
        ) : tab === 'today' ? (
          <Today date={date} eveningHour={settings.eveningHour} captureRef={captureRef} onOpen={onOpen} onCloseDay={() => setClosing(true)} />
        ) : tab === 'notebook' ? (
          <Notebook captureRef={captureRef} openNote={openNote} onOpened={clearOpenNote} />
        ) : tab === 'inbox' ? (
          <Inbox captureRef={captureRef} hotkey={settings.hotkey} onOpen={onOpen} />
        ) : (
          <Done captureRef={captureRef} onOpen={onOpen} />
        )}
      </main>
      </PageHeaderContext.Provider>
      </div>
      <CloseDay open={closing} onClose={() => setClosing(false)} />
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <QuickSwitcher
        open={switcher}
        onClose={() => setSwitcher(false)}
        onPick={(id) => {
          setFocusId(null)
          setTab('notebook')
          setOpenNote({ id, n: Date.now() })
        }}
      />
      <AccountSwitch switching={sync.switching} email={sync.email} />
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
