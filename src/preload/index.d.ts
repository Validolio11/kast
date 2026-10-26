import type { KastApi } from '../shared/types'

declare global {
  interface Window {
    kast: KastApi
  }
}
