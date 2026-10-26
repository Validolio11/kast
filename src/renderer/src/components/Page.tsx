import type { ReactNode } from 'react'
import { PageHeader } from '@/design-system'

/**
 * Єдиний скелет вкладки: заголовок і поле дії завжди на тому самому місці,
 * прокручується лише вміст. Ліве вирівнювання — щоб око не стрибало між вкладками.
 */
export function Page({
  title,
  subtitle,
  meta,
  capture,
  children,
  footer,
  fill,
}: {
  title: string
  subtitle?: ReactNode
  meta?: ReactNode
  capture: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** Вміст займає всю висоту без прокрутки сторінки (Блокнот) */
  fill?: boolean
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex w-full max-w-[800px] flex-col gap-5 px-8 pt-5 pb-4">
        <PageHeader title={title} subtitle={subtitle} meta={meta} />
        {capture}
      </div>
      {fill ? (
        <div className="flex min-h-0 flex-1 px-5 pb-5">{children}</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex w-full max-w-[800px] flex-col gap-6 px-5 pt-1 pb-10">{children}</div>
        </div>
      )}
      {footer && <div className="w-full max-w-[800px] px-5 pb-5">{footer}</div>}
    </div>
  )
}
