import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.kast.app',
  appName: 'Kast',
  webDir: 'out/mobile',
  backgroundColor: '#090a0a',
  android: {
    backgroundColor: '#090a0a',
    allowMixedContent: false,
  },
  server: { androidScheme: 'https' },
  plugins: {
    SystemBars: { insetsHandling: 'css', style: 'DARK' },
  },
}

export default config
