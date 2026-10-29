import { useCallback, useRef, useState } from 'react'
import { cn, Icon, useEscape, useOutsideClick } from '@/design-system'
import { EMOJI_GROUPS } from './emojis'

/**
 * Кольорові емодзі в системних шрифтах сидять трохи нижче центру рядка (Segoe UI Emoji — на ~5% розміру).
 * Один раз міряємо симетричний 🟢 на цьому пристрої й зсуваємо всі .note-emoji на цю різницю.
 */
function measureEmojiShift() {
  try {
    const px = 100
    const cv = document.createElement('canvas')
    cv.width = cv.height = 200
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    ctx.font = `${px}px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif`
    const m = ctx.measureText('🟢')
    const base = 150
    ctx.fillText('🟢', 20, base)
    const d = ctx.getImageData(0, 0, 200, 200).data
    let top = -1
    let bottom = -1
    for (let y = 0; y < 200; y++)
      for (let x = 0; x < 200; x++)
        if (d[(y * 200 + x) * 4 + 3] > 40) {
          if (top < 0) top = y
          bottom = y
        }
    if (top < 0) return
    // Центр гліфа відносно центру рядка з line-height: 1
    const baseline = (px - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent
    const inkCenter = baseline - (base - top - (bottom + 1 - base)) / 2
    const shift = (px / 2 - inkCenter) / px
    if (Math.abs(shift) < 0.15) document.documentElement.style.setProperty('--emoji-shift', `${shift.toFixed(3)}em`)
  } catch {
    // Без вимірювання — без зсуву
  }
}
measureEmojiShift()

const RECENT_KEY = 'kast.recentEmoji'
const readRecent = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((e) => typeof e === 'string').slice(0, 16) : []
  } catch {
    return []
  }
}
const saveRecent = (emoji: string) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([emoji, ...readRecent().filter((e) => e !== emoji)].slice(0, 16)))
  } catch {
    // Без сховища просто не пам'ятаємо нещодавні
  }
}

/** Іконка нотатки: кнопка біля заголовка й сітка емодзі з пошуком (українською чи англійською) */
export function EmojiPicker({ value, onChange, disabled }: { value?: string; onChange: (emoji?: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useOutsideClick(ref, close, open)
  useEscape(close, open)

  // Заблокована нотатка без іконки — кнопки немає взагалі
  if (disabled && !value) return null

  const query = q.trim().toLowerCase()
  const groups = query
    ? [{ label: 'Знайдено', items: [...new Map(EMOJI_GROUPS.flatMap((g) => g.items).filter(([, k]) => k.includes(query))).entries()] }]
    : [...(readRecent().length ? [{ label: 'Нещодавні', items: readRecent().map((e) => [e, ''] as [string, string]) }] : []), ...EMOJI_GROUPS]
  const pick = (emoji?: string) => {
    if (emoji) saveRecent(emoji)
    onChange(emoji)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setQ('')
          setOpen((o) => !o)
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={value ? 'Змінити іконку' : 'Додати іконку'}
        data-tip={value ? undefined : 'Іконка нотатки'}
        className={cn(
          'grid size-[52px] place-items-center rounded-full transition-colors disabled:cursor-default max-[640px]:size-11',
          value ? 'hover:bg-paper-line disabled:hover:bg-transparent' : 'text-dim hover:bg-paper-line hover:text-ink',
          open && 'bg-paper-line',
        )}
      >
        {value ? <span className="note-emoji text-[34px] max-[640px]:text-[28px]">{value}</span> : <Icon name="smilePlus" size={24} />}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Іконка нотатки"
          className="absolute top-full left-0 z-40 mt-2 flex w-[332px] max-w-[calc(100vw-32px)] origin-top-left animate-menu-in flex-col gap-1.5 rounded-[26px] bg-canvas p-1.5 text-white shadow-menu"
        >
          <label className="flex h-10 items-center gap-2 rounded-[20px] bg-tile pr-2 pl-3.5">
            <Icon name="search" size={16} className="shrink-0 text-muted" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                // Enter — перший знайдений
                if (e.key === 'Enter' && groups[0]?.items[0]) pick(groups[0].items[0][0])
              }}
              placeholder="Пошук: кава, ідея, ціль…"
              aria-label="Пошук емодзі"
              className="h-full min-w-0 flex-1 bg-transparent text-[14px] font-semibold caret-growth outline-none placeholder:text-muted"
            />
          </label>
          <div className="flex h-[284px] flex-col overflow-y-auto overscroll-contain px-1">
            {groups.map((g) => (
              <div key={g.label} className="flex flex-col">
                {g.items.length > 0 && <span className="px-1.5 pt-2 pb-1 text-[12px] font-bold text-muted">{g.label}</span>}
                <div className="grid grid-cols-8">
                  {g.items.map(([emoji, k]) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => pick(emoji)}
                      aria-label={k.split(' ')[0] || emoji}
                      aria-pressed={emoji === value}
                      className={cn('grid aspect-square place-items-center rounded-full hover:bg-steel', emoji === value && 'bg-steel')}
                    >
                      <span className="note-emoji text-[22px]">{emoji}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!groups[0]?.items.length && <p className="px-2 py-6 text-center text-[14px] font-semibold text-muted">Нічого не знайдено</p>}
          </div>
          {value && (
            <button type="button" onClick={() => pick(undefined)} className="flex h-10 items-center justify-center gap-2 rounded-[20px] bg-tile text-[14px] font-bold hover:bg-steel">
              <Icon name="trashLines" size={16} />
              Прибрати іконку
            </button>
          )}
        </div>
      )}
    </div>
  )
}
