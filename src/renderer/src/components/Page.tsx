import { useEffect, useState, type ReactNode } from 'react'
import { cn, PageGrid, PageHead } from '@/design-system'

/** Перша секунда після відкриття вкладки: блоки з'являються разом, рядки окремо не анімуються */
export function useEntering() {
  const [entering, setEntering] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setEntering(false), 1100)
    return () => clearTimeout(t)
  }, [])
  return entering ? '' : undefined
}

/**
 * Єдиний скелет вкладки Pulse: великий заголовок у два рядки → колонка 400px + основна.
 * Ширина 1280px, відступи 24 / 32. Однакове місце кожного блоку на всіх вкладках.
 */
export function Page({
  light,
  heavy,
  sub,
  actions,
  side,
  main,
  fill,
}: {
  light: string
  heavy: string
  sub?: ReactNode
  actions?: ReactNode
  side: ReactNode
  main: ReactNode
  /** Висоту задає основна колонка (аркуш Блокнота), а ліва прокручується всередині цієї висоти */
  fill?: boolean
}) {
  const entering = useEntering()
  return (
    <div data-entering={entering} className="h-full overflow-y-auto">
      <div className={cn('mx-auto flex w-full max-w-[1280px] flex-col px-8 pt-6 pb-16 max-[640px]:px-4', fill && 'pb-8')}>
        <PageHead light={light} heavy={heavy} sub={sub} actions={actions} />
        <PageGrid side={side} main={main} fill={fill} />
      </div>
    </div>
  )
}
