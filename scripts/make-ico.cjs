// Робить build/icon.ico з build/icon.png: node_modules/.bin/electron scripts/make-ico.cjs
// Малі розміри пишемо як BMP, і лише 256 px — як PNG. Панель задач Windows 11 не показує іконку,
// у якої малі розміри стиснуті в PNG (так їх пише electron-builder з .png), і малює порожній аркуш.
const { app, nativeImage } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const SIZES = [16, 20, 24, 32, 40, 48, 64, 72, 96, 128, 256]

/** BITMAPINFOHEADER + 32-бітні пікселі знизу вгору + маска прозорості (AND) */
function bmpEntry(img, s) {
  const raw = img.toBitmap() // BGRA, premultiplied
  const maskRow = Math.ceil(s / 32) * 4
  const head = Buffer.alloc(40)
  head.writeUInt32LE(40, 0)
  head.writeInt32LE(s, 4)
  head.writeInt32LE(s * 2, 8) // висота включає маску
  head.writeUInt16LE(1, 12)
  head.writeUInt16LE(32, 14)
  head.writeUInt32LE(s * s * 4 + maskRow * s, 20)
  const pixels = Buffer.alloc(s * s * 4)
  const mask = Buffer.alloc(maskRow * s)
  for (let y = 0; y < s; y++) {
    const src = (s - 1 - y) * s * 4
    for (let x = 0; x < s; x++) {
      const i = src + x * 4
      const a = raw[i + 3]
      const o = y * s * 4 + x * 4
      // ICO чекає звичайні (не premultiplied) кольори
      for (let c = 0; c < 3; c++) pixels[o + c] = a ? Math.min(255, Math.round((raw[i + c] * 255) / a)) : 0
      pixels[o + 3] = a
      if (a === 0) mask[y * maskRow + (x >> 3)] |= 0x80 >> (x & 7)
    }
  }
  return Buffer.concat([head, pixels, mask])
}

app.whenReady().then(() => {
  const root = join(__dirname, '..')
  const src = nativeImage.createFromBuffer(readFileSync(join(root, 'build', 'icon.png')))
  const entries = SIZES.map((s) => {
    const img = src.resize({ width: s, height: s, quality: 'best' })
    return s >= 256 ? img.toPNG() : bmpEntry(img, s)
  })
  const dir = Buffer.alloc(6 + 16 * SIZES.length)
  dir.writeUInt16LE(0, 0)
  dir.writeUInt16LE(1, 2)
  dir.writeUInt16LE(SIZES.length, 4)
  let offset = dir.length
  SIZES.forEach((s, i) => {
    const o = 6 + 16 * i
    dir.writeUInt8(s >= 256 ? 0 : s, o)
    dir.writeUInt8(s >= 256 ? 0 : s, o + 1)
    dir.writeUInt16LE(1, o + 4)
    dir.writeUInt16LE(32, o + 6)
    dir.writeUInt32LE(entries[i].length, o + 8)
    dir.writeUInt32LE(offset, o + 12)
    offset += entries[i].length
  })
  const ico = Buffer.concat([dir, ...entries])
  writeFileSync(join(root, 'build', 'icon.ico'), ico)
  console.log('icon.ico written', ico.length)
  app.quit()
})
