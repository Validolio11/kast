// Візуальний аудит Kast: обходить усі екрани в трьох розмірах вікна, знімає скріншоти й шукає вади,
// які можна виміряти. Потрібен запущений dev: KAST_CDP=9333 pnpm dev
//   node scripts/design-audit.mjs [outDir]   → exit 1, якщо є порушення
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.argv[2] ?? 'out/design-audit'
const SIZES = [
  [760, 520],
  [1280, 800],
  [1920, 1080],
  [2560, 1440],
]
mkdirSync(OUT, { recursive: true })

const pages = await (await fetch('http://127.0.0.1:9333/json')).json()
const page = pages.find((p) => p.url.includes('index.html'))
if (!page) throw new Error('Kast dev window not found on CDP port 9333')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let seq = 0
const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq
    const on = (e) => {
      const m = JSON.parse(e.data)
      if (m.id !== id) return
      ws.removeEventListener('message', on)
      m.error ? reject(new Error(m.error.message)) : resolve(m.result)
    }
    ws.addEventListener('message', on)
    ws.send(JSON.stringify({ id, method, params }))
  })
const evaluate = async (expr) => {
  const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
  return r.result.value
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const VK = { Tab: 9, Escape: 27, ',': 188 }
const key = async (k, mods = 0) => {
  const base = { key: k, code: k.length > 1 ? k : undefined, modifiers: mods, windowsVirtualKeyCode: VK[k] ?? k.toUpperCase().charCodeAt(0) }
  await call('Input.dispatchKeyEvent', { type: 'keyDown', ...base })
  await call('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
}
const CTRL = 2
const closeAll = async () => {
  for (let i = 0; i < 3; i++) {
    await key('Escape')
    await wait(120)
  }
}

// Екрани: як відкрити кожен
const SCREENS = {
  today: () => key('1', CTRL),
  inbox: () => key('2', CTRL),
  done: () => key('3', CTRL),
  notebook: () => key('4', CTRL),
  note: async () => {
    await key('4', CTRL)
    await wait(500)
    // нотатка з кількома сторінками — щоб перевірити й смужку сторінок; інакше перша
    await evaluate(`(() => { const all = [...document.querySelectorAll('.notebook-list button')]; (all.find((b) => b.textContent.includes('зустрічі')) ?? all[0])?.click() })()`)
  },
  settings: () => key(',', CTRL),
  switcher: () => key('p', CTRL),
  noteMenu: async () => {
    await key('4', CTRL)
    await wait(500)
    await evaluate(`document.querySelector('.notebook-list button')?.click()`)
    await wait(300)
    await evaluate(`document.querySelector('[aria-label="Дії з нотаткою"]')?.click()`)
  },
  focus: async () => {
    await key('1', CTRL)
    await wait(500)
    await evaluate(`document.querySelector('.pulse-row[role=button]')?.click()`)
  },
  menu: async () => {
    await key('1', CTRL)
    await wait(500)
    await evaluate(
      `(() => { const r = document.querySelector('.pulse-row'); if (!r) return; const b = r.getBoundingClientRect(); r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 })) })()`,
    )
  },
}

// Перевірки всередині сторінки. Повертає список порушень.
const CHECKS = String.raw`(() => {
  const out = []
  const W = innerWidth, H = innerHeight
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n)
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false
    }
    // поза видимою частиною скрол-контейнера — не на екрані
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n)
      if (/(auto|scroll|hidden|clip)/.test(s.overflowX + s.overflowY)) {
        const p = n.getBoundingClientRect()
        if (r.bottom <= p.top || r.top >= p.bottom || r.right <= p.left || r.left >= p.right) return false
      }
    }
    if (r.bottom <= 0 || r.top >= H) return false
    // перекритий меню, діалогом чи навігацією — користувач його зараз не бачить
    const x = Math.min(Math.max(r.left + r.width / 2, 0), W - 1), y = Math.min(Math.max(r.top + r.height / 2, 0), H - 1)
    const top = document.elementFromPoint(x, y)
    return !!top && (el.contains(top) || top.contains(el))
  }
  const name = (el) => {
    const t = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)
    const c = typeof el.className === 'string' ? el.className.split(' ').filter((x) => x && !/[:\[\]/]/.test(x)).slice(0, 2).join('.') : ''
    return el.tagName.toLowerCase() + (c ? '.' + c : '') + (t ? ' "' + t + '"' : '')
  }
  const add = (rule, el, detail) => out.push({ rule, el: name(el), detail })

  // 1. Горизонтальне переповнення
  const se = document.scrollingElement
  if (se.scrollWidth > W + 1) out.push({ rule: 'page-overflow-x', el: 'document', detail: se.scrollWidth + ' > ' + W })
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('svg') && el.tagName !== 'svg') continue
    const r = el.getBoundingClientRect()
    if (r.width < 1 || (r.right <= W + 1 && r.left >= -1)) continue
    if (!visible(el)) continue
    let clipped = false
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n)
      if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { const p = n.getBoundingClientRect(); if (p.right <= W + 1 && p.left >= -1) clipped = true; break }
    }
    if (!clipped) add('off-screen-x', el, Math.round(r.left) + '..' + Math.round(r.right) + ' of ' + W)
  }

  // 2. Обрізаний текст без трьох крапок
  for (const el of document.querySelectorAll('body *')) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
    if (el.isContentEditable || el.closest('[contenteditable=true]')) continue
    const s = getComputedStyle(el)
    if (!/(hidden|clip)/.test(s.overflowX) || s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none') continue
    if (el.scrollWidth > el.clientWidth + 1 && visible(el)) add('text-clipped', el, el.scrollWidth + ' > ' + el.clientWidth)
  }

  // 3. Елементи керування: розмір, накладання, центр іконки, тривалість переходів
  const ctl = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), textarea, select, [role=button], [role=tab], [role=menuitem], [role=switch], [role=checkbox], [role=option], [role=radio]')]
    .filter((el) => !el.isContentEditable && visible(el) && !el.closest('[aria-hidden=true]'))
  for (const el of ctl) {
    const r = el.getBoundingClientRect()
    if (Math.min(r.width, r.height) < 24) add('target-small', el, Math.round(r.width) + 'x' + Math.round(r.height))
    const s = getComputedStyle(el)
    const longest = Math.max(...s.transitionDuration.split(',').map((d) => parseFloat(d) * (d.includes('ms') ? 1 : 1000)))
    if (longest > 400) add('transition-slow', el, longest + 'ms')
    const svgs = el.querySelectorAll('svg')
    if (svgs.length === 1 && !el.textContent.trim() && Math.abs(r.width - r.height) < 2 && r.width >= 24) {
      const shapes = svgs[0].querySelectorAll('path, circle, rect, line, polyline, polygon, ellipse')
      let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity
      for (const p of shapes) { const b = p.getBoundingClientRect(); if (!b.width && !b.height) continue; L = Math.min(L, b.left); T = Math.min(T, b.top); R = Math.max(R, b.right); B = Math.max(B, b.bottom) }
      if (L < Infinity) {
        let mx = (L + R) / 2, my = (T + B) / 2
        // одиночний трикутник (play) центрують оптично — за центром ваги, не за рамкою
        if (shapes.length === 1 && shapes[0].tagName === 'polygon') {
          const m = shapes[0].getScreenCTM(), pts = [...shapes[0].points].slice(0, -1)
          const ps = (pts.length ? pts : [...shapes[0].points]).map((p) => new DOMPoint(p.x, p.y).matrixTransform(m))
          mx = ps.reduce((a, p) => a + p.x, 0) / ps.length
          my = ps.reduce((a, p) => a + p.y, 0) / ps.length
        }
        const dx = mx - (r.left + r.right) / 2, dy = my - (r.top + r.bottom) / 2
        if (Math.hypot(dx, dy) > 1.01) add('icon-off-centre', el, 'dx ' + dx.toFixed(1) + ' dy ' + dy.toFixed(1))
      }
    }
  }
  for (let i = 0; i < ctl.length; i++)
    for (let j = i + 1; j < ctl.length; j++) {
      const a = ctl[i], b = ctl[j]
      if (a.contains(b) || b.contains(a)) continue
      // меню, діалог чи закріплена навігація лежать над вмістом — це шар, а не зіткнення
      const layer = (el) => { for (let n = el; n; n = n.parentElement) if (getComputedStyle(n).position === 'fixed') return n; return null }
      if (layer(a) !== layer(b)) continue
      const p = a.getBoundingClientRect(), q = b.getBoundingClientRect()
      const w = Math.min(p.right, q.right) - Math.max(p.left, q.left), h = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top)
      if (w > 2 && h > 2) add('targets-overlap', a, 'with ' + name(b) + ' ' + Math.round(w) + 'x' + Math.round(h))
    }

  // 4. Контраст тексту (WCAG AA): 4.5, великий текст 3
  const cx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  const rgb = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255] }
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const mix = (top, bot) => { const a = top[3] ?? 1; return [0, 1, 2].map((i) => top[i] * a + bot[i] * (1 - a)).concat(1) }
  for (const el of document.querySelectorAll('body *')) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
    if (el.closest('[disabled],[aria-disabled=true],svg') || !visible(el)) continue
    const s = getComputedStyle(el)
    const layers = []
    let opacity = 1, skip = false
    const er = el.getBoundingClientRect(), cx = er.left + er.width / 2, cy = er.top + er.height / 2
    for (let n = el; n; n = n.parentElement) {
      const ns = getComputedStyle(n)
      opacity *= Number(ns.opacity)
      // підкладка-сусід під текстом (рухома пігулка: absolute, z-index < 0) — це теж фон
      for (const u of n.children) {
        if (u.contains(el)) continue
        const us = getComputedStyle(u)
        if (us.position !== 'absolute' || !(parseInt(us.zIndex) < 0)) continue
        const ur = u.getBoundingClientRect()
        const uc = rgb(us.backgroundColor)
        if (cx >= ur.left && cx <= ur.right && cy >= ur.top && cy <= ur.bottom && Number(us.opacity) > 0 && uc[3] > 0) layers.push(uc)
      }
      if (layers.length && layers[layers.length - 1][3] >= 1) break
      if (ns.backgroundImage !== 'none' && !ns.backgroundImage.startsWith('url')) { skip = true; break }
      const c = rgb(ns.backgroundColor)
      if ((c[3] ?? 1) > 0) { layers.push(c); if ((c[3] ?? 1) >= 1) break }
    }
    if (skip) continue
    const bg = layers.reduceRight((acc, c) => mix(c, acc), [9, 10, 10, 1])
    let fg = rgb(s.color)
    fg = mix([fg[0], fg[1], fg[2], (fg[3] ?? 1) * opacity], bg)
    const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
    const size = parseFloat(s.fontSize), big = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700)
    if (ratio < (big ? 3 : 4.5)) add('contrast', el, ratio.toFixed(2) + ' (' + s.color + ' on rgb(' + bg.slice(0, 3).map(Math.round) + '))')
  }
  // 5. Випадкова прокрутка: контейнер переповнений на 1–12 px — майже завжди помилка розкладки
  for (const el of document.querySelectorAll('body *')) {
    if (/^(TEXTAREA|INPUT)$/.test(el.tagName)) continue
    const s = getComputedStyle(el)
    const dx = /(auto|scroll)/.test(s.overflowX) ? el.scrollWidth - el.clientWidth : 0
    const dy = /(auto|scroll)/.test(s.overflowY) ? el.scrollHeight - el.clientHeight : 0
    if (((dx > 0 && dx <= 12) || (dy > 0 && dy <= 12)) && visible(el)) add('accidental-scroll', el, 'x+' + dx + ' y+' + dy)
  }

  // Підказки для перевірки наведенням (у Node): позиція й мітка
  const tips = [...document.querySelectorAll('[data-tip]')].filter(visible).map((el, i) => {
    el.dataset.auditTip = i
    const r = el.getBoundingClientRect()
    return { i, x: r.left + r.width / 2, y: r.top + r.height / 2, el: name(el) }
  })
  return { out, tips }
})()`

// Розміри прокрутки всіх контейнерів навколо підказки (і сторінки) — до й після наведення
const SCROLLERS = (i) => `(() => {
  const el = document.querySelector('[data-audit-tip="${i}"]')
  if (!el) return null
  const res = [[document.scrollingElement.scrollWidth, document.scrollingElement.scrollHeight]]
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    const s = getComputedStyle(n)
    if (/(auto|scroll|hidden)/.test(s.overflowX + s.overflowY)) res.push([n.scrollWidth, n.scrollHeight])
  }
  return res
})()`

// Фокус з клавіатури: елемент на шляху Tab має видимо змінитися
const FOCUS = String.raw`(() => {
  const el = document.activeElement
  if (!el || el === document.body) return null
  // показник фокусу може бути й на контейнері (focus-within) — дивимось на елемент і три рівні вгору
  const chain = [el, el.parentElement, el.parentElement?.parentElement, el.parentElement?.parentElement?.parentElement].filter(Boolean)
  const pick = () => chain.map((n) => { const s = getComputedStyle(n); return [s.outlineStyle + s.outlineWidth + s.outlineColor, s.boxShadow, s.backgroundColor, s.borderColor, s.color].join('|') }).join('#')
  const focused = pick()
  el.blur()
  const blurred = pick()
  el.focus()
  const t = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)
  return { same: focused === blurred, el: el.tagName.toLowerCase() + (t ? ' "' + t + '"' : '') }
})()`

const report = []
await call('Page.enable')
// Згорнуте вікно не малює кадрів — знімок чекав би вічно. Краще одразу сказати.
if (await evaluate('document.hidden')) throw new Error('Kast dev window is minimized or hidden: restore it and run again')
for (const [w, h] of SIZES) {
  await call('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
  for (const [screen, open] of Object.entries(SCREENS)) {
    await closeAll()
    await open()
    await wait(1100) // поява Pulse — 600 мс
    const { out: issues, tips } = await evaluate(CHECKS)
    // Підказка, що розпирає прокручуваний контейнер, малює в ньому смуги прокрутки
    if (screen !== 'menu' && screen !== 'noteMenu') {
      for (const t of tips) {
        const before = await evaluate(SCROLLERS(t.i))
        await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: t.x, y: t.y })
        await wait(60)
        const after = await evaluate(SCROLLERS(t.i))
        if (before && after && JSON.stringify(before) !== JSON.stringify(after)) issues.push({ rule: 'tooltip-overflow', el: t.el, detail: JSON.stringify(before) + ' → ' + JSON.stringify(after) })
      }
      await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: h - 2 })
    }
    if (screen !== 'menu' && screen !== 'noteMenu') {
      const seen = new Set()
      for (let i = 0; i < 40; i++) {
        await key('Tab')
        await wait(40)
        const f = await evaluate(FOCUS)
        if (!f) continue
        if (seen.has(f.el)) break
        seen.add(f.el)
        if (f.same) issues.push({ rule: 'focus-invisible', el: f.el, detail: 'no visible change on focus' })
      }
    }
    const shot = await call('Page.captureScreenshot', { format: 'png' })
    const file = `${w}x${h}-${screen}.png`
    writeFileSync(join(OUT, file), Buffer.from(shot.data, 'base64'))
    report.push({ size: `${w}x${h}`, screen, shot: file, issues })
    console.log(`${w}x${h} ${screen.padEnd(9)} ${issues.length ? issues.length + ' issues' : 'ok'}`)
  }
}
await closeAll()
await call('Emulation.clearDeviceMetricsOverride')
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1))
const total = report.reduce((s, r) => s + r.issues.length, 0)
const byRule = {}
for (const r of report) for (const i of r.issues) byRule[i.rule] = (byRule[i.rule] ?? 0) + 1
console.log('total', total, byRule)
ws.close()
process.exit(total ? 1 : 0)
