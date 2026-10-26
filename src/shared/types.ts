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

/** Результат входу через Google: одноразовий код або причина невдачі */
export type OAuthResult = { code: string; error?: undefined } | { code?: undefined; error: string }

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
  backup: {
    /** Вікно «Зберегти як…»; повертає шлях або null, якщо скасовано */
    save(json: string, name: string): Promise<string | null>
    /** Вікно «Відкрити…»; повертає текст файлу або null */
    open(): Promise<string | null>
  }
  auth: {
    /** Локальна адреса, куди Google поверне після входу */
    prepare(): Promise<string>
    /** Відкриває сторінку входу в браузері й чекає повернення */
    open(url: string): Promise<OAuthResult>
    cancel(): void
  }
  window: {
    minimize(): void
    toggleMaximize(): void
    /** Ховає у трей (гаряча клавіша лишається активною) */
    close(): void
    isMaximized(): Promise<boolean>
    onMaximized(cb: (v: boolean) => void): () => void
  }
  capture: {
    hide(): void
    onOpen(cb: () => void): () => void
  }
}
