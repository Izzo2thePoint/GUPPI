import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('guppi', {
  platform: process.platform,
  version: process.argv.find((a) => a.startsWith('--guppi-version='))?.slice(16) ?? '2.0.0',
  auth: {
    connect: (key: string, remember: boolean) => ipcRenderer.invoke('auth:connect', key, remember),
    status: () => ipcRenderer.invoke('auth:status'),
    disconnect: (forget: boolean) => ipcRenderer.invoke('auth:disconnect', forget),
  },
  api: {
    request: (id: string, request: unknown) => ipcRenderer.invoke('api:request', id, request),
    cancel: (id: string) => ipcRenderer.invoke('api:cancel', id),
  },
  notify: (title: string, body: string) => ipcRenderer.invoke('app:notify', title, body),
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
  onMenu: (callback: (action: string) => void) => {
    const fn = (_e: unknown, action: string) => callback(action);
    ipcRenderer.on('menu', fn);
    return () => ipcRenderer.removeListener('menu', fn);
  },
});
