import { useEffect, useState } from 'react'
import { Button, Icon, SettingRow, syncLabel, SyncDot, useToast } from '@/design-system'
import { supabase } from './client'
import { cancelGoogle, sendCode, signInWithGoogle, signOut, useSync, verifyCode } from './engine'
import { isNativeMobile } from '@/lib/platform'
import { takeMobileAuthError } from '@/lib/mobileAuth'

/** Знак Google для кнопки входу (офіційні кольори) */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

/**
 * Синхронізація: вхід необов'язковий. Головний шлях — Google одним кліком;
 * запасний — 6-значний код з пошти. Без входу все зберігається на цьому ПК.
 */
export function SyncSection() {
  const { state, email, name, avatar } = useSync()
  const [mode, setMode] = useState<'google' | 'email' | 'code'>('google')
  const [value, setValue] = useState('')
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  useEffect(() => {
    if (!isNativeMobile) return
    const report = () => {
      const error = takeMobileAuthError()
      if (error) toast({ kind: 'error', title: 'Не вдалося увійти через Google', text: error })
    }
    report()
    document.addEventListener('kast:auth-error', report)
    return () => document.removeEventListener('kast:auth-error', report)
  }, [toast])

  if (!supabase) return <SettingRow title="Лише на цьому пристрої" text="Синхронізацію ще не налаштовано для цієї версії Kast" />

  if (email)
    return (
      <div className="flex items-center gap-3 px-1 py-2">
        <span className="relative shrink-0">
          {avatar ? (
            <img src={avatar} alt="" referrerPolicy="no-referrer" className="size-11 rounded-full object-cover" />
          ) : (
            <span className="grid size-11 place-items-center rounded-full bg-tile text-[16px] font-extrabold text-growth">
              {(name ?? email).charAt(0).toUpperCase()}
            </span>
          )}
          <span className="absolute right-0 bottom-0 grid">
            <SyncDot state={state} />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-bold">{name ?? email}</div>
          <div className="truncate text-[13px] font-semibold text-muted">
            {name ? `${email} · ` : ''}
            {syncLabel(state)}
          </div>
        </div>
        <Button size="sm" variant="steel" iconLeft="logOut" onClick={() => signOut()}>
          Вийти
        </Button>
      </div>
    )

  const google = async () => {
    setBusy(true)
    try {
      await signInWithGoogle()
      toast({ title: 'Синхронізацію увімкнено', text: 'Задачі й нотатки тепер на всіх ваших пристроях' })
    } catch (err) {
      const msg = (err as Error).message
      if (msg !== 'cancelled') toast({ kind: 'error', title: 'Не вдалося увійти через Google', text: msg })
    } finally {
      setBusy(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const v = value.trim()
    if (!v) return
    setBusy(true)
    try {
      if (mode === 'email') {
        await sendCode(v)
        setAddress(v)
        setValue('')
        setMode('code')
      } else {
        await verifyCode(address, v)
        toast({ title: 'Синхронізацію увімкнено', text: 'Задачі й нотатки тепер на всіх ваших пристроях' })
      }
    } catch (err) {
      toast({ kind: 'error', title: mode === 'email' ? 'Не вдалося надіслати код' : 'Код не підійшов', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 pb-2">
      <SettingRow title="На всіх ваших пристроях" text="Увійдіть, і задачі та нотатки будуть однакові всюди. Без входу все лишається на цьому пристрої." />
      {mode === 'google' ? (
        <div className="flex flex-wrap items-center gap-2">
          {busy ? (
            <>
              <Button variant="paper" loading className="min-w-[230px]">
                Чекаю на браузер…
              </Button>
              <Button variant="ghost" onClick={() => cancelGoogle()}>
                Скасувати
              </Button>
            </>
          ) : (
            <button
              onClick={google}
              className="inline-flex h-12 items-center gap-3 rounded-full bg-paper pr-6 pl-5 text-[15px] font-extrabold text-ink transition hover:-translate-y-0.5 hover:bg-white active:scale-[0.97]"
            >
              <GoogleMark />
              Увійти через Google
            </button>
          )}
          {!busy && (
            <button onClick={() => setMode('email')} className="h-12 rounded-full px-4 text-[14px] font-bold text-grey transition-colors hover:text-paper">
              Кодом з пошти
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-wrap gap-2">
          <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full bg-tile px-4 focus-within:shadow-[inset_0_0_0_2px_var(--color-growth)]">
            <Icon name={mode === 'email' ? 'mail' : 'keyboard'} size={16} className="text-grey" />
            <input
              key={mode}
              autoFocus
              type={mode === 'email' ? 'email' : 'text'}
              inputMode={mode === 'code' ? 'numeric' : undefined}
              autoComplete={mode === 'code' ? 'one-time-code' : 'email'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={mode === 'email' ? 'you@example.com' : `6 цифр з листа на ${address}`}
              aria-label={mode === 'email' ? 'Email' : 'Код з листа'}
              className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-paper caret-growth outline-none placeholder:text-muted"
            />
          </label>
          <Button type="submit" loading={busy}>
            {mode === 'email' ? 'Надіслати код' : 'Увійти'}
          </Button>
          <Button variant="ghost" onClick={() => (setMode('google'), setValue(''))}>
            Назад
          </Button>
        </form>
      )}
    </div>
  )
}
