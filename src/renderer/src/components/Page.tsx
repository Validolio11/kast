import { useEffect, useState, type ReactNode } from 'react'
import { cn, EnteringContext, PageGrid, PageHead } from '@/design-system'

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
 * Спільний макет вкладок: компактний заголовок і гнучкі колонки.
 * Робоча область займає ширину вікна зі спільними безпечними відступами.
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
    <EnteringContext.Provider value={entering !== undefined}>
      <div data-entering={entering} className="app-page h-full min-w-0 w-full overflow-y-auto">
        <div className={cn('app-page-content flex min-w-0 w-full flex-col pt-6 pb-16', fill && 'app-page-content-fill pb-8')}>
          <PageHead light={light} heavy={heavy} sub={sub} actions={actions} />
          <PageGrid side={side} main={main} fill={fill} />
        </div>
      </div>
    </EnteringContext.Provider>
  )
}
