/*
 * Пружинний рух Pulse — та сама техніка, що в бібліотеці DesignBookmark Motion:
 * кожне значення тягнеться до цілі пружиною (жорсткість k, згасання c), без бібліотек.
 * Якщо в системі ввімкнено «Зменшити рух» — усе стає на місце одразу.
 */
import { useLayoutEffect, useRef } from 'react'
import { cn } from './utils'

interface Spring {
  x: number
  v: number
  t: number
  k: number
  c: number
}
const spring = (x: number): Spring => ({ x, v: 0, t: x, k: 300, c: 22 })
const tune = (s: Spring, k: number, c: number) => {
  s.k = k
  s.c = c
}
// Малі кроки: жорстка пружина (k=620) стабільна навіть на повільному кадрі
const step = (s: Spring, dt: number) => {
  for (let left = dt; left > 0; left -= 1 / 240) {
    const h = Math.min(left, 1 / 240)
    s.v += (-s.k * (s.x - s.t) - s.c * s.v) * h
    s.x += s.v * h
  }
}
const settled = (s: Spring) => Math.abs(s.x - s.t) < 0.1 && Math.abs(s.v) < 0.5
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/** Ведучий край — жорсткий, хвіст — м'який: пігулка тягнеться до нової цілі й підтягує хвіст */
const LEAD = [620, 40] as const
const TRAIL = [170, 19] as const

/** Позиція елемента відносно host (сума offsetLeft/Top) — не залежить від масштабу анімації появи */
function offsetIn(el: HTMLElement, host: HTMLElement) {
  let x = 0
  let y = 0
  for (let n: HTMLElement | null = el; n && n !== host; n = n.offsetParent as HTMLElement | null) {
    x += n.offsetLeft
    y += n.offsetTop
  }
  return { L: x, T: y, R: x + el.offsetWidth, B: y + el.offsetHeight }
}

/**
 * Підсвітка, що перебігає між пунктами (вкладки, перемикачі, рядки списку).
 * host — контейнер пунктів (має бути positioned); selector — вибраний пункт; key — що змінює вибір.
 * Пігулка лежить під текстом: host отримує isolate, пігулка — z-index −1.
 */
export function useSlidingPill<T extends HTMLElement>(selector: string, key: unknown, className: string) {
  const host = useRef<T>(null)
  const pill = useRef<HTMLSpanElement>(null)
  const st = useRef<{ L: Spring; T: Spring; R: Spring; B: Spring; raf: number; last: number } | null>(null)

  useLayoutEffect(() => {
    const h = host.current
    const p = pill.current
    if (!h || !p) return
    const render = () => {
      const s = st.current!
      p.style.transform = `translate(${s.L.x.toFixed(2)}px, ${s.T.x.toFixed(2)}px)`
      p.style.width = `${Math.max(0, s.R.x - s.L.x).toFixed(2)}px`
      p.style.height = `${Math.max(0, s.B.x - s.T.x).toFixed(2)}px`
    }
    const loop = (now: number) => {
      const s = st.current!
      const dt = Math.min(0.05, (now - s.last) / 1000)
      s.last = now
      const all = [s.L, s.T, s.R, s.B]
      all.forEach((x) => step(x, dt))
      if (all.every(settled)) {
        for (const x of all) {
          x.x = x.t
          x.v = 0
        }
        s.raf = 0
      } else s.raf = requestAnimationFrame(loop)
      render()
    }
    const retarget = (snap: boolean) => {
      const el = h.querySelector<HTMLElement>(selector)
      if (!el) {
        p.style.opacity = '0'
        return
      }
      const t = offsetIn(el, h)
      p.style.opacity = '1'
      p.style.borderRadius = getComputedStyle(el).borderRadius
      let s = st.current
      if (!s) s = st.current = { L: spring(t.L), T: spring(t.T), R: spring(t.R), B: spring(t.B), raf: 0, last: 0 }
      const right = t.L >= s.L.t
      const down = t.T >= s.T.t
      tune(right ? s.R : s.L, ...LEAD)
      tune(right ? s.L : s.R, ...TRAIL)
      tune(down ? s.B : s.T, ...LEAD)
      tune(down ? s.T : s.B, ...TRAIL)
      s.L.t = t.L
      s.T.t = t.T
      s.R.t = t.R
      s.B.t = t.B
      if (snap || reducedMotion()) {
        for (const x of [s.L, s.T, s.R, s.B]) {
          x.x = x.t
          x.v = 0
        }
        render()
        return
      }
      if (!s.raf) {
        s.last = performance.now()
        s.raf = requestAnimationFrame(loop)
      }
    }
    retarget(!st.current)
    // Зміна розміру (вікно, лічильник у пункті) — без анімації, просто на нове місце
    const el = h.querySelector<HTMLElement>(selector)
    const size = () => `${h.offsetWidth}x${h.offsetHeight}:${el?.offsetWidth}x${el?.offsetHeight}`
    let was = size()
    // Перший виклик спостерігача приходить одразу — його пропускаємо, інакше він обірвав би анімацію
    const ro = new ResizeObserver(() => {
      if (size() === was) return
      was = size()
      retarget(true)
    })
    ro.observe(h)
    if (el) ro.observe(el)
    return () => ro.disconnect()
  }, [key, selector])

  useLayoutEffect(() => () => cancelAnimationFrame(st.current?.raf ?? 0), [])

  return {
    host,
    pill: <span ref={pill} aria-hidden className={cn('sliding-pill pointer-events-none absolute top-0 left-0 -z-[1] opacity-0', className)} />,
  }
}
