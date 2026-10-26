export const DAY = 86_400_000
const offset = window.kast?.info.nowOffset ?? 0

/** «Зараз» з урахуванням KAST_NOW для налагодження */
export const now = () => Date.now() + offset
export const nowDate = () => new Date(now())

const pad = (n: number) => String(n).padStart(2, '0')
export const dayKey = (d: Date = nowDate()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const fromKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const addDays = (key: string, n: number) => {
  const d = fromKey(key)
  d.setDate(d.getDate() + n)
  return dayKey(d)
}

/** Понеділок поточного тижня */
export function weekStart(d: Date = nowDate()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

const longDay = new Intl.DateTimeFormat('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' })
const shortDay = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short' })
const weekdayShort = new Intl.DateTimeFormat('uk-UA', { weekday: 'short' })
const time = new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit' })

export const fmtLongDay = (d: Date = nowDate()) => {
  const s = longDay.format(d)
  return s.charAt(0).toUpperCase() + s.slice(1)
}
export const fmtShortDay = (ts: number) => shortDay.format(new Date(ts))
export const fmtWeekday = (d: Date) => weekdayShort.format(d).replace('.', '')
export const fmtTime = (ts: number) => time.format(new Date(ts))

/** Вік запису людською мовою: «сьогодні», «вчора», «5 дн» */
export function age(ts: number) {
  const days = Math.floor((fromKey(dayKey()).getTime() - fromKey(dayKey(new Date(ts))).getTime()) / DAY)
  if (days <= 0) return 'сьогодні'
  if (days === 1) return 'вчора'
  if (days < 7) return `${days} дн`
  if (days < 60) return `${Math.floor(days / 7)} тиж`
  return fmtShortDay(ts)
}

/** Українська множина: pluralWord(5, ['запис', 'записи', 'записів']) → «записів» */
export function pluralWord(n: number, [one, few, many]: [string, string, string]) {
  const m10 = n % 10
  const m100 = n % 100
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many
}

/** plural(5, ['запис', 'записи', 'записів']) → «5 записів» */
export const plural = (n: number, forms: [string, string, string]) => `${n} ${pluralWord(n, forms)}`
