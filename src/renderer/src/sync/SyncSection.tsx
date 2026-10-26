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

  if (!supabase) return <SettingRow title="Лише на цьому ПК" text="Синхронізація ще не налаштована: потрібні ключі Supabase у файлі .env" />

  if (email)
    return (
      <SettingRow title={email} text={syncLabel(state)}>
        <Button size="sm" variant="steel" iconLeft="logOut" onClick={() => signOut()}>
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
    <div className="flex flex-col gap-3 pb-2">
      <SettingRow
        title="На всіх ваших ПК"
        text={step === 'email' ? 'Увійдіть кодом з пошти. Без входу все зберігається на цьому ПК.' : `Код надіслано на ${address}`}
      />
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full bg-tile px-4 focus-within:shadow-[inset_0_0_0_2px_var(--color-growth)]">
          <Icon name={step === 'email' ? 'mail' : 'keyboard'} size={16} className="text-grey" />
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
            className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-paper caret-growth outline-none placeholder:text-muted"
          />
        </label>
        <Button type="submit" loading={busy}>
          {step === 'email' ? 'Надіслати код' : 'Увійти'}
        </Button>
        {step === 'code' && (
          <Button variant="ghost" onClick={() => setStep('email')}>
            Змінити email
          </Button>
        )}
      </form>
    </div>
  )
}
