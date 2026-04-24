import { contextBridge, ipcRenderer } from 'electron'

/**
 * API expuesta al renderer, agrupada por dominio. Todas las llamadas devuelven
 * el envelope estandar `{ ok, data } | { ok, error: { code, message } }`.
 *
 * Seguridad: contextIsolation esta activo y nodeIntegration desactivado, por
 * lo que este es el unico puente hacia el main process. No exponer ipcRenderer
 * crudo.
 */
const api = {
  settings: {
    getAll:        ()                  => ipcRenderer.invoke('settings:get-all'),
    get:           (key)               => ipcRenderer.invoke('settings:get', key),
    set:           (key, value)        => ipcRenderer.invoke('settings:set', key, value),
    getByCategory: (category)          => ipcRenderer.invoke('settings:get-by-category', category),
  },

  products: {
    list:   ()      => ipcRenderer.invoke('products:list'),
    search: (query) => ipcRenderer.invoke('products:search', query),
  },

  sales: {
    create: (saleData) => ipcRenderer.invoke('sales:create', saleData),
  },
}

contextBridge.exposeInMainWorld('api', api)
