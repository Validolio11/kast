/*
 * Слово дня на «Сьогодні»: англійське слово, переклад і приклад з перекладом.
 * Нове щодня (за датою), «Інше слово» гортає далі; вимова — голосом системи, без інтернету.
 */
import { useState } from 'react'
import { Button, Icon } from '@/design-system'
import { WORDS } from '@/data/words'
import { DAY, fromKey } from '@/lib/time'

const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window

function speak(text: string) {
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text.replace(/^to /, ''))
  u.lang = 'en-US'
  u.rate = 0.9
  speechSynthesis.speak(u)
}

export function WordCard({ date }: { date: string }) {
  const [skip, setSkip] = useState(0)
  // Math.round: перехід на літній час зсуває північ на годину, а номер дня має лишатися цілим
  const day = Math.round(fromKey(date).getTime() / DAY)
  const [en, uk, example, exampleUk] = WORDS[(day + skip) % WORDS.length]

  return (
    <section aria-labelledby="word-title" className="word-card flex shrink-0 flex-col gap-3 rounded-[30px] p-5 shadow-[inset_0_0_0_1px_var(--color-tile)]">
      <h2 id="word-title" className="text-[13px] font-bold text-grey">
        Слово дня
      </h2>
      <div className="flex items-center gap-2">
        <p lang="en" className="min-w-0 text-[28px] leading-[1.1] font-extrabold tracking-[-0.02em] break-words text-white">
          {en}
        </p>
        {canSpeak && (
          <button
            type="button"
            onClick={() => speak(en)}
            aria-label={`Вимова: ${en}`}
            data-tip="Вимова"
            className="grid size-9 shrink-0 place-items-center rounded-full text-grey transition-colors hover:bg-tile hover:text-white"
          >
            <Icon name="volume" size={18} />
          </button>
        )}
      </div>
      <p className="text-[16px] leading-[1.35] font-bold text-growth">{uk}</p>
      <div className="flex flex-col gap-1 border-t border-hairline pt-3">
        <p lang="en" className="text-[15px] leading-[1.45] font-semibold text-soft">
          {example}
        </p>
        <p className="text-[14px] leading-[1.45] font-medium text-muted">{exampleUk}</p>
      </div>
      <Button size="sm" variant="ghost" className="-ml-4 self-start" onClick={() => setSkip((s) => s + 1)}>
        Інше слово
      </Button>
    </section>
  )
}
