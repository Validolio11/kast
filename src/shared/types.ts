export interface Settings {
  hotkey: string
  /** Година, після якої Kast пропонує закрити день */
  eveningHour: number
  notifyEvening: boolean
  launchAtLogin: boolean
}

export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'dev' }
  | { kind: 'checking' }
  | { kind: 'none' }
  | { kind: 'downloading'; percent: number; version?: string }
  | { kind: 'ready'; version: string; notes?: string }
  | { kind: 'error'; message: string }

export interface AppInfo {
  version: string
  /** Зсув «зараз» для налагодження (KAST_NOW), мс */
  nowOffset: number
}

export type NavTarget = 'today' | 'notebook' | 'inbox' | 'done' | 'close-day' | 'settings'

export interface KastApi {
  info: AppInfo
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
  }
  updates: {
    state(): Promise<UpdateState>
    check(): Promise<void>
    install(): void
    onState(cb: (s: UpdateState) => void): () => void
  }
  notify(title: string, body: string, target?: NavTarget): void
  onNavigate(cb: (t: NavTarget) => void): () => void
  capture: {
    hide(): void
    onOpen(cb: () => void): () => void
  }
}
