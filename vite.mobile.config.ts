import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: resolve('src/renderer'),
  base: './',
  envDir: resolve('.'),
  envPrefix: 'RENDERER_VITE_',
  resolve: { alias: { '@': resolve('src/renderer/src') } },
  plugins: [react(), tailwindcss()],
  define: { __KAST_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.4') },
  build: {
    outDir: resolve('out/mobile'),
    emptyOutDir: true,
    target: 'chrome107',
  },
})
