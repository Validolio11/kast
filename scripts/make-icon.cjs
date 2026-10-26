// Рендерить іконку Kast (знак K з дизайн-системи) у PNG: node_modules/.bin/electron scripts/make-icon.cjs
const { app, BrowserWindow } = require('electron')
const { writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')

const SIZE = 512
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 24 24">
  <rect x="0.5" y="0.5" width="23" height="23" rx="6" fill="#f4f4f2"/>
  <g transform="translate(4.2 4.2) scale(0.65)"><path fill="#090a0a" d="M3 2h7v7h3V2h8v7l-4 4 4 4v5h-8v-7h-3v7H3z"/></g>
</svg>`

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: SIZE, height: SIZE, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } })
  await win.loadURL(`data:text/html,<style>html,body{margin:0;background:transparent}</style>${encodeURIComponent(svg)}`)
  await new Promise((r) => setTimeout(r, 300))
  const png = (await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE })).resize({ width: SIZE, height: SIZE }).toPNG()
  for (const dir of ['resources', 'build']) {
    mkdirSync(join(__dirname, '..', dir), { recursive: true })
    writeFileSync(join(__dirname, '..', dir, 'icon.png'), png)
  }
  console.log('icon written', png.length)
  app.quit()
})
