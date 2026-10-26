import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AppInfo, KastApi, NavTarget, UpdateState } from '../shared/types'

function listen<T>(channel: string, cb: (v: T) => void) {
  const handler = (_e: IpcRendererEvent, v: T) => cb(v)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const api: KastApi = {
  info: ipcRenderer.sendSync('app:info') as AppInfo,
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
  },
  updates: {
    state: () => ipcRenderer.invoke('update:state'),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.send('update:install'),
    onState: (cb) => listen<UpdateState>('update:state', cb),
  },
  notify: (title, body, target) => ipcRenderer.send('notify', title, body, target),
  onNavigate: (cb) => listen<NavTarget>('navigate', cb),
  backup: {
    save: (json, name) => ipcRenderer.invoke('backup:save', json, name),
    open: () => ipcRenderer.invoke('backup:open'),
  },
  auth: {
    prepare: () => ipcRenderer.invoke('auth:prepare'),
    open: (url) => ipcRenderer.invoke('auth:open', url),
    cancel: () => ipcRenderer.send('auth:cancel'),
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggleMaximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximized: (cb) => listen<boolean>('window:maximized', cb),
  },
  capture: {
    hide: () => ipcRenderer.send('capture:hide'),
    onOpen: (cb) => listen<void>('capture:open', cb),
  },
}

contextBridge.exposeInMainWorld('kast', api)
