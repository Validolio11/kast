import { App as NativeApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Preferences } from '@capacitor/preferences'
import { supabase } from '@/sync/client'
import { isNativeMobile } from './platform'

export const MOBILE_AUTH_CALLBACK = 'com.kast.app://auth/callback'
const ATTEMPT_KEY = 'kast.oauth.attempt.v1'
const TIMEOUT_MS = 5 * 60_000
interface Attempt { id: string; startedAt: number; flowId?: string | null }
interface Pending { attempt: Attempt; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
let pending: Pending | null = null
let processing = false
let ready: Promise<void> | undefined
let lastError: string | null = null
let attemptWrites = Promise.resolve()
let finishing: Promise<void> | null = null

function updateAttempt(operation: () => Promise<void>) {
  const update = attemptWrites.then(operation)
  attemptWrites = update.catch(() => {})
  return update
}

export function takeMobileAuthError() {
  const error = lastError
  lastError = null
  return error
}

/** Compare the whole callback location; never accept tokens/fragments or a similar scheme/host. */
export function parseMobileAuthCallback(value: string): URL | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'com.kast.app:' || url.hostname !== 'auth' || url.pathname !== '/callback' || url.port || url.username || url.password || url.hash) return null
    return url
  } catch { return null }
}

function finish(error?: Error): Promise<void> {
  if (finishing) return finishing
  const current = pending
  pending = null
  if (current) clearTimeout(current.timer)
  const task = (async () => {
    // Serialize removal behind an in-flight write so cancelling cannot leave a late saved attempt.
    await updateAttempt(() => Preferences.remove({ key: ATTEMPT_KEY })).catch(() => {})
    // Clear pending first: closing the Custom Tab also emits browserFinished.
    await Browser.close().catch(() => {})
    if (current) error ? current.reject(error) : current.resolve()
    else if (error && error.message !== 'cancelled') {
      lastError = error.message
      document.dispatchEvent(new CustomEvent('kast:auth-error'))
    }
  })()
  finishing = task
  void task.finally(() => { if (finishing === task) finishing = null })
  return task
}

async function handleCallback(value: string) {
  const url = parseMobileAuthCallback(value)
  if (!url || processing || finishing || !supabase) return
  processing = true
  try {
    const { value: saved } = await Preferences.get({ key: ATTEMPT_KEY })
    if (!saved) return
    const attempt = JSON.parse(saved) as Attempt
    if (!attempt.id || !Number.isFinite(attempt.startedAt) || Date.now() - attempt.startedAt > TIMEOUT_MS || attempt.startedAt > Date.now()) {
      await finish(new Error('Час на вхід вийшов. Спробуйте ще раз.'))
      return
    }
    if (pending && pending.attempt.id !== attempt.id) return
    const error = url.searchParams.get('error_description') ?? url.searchParams.get('error')
    if (error) throw new Error(error)
    const codes = url.searchParams.getAll('code')
    if (codes.length !== 1 || !codes[0] || codes[0].length > 4096) throw new Error('Некоректна відповідь входу')
    const flowIds = url.searchParams.getAll('sb_flow_id')
    if (flowIds.length > 1 || (flowIds.length === 1 && flowIds[0] !== attempt.flowId)) throw new Error('Відповідь належить іншій спробі входу')
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(codes[0], attempt.flowId ? { flowId: attempt.flowId } : undefined)
    if (exchangeError) throw exchangeError
    await finish()
  } catch (error) {
    await finish(error instanceof Error ? error : new Error('Не вдалося завершити вхід'))
  } finally { processing = false }
}

export function initMobileAuth(): Promise<void> {
  if (!isNativeMobile) return Promise.resolve()
  return ready ??= (async () => {
    await NativeApp.addListener('appUrlOpen', ({ url }) => { void handleCallback(url) })
    await NativeApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        supabase?.auth.startAutoRefresh()
        window.dispatchEvent(new Event('kast:resume'))
      } else supabase?.auth.stopAutoRefresh()
    })
    await Browser.addListener('browserFinished', () => {
      // A deep-link event can arrive beside the Custom Tab close event.
      const current = pending
      setTimeout(() => { if (current && pending === current && !processing) void finish(new Error('cancelled')) }, 300)
    })
    const state = await NativeApp.getState()
    if (!state.isActive) supabase?.auth.stopAutoRefresh()
    const launch = await NativeApp.getLaunchUrl()
    if (launch?.url) await handleCallback(launch.url)
  })()
}

export async function signInWithGoogleMobile(): Promise<void> {
  if (!supabase) throw new Error('Синхронізацію ще не налаштовано')
  await initMobileAuth()
  await finishing
  if (pending || processing) throw new Error('Вхід уже триває')
  lastError = null
  return new Promise<void>((resolve, reject) => {
    const attempt: Attempt = { id: crypto.randomUUID(), startedAt: Date.now() }
    const current: Pending = { attempt, resolve, reject, timer: setTimeout(() => { void finish(new Error('Час на вхід вийшов')) }, TIMEOUT_MS) }
    pending = current
    void (async () => {
      const { data, error } = await supabase!.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: MOBILE_AUTH_CALLBACK, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
      })
      if (error) throw error
      if (pending !== current) return
      const url = new URL(data.url)
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Небезпечна адреса входу')
      attempt.flowId = data.flowId
      await updateAttempt(async () => {
        if (pending === current) await Preferences.set({ key: ATTEMPT_KEY, value: JSON.stringify(attempt) })
      })
      if (pending !== current) return
      await Browser.open({ url: url.toString(), toolbarColor: '#090a0a' })
    })().catch((error: unknown) => {
      if (pending === current) void finish(error instanceof Error ? error : new Error('Не вдалося відкрити браузер'))
    })
  })
}

export function cancelGoogleMobile() {
  if (!processing) void finish(new Error('cancelled'))
}
