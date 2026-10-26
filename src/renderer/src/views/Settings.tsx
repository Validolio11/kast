import { useState } from 'react'
import { Button, Modal, SettingRow, Stepper, Toggle, useToast } from '@/design-system'
import { prettyHotkey, useSettings, useUpdateState } from '@/lib/hooks'
import { SyncSection } from '@/sync/SyncSection'
import type { UpdateState } from '../../../shared/types'

export function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [s, set] = useSettings()
  const update = useUpdateState()
  const toast = useToast()

  return (
    <Modal open={open} onClose={onClose} title="Налаштування" size="md">
      <div className="flex flex-col pb-2">
        <SyncSection />
        <SettingRow icon="keyboard" title="Швидкий запис" text="Працює з будь-якої програми">
          <HotkeyInput
            value={s.hotkey}
            onChange={(hotkey) => set({ hotkey }).catch((e: Error) => toast({ kind: 'error', title: 'Не вдалося', text: e.message.replace(/^.*Error: /, '') }))}
          />
        </SettingRow>
        <SettingRow icon="moon" title="Вечір починається о" text="Після цього Kast запропонує закрити день">
          <Stepper size="sm" label="Година вечора" value={s.eveningHour} min={14} max={23} unit=":00" onChange={(eveningHour) => set({ eveningHour })} />
        </SettingRow>
        <SettingRow icon="bell" title="Нагадати ввечері" text="Одне сповіщення Windows, не більше">
          <Toggle showState={false} label="Нагадування ввечері" checked={s.notifyEvening} onChange={(notifyEvening) => set({ notifyEvening })} />
        </SettingRow>
        <SettingRow icon="appWindow" title="Запускати з Windows" text="Тихо у треї — гаряча клавіша одразу працює">
          <Toggle showState={false} label="Запуск з Windows" checked={s.launchAtLogin} onChange={(launchAtLogin) => set({ launchAtLogin })} />
        </SettingRow>
        <SettingRow icon="download" title={`Версія ${window.kast?.info.version ?? 'dev'}`} text={updateText(update)}>
          {update.kind === 'ready' ? (
            <Button size="sm" variant="pulse" onClick={() => window.kast.updates.install()}>
              Перезапустити
            </Button>
          ) : (
            <Button
              size="sm"
              variant="steel"
              loading={update.kind === 'checking' || update.kind === 'downloading'}
              disabled={update.kind === 'dev'}
              onClick={() => window.kast?.updates.check()}
            >
              Перевірити
            </Button>
          )}
        </SettingRow>
      </div>
    </Modal>
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
      return `Версія ${u.version} готова${u.notes ? ` — ${u.notes.split('\n')[0]}` : ''}`
    case 'error':
      return 'Не вдалося перевірити. Спробую пізніше'
    case 'none':
      return 'У вас остання версія'
    default:
      return 'Оновлюється автоматично'
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
  const key = KEY_NAMES[e.key] ?? (/^F\d{1,2}$/.test(e.key) ? e.key : e.code.startsWith('Key') ? e.code.slice(3) : e.code.startsWith('Digit') ? e.code.slice(5) : null)
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
      className="h-9 min-w-40 rounded-full bg-night px-4 text-[13px] font-bold text-paper ring-1 ring-white/10 transition hover:ring-white/30 focus:ring-2 focus:ring-volt-glow"
    >
      {recording ? 'Натисніть комбінацію…' : prettyHotkey(value)}
    </button>
  )
}
