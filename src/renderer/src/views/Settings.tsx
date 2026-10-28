import { useState } from 'react'
import { Button, Modal, SettingRow, Stepper, Switch, useToast } from '@/design-system'
import { checkForUpdates, installUpdate, prettyHotkey, useSettings, useUpdateState } from '@/lib/hooks'
import { SyncSection } from '@/sync/SyncSection'
import { exportBackup, importBackup } from '@/data/backup'
import type { UpdateState } from '../../../shared/types'
import { getAppVersion, isDesktop, isNativeMobile, openBackupFile, saveBackupFile } from '@/lib/platform'

export function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [s, set] = useSettings()
  const toast = useToast()

  return (
    <Modal open={open} onClose={onClose} title="Налаштування" size="xl">
      {/* Дві колонки, щоб усе вміщалось без прокрутки; у вузькому вікні — одна */}
      <div className="grid grid-cols-2 items-start gap-3 pb-2 max-[900px]:grid-cols-1">
        <div className="flex flex-col gap-3">
          <Group title="Синхронізація">
            <SyncSection />
          </Group>
          <Group title={`Дані й версія ${getAppVersion()}`}>
            <BackupRow />
            {(isDesktop || isNativeMobile) && <UpdateRow />}
          </Group>
        </div>
        <Group title="Поведінка">
          {isDesktop && (
            <SettingRow title="Швидкий запис" text="Працює з будь-якої програми">
              <HotkeyInput
                value={s.hotkey}
                onChange={(hotkey) =>
                  set({ hotkey }).catch((e: Error) => toast({ kind: 'error', title: 'Не вдалося', text: e.message.replace(/^.*Error: /, '') }))
                }
              />
            </SettingRow>
          )}
          <SettingRow title="Вечір починається о" text="Тоді Kast запропонує закрити день">
            <Stepper size="sm" label="Година вечора" value={s.eveningHour} min={14} max={23} unit=":00" onChange={(eveningHour) => set({ eveningHour })} />
          </SettingRow>
          {isDesktop && (
            <SettingRow title="Нагадати ввечері" text="Одне сповіщення, не більше">
              <Switch label="Нагадати ввечері" checked={s.notifyEvening} onChange={(notifyEvening) => set({ notifyEvening })} />
            </SettingRow>
          )}
          {isDesktop && (
            <SettingRow title="Запуск разом із Windows" text="Тихо у треї — гаряча клавіша одразу працює">
              <Switch label="Запуск разом із Windows" checked={s.launchAtLogin} onChange={(launchAtLogin) => set({ launchAtLogin })} />
            </SettingRow>
          )}
        </Group>
      </div>
    </Modal>
  )
}

/** Резервна копія у файл і відновлення з нього — незалежно від входу в акаунт */
function BackupRow() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      const { json, name, count } = await exportBackup()
      const path = await saveBackupFile(json, name)
      if (path) toast({ title: isNativeMobile ? 'Копію передано' : 'Копію збережено', text: `${count} записів · ${path.split(/[\\/]/).pop()}` })
    } catch (e) {
      toast({ kind: 'error', title: 'Не вдалося зберегти копію', text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }
  const restore = async () => {
    setBusy(true)
    try {
      const text = await openBackupFile()
      if (text === null) return
      const r = await importBackup(text)
      const n = r.tasks + r.notes + r.days + r.files
      toast(n ? { title: 'Відновлено', text: `Задач: ${r.tasks}, нотаток: ${r.notes}, фото: ${r.files}` } : { kind: 'info', title: 'Усе вже актуальне', text: 'У файлі немає новіших записів' })
    } catch (e) {
      toast({ kind: 'error', title: 'Не вдалося відновити', text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }
  return (
    <SettingRow title="Резервна копія" text="Усе в одному файлі">
      <div className="flex gap-2">
        <Button size="sm" variant="steel" iconLeft="download" loading={busy} onClick={save}>
          Зберегти
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={restore}>
          Відновити
        </Button>
      </div>
    </SettingRow>
  )
}

function UpdateRow() {
  const update = useUpdateState()
  return (
    <SettingRow title="Оновлення" text={updateText(update)}>
      {update.kind === 'ready' ? (
        <Button size="sm" variant="pulse" onClick={installUpdate}>
          {isNativeMobile ? 'Завантажити' : 'Перезапустити'}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="steel"
          loading={update.kind === 'checking' || update.kind === 'downloading'}
          disabled={update.kind === 'dev'}
          onClick={checkForUpdates}
        >
          Перевірити
        </Button>
      )}
    </SettingRow>
  )
}

/** Група налаштувань: картка canvas усередині діалогу tile */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="settings-group flex flex-col gap-1 rounded-card bg-canvas px-5 py-4">
      <h3 className="px-1 pb-1 text-[13px] font-extrabold text-grey">{title}</h3>
      {children}
    </section>
  )
}

function updateText(u: UpdateState): string {
  switch (u.kind) {
    case 'dev':
      return 'Режим розробки — оновлення вимкнено'
    case 'checking':
      return 'Перевіряю…'
    case 'downloading':
      return `Завантажую ${u.version ?? ''} · ${u.percent}%`
    case 'ready':
      // На Android оновлення — це новий APK: завантажити й підтвердити встановлення
      if (isNativeMobile) return `Версія ${u.version} — завантажте й встановіть поверх, дані збережуться`
      return `Версія ${u.version} готова${u.notes ? ` — ${u.notes.split('\n')[0]}` : ''}`
    case 'error':
      return 'Не вдалося перевірити. Спробую пізніше'
    case 'none':
      return 'У вас остання версія'
    default:
      return isNativeMobile ? 'Kast сам перевіряє нові версії' : 'Оновлюється автоматично'
  }
}

const KEY_NAMES: Record<string, string> = {
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Enter: 'Enter',
  Backspace: 'Backspace',
  Tab: 'Tab',
}

function toAccelerator(e: React.KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null
  const key =
    KEY_NAMES[e.key] ??
    (/^F\d{1,2}$/.test(e.key) ? e.key : e.code.startsWith('Key') ? e.code.slice(3) : e.code.startsWith('Digit') ? e.code.slice(5) : null)
  if (!key) return null
  const mods = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean)
  if (!mods.length) return null
  return [...mods, key].join('+')
}

function HotkeyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [recording, setRecording] = useState(false)
  return (
    <button
      onClick={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={(e) => {
        if (!recording) return
        e.preventDefault()
        if (e.key === 'Escape') return setRecording(false)
        const acc = toAccelerator(e)
        if (acc) {
          setRecording(false)
          onChange(acc)
        }
      }}
      className={
        recording
          ? 'h-10 min-w-40 rounded-control bg-tile px-4 text-[14px] font-extrabold text-growth shadow-[inset_0_0_0_2px_var(--color-growth)]'
          : 'h-10 min-w-40 rounded-control bg-tile px-4 text-[14px] font-extrabold text-white transition-colors hover:bg-steel'
      }
    >
      {recording ? 'Натисніть комбінацію…' : prettyHotkey(value)}
    </button>
  )
}
