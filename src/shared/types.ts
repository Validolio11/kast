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

/** Завдання з Google Tasks (лише незавершені) */
export interface GTask {
  id: string
  listId: string
  /** Назва списку в Google Tasks */
  list: string
  title: string
  notes?: string
  /** Дата у форматі YYYY-MM-DD — Google зберігає завданням лише дату */
  due?: string
  /** Підзавдання іншого завдання */
  sub: boolean
}

/** Задача Kast, яку треба мати у списку «Kast» у Google */
export interface KastSyncItem {
  id: string
  title: string
  notes?: string
  /** YYYY-MM-DD для задач на сьогодні; у Вхідних дати немає */
  due?: string
  done: boolean
}

/** Зміна, зроблена в Google, яку Kast застосовує в себе */
export interface KastSyncAction {
  id: string
  done?: boolean
  title?: string
  /** Задачу видалили в Google — видалити й у Kast */
  deleted?: boolean
}

export interface GTasksStatus {
  /** У збірці є ключі клієнта Google */
  configured: boolean
  connected: boolean
  email?: string
}

export type NavTarget = 'today' | 'notebook' | 'inbox' | 'done' | 'close-day' | 'settings' | 'update'

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
  /** Google Tasks: вхід, список незавершених і позначка «виконано» */
  gtasks: {
    status(): Promise<GTasksStatus>
    connect(): Promise<GTasksStatus>
    disconnect(): Promise<GTasksStatus>
    list(): Promise<GTask[]>
    complete(listId: string, taskId: string): Promise<void>
    remove(listId: string, taskId: string): Promise<void>
    /** Звести задачі Kast зі списком «Kast» у Google; повертає зміни з Google */
    syncKast(items: KastSyncItem[]): Promise<KastSyncAction[]>
  }
  window: {
    minimize(): void
    toggleMaximize(): void
    /** Ховає у трей (гаряча клавіша лишається активною) */
    close(): void
    isMaximized(): Promise<boolean>
    onMaximized(cb: (v: boolean) => void): () => void
  }
  /** Окреме вікно плеєра (для Twitch, який не вбудовується в app://) */
  video: {
    window(url: string): void
  }
  capture: {
    hide(): void
    onOpen(cb: () => void): () => void
  }
}
