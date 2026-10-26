import { useState } from 'react'
import { Button, Icon, SettingRow, syncLabel, useToast } from '@/design-system'
import { supabase } from './client'
import { sendCode, signOut, useSync, verifyCode } from './engine'

/** Вхід необов'язковий: email → 6-значний код з листа. Без паролів і переходів у браузер. */
export function SyncSection() {
  const { state, email } = useSync()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [value, setValue] = useState('')
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  if (!supabase)
    return <SettingRow icon="cloudOff" title="Синхронізація" text="Не налаштована: додайте ключі Supabase у файл .env і перезберіть Kast" />

  if (email)
    return (
      <SettingRow icon="cloud" title="Синхронізація" text={`${email} · ${syncLabel(state)}`}>
        <Button size="sm" variant="ghost" iconLeft="logOut" onClick={() => signOut()}>
          Вийти
        </Button>
      </SettingRow>
    )

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const v = value.trim()
    if (!v) return
    setBusy(true)
    try {
      if (step === 'email') {
        await sendCode(v)
        setAddress(v)
        setValue('')
        setStep('code')
      } else {
        await verifyCode(address, v)
        toast({ title: 'Синхронізацію увімкнено', text: 'Задачі й нотатки тепер на всіх ваших ПК' })
      }
    } catch (err) {
      toast({ kind: 'error', title: step === 'email' ? 'Не вдалося надіслати код' : 'Код не підійшов', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-b border-line py-4 [&>div:first-child]:border-0 [&>div:first-child]:pt-0 [&>div:first-child]:pb-3">
      <SettingRow
        icon="cloud"
        title="Синхронізація"
        text={step === 'email' ? 'Увійдіть, щоб задачі були на всіх ваших ПК. Без входу все зберігається тут.' : `Код надіслано на ${address}`}
      />
      <form onSubmit={submit} className="-mt-1 flex gap-2 pl-13">
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-night px-4 ring-1 ring-white/10 focus-within:ring-2 focus-within:ring-volt-glow">
          <Icon name={step === 'email' ? 'mail' : 'keyboard'} size={16} className="text-fog" />
          <input
            key={step}
            autoFocus
            type={step === 'email' ? 'email' : 'text'}
            inputMode={step === 'code' ? 'numeric' : undefined}
            autoComplete={step === 'code' ? 'one-time-code' : 'email'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={step === 'email' ? 'you@example.com' : '6 цифр з листа'}
            aria-label={step === 'email' ? 'Email' : 'Код з листа'}
            className="min-w-0 flex-1 bg-transparent text-[14px] font-medium outline-none placeholder:text-fog-2"
          />
        </label>
        <Button size="sm" type="submit" loading={busy} className="h-10">
          {step === 'email' ? 'Надіслати код' : 'Увійти'}
        </Button>
        {step === 'code' && (
          <Button size="sm" variant="ghost" className="h-10" onClick={() => setStep('email')}>
            Змінити email
          </Button>
        )}
      </form>
    </div>
  )
}
