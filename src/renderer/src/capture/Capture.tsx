import { useEffect, useRef, useState } from 'react'
import { cn, Icon } from '@/design-system'
import { captureToInbox } from '@/data/tasks'
import { appendToQuickNote } from '@/data/notes'

type Target = 'inbox' | 'note'

/**
 * Вікно, що відкривається глобальною клавішею з будь-якої програми.
 * Одна дія: написати й Enter. Tab перемикає «Вхідні ↔ Блокнот», Esc закриває.
 */
export function Capture() {
  const [text, setText] = useState('')
  const [target, setTarget] = useState<Target>('inbox')
  const [saved, setSaved] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    return window.kast?.capture.onOpen(() => {
      setSaved(false)
      setTarget('inbox')
      requestAnimationFrame(() => input.current?.focus())
    })
  }, [])

  // Якщо вікно отримало фокус пізніше (Windows затримує), поле все одно стає активним
  useEffect(() => {
    const onFocus = () => input.current?.focus()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const hide = () => window.kast?.capture.hide()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const v = text.trim()
    if (!v) return hide()
    if (target === 'inbox') await captureToInbox(v)
    else await appendToQuickNote(v)
    setText('')
    setSaved(true)
    setTimeout(hide, 450)
  }

  return (
    <div className="flex h-screen items-start p-3">
      <form
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') hide()
          if (e.key === 'Tab') {
            e.preventDefault()
            setTarget((t) => (t === 'inbox' ? 'note' : 'inbox'))
          }
        }}
        className="flex w-full animate-modal-in items-center gap-3 rounded-capsule bg-paper p-2 text-night shadow-[0_16px_40px_-12px_rgba(0,0,0,0.65)]"
      >
        <button
          type="button"
          onClick={() => setTarget((t) => (t === 'inbox' ? 'note' : 'inbox'))}
          title="Tab — змінити, куди записати"
          className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-night pr-4 pl-3 text-[13px] font-bold text-paper transition active:scale-95"
        >
          <Icon name={target === 'inbox' ? 'inbox' : 'notebook'} size={16} />
          {target === 'inbox' ? 'Вхідні' : 'Блокнот'}
        </button>
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={target === 'inbox' ? 'Що в голові? Enter — і забули' : 'Думка в «Швидкі записи»…'}
          className="min-w-0 flex-1 bg-transparent text-[17px] font-semibold tracking-tight outline-none placeholder:text-night/35"
        />
        <span
          className={cn(
            'grid size-11 shrink-0 place-items-center rounded-full transition-colors duration-200',
            saved ? 'bg-pulse text-night' : 'bg-night/8 text-night/50',
          )}
          aria-live="polite"
          aria-label={saved ? 'Записано' : undefined}
        >
          <Icon name={saved ? 'check' : 'enter'} size={18} strokeWidth={saved ? 3 : 2} />
        </span>
      </form>
    </div>
  )
}
