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
    getAll:        ()             => ipcRenderer.invoke('settings:get-all'),
    get:           (key)          => ipcRenderer.invoke('settings:get', key),
    set:           (key, value)   => ipcRenderer.invoke('settings:set',    key, value),
    upsert:        (key, value)   => ipcRenderer.invoke('settings:upsert', key, value),
    getByCategory: (category)     => ipcRenderer.invoke('settings:get-by-category', category),
  },

  products: {
    list:        ()               => ipcRenderer.invoke('products:list'),
    listActive:  ()               => ipcRenderer.invoke('products:list-active'),
    search:      (query)          => ipcRenderer.invoke('products:search', query),
    getById:     (id)             => ipcRenderer.invoke('products:get-by-id', id),
    create:      (input)          => ipcRenderer.invoke('products:create', input),
    update:      (id, patch)      => ipcRenderer.invoke('products:update', id, patch),
    remove:      (id)             => ipcRenderer.invoke('products:remove', id),
    restore:     (id)             => ipcRenderer.invoke('products:restore', id),
    adjustStock: (id, type, qty)  => ipcRenderer.invoke('products:adjust-stock', id, type, qty),
  },

  customers: {
    list:       (opts)           => ipcRenderer.invoke('customers:list', opts),
    search:     (query, opts)    => ipcRenderer.invoke('customers:search', query, opts),
    getById:    (id)             => ipcRenderer.invoke('customers:get-by-id', id),
    create:     (input)          => ipcRenderer.invoke('customers:create', input),
    update:     (id, patch)      => ipcRenderer.invoke('customers:update', id, patch),
    setActive:  (id, active)     => ipcRenderer.invoke('customers:set-active', id, active),
  },

  users: {
    login:          (email, password)  => ipcRenderer.invoke('users:login', email, password),
    list:           ()                 => ipcRenderer.invoke('users:list'),
    getById:        (id)               => ipcRenderer.invoke('users:get-by-id', id),
    create:         (input)            => ipcRenderer.invoke('users:create', input),
    update:         (id, patch)        => ipcRenderer.invoke('users:update', id, patch),
    changePassword: (id, newPassword)  => ipcRenderer.invoke('users:change-password', id, newPassword),
    setActive:      (id, active)       => ipcRenderer.invoke('users:set-active', id, active),
    updateAvatar:   (id, avatar)       => ipcRenderer.invoke('users:update-avatar', id, avatar),
  },

  sales: {
    create:      (saleData) => ipcRenderer.invoke('sales:create', saleData),
    getById:     (id)       => ipcRenderer.invoke('sales:get-by-id', id),
    list:        (opts)     => ipcRenderer.invoke('sales:list', opts),
    dailyReport: ()         => ipcRenderer.invoke('sales:daily-report'),
    void:        (input)    => ipcRenderer.invoke('sales:void', input),
  },

  audit: {
    list: (opts) => ipcRenderer.invoke('audit:list', opts),
  },

  suppliers: {
    list:       ()                      => ipcRenderer.invoke('suppliers:list'),
    get:        (id)                    => ipcRenderer.invoke('suppliers:get', id),
    create:     (input, role)           => ipcRenderer.invoke('suppliers:create', input, role),
    update:     (id, input, role)       => ipcRenderer.invoke('suppliers:update', id, input, role),
    setActive:  (id, active, role)      => ipcRenderer.invoke('suppliers:set-active', id, active, role),
  },

  purchases: {
    list:       ()       => ipcRenderer.invoke('purchases:list'),
    get:        (id)     => ipcRenderer.invoke('purchases:get', id),
    create:     (input)  => ipcRenderer.invoke('purchases:create', input),
    markSent:   (id, role)   => ipcRenderer.invoke('purchases:mark-sent', id, role),
    receive:    (input)  => ipcRenderer.invoke('purchases:receive', input),
    cancel:     (id, role)   => ipcRenderer.invoke('purchases:cancel', id, role),
  },

  cash: {
    getOpen:      ()       => ipcRenderer.invoke('cash:get-open'),
    list:         ()       => ipcRenderer.invoke('cash:list'),
    getSession:   (id)     => ipcRenderer.invoke('cash:get-session', id),
    open:         (input)  => ipcRenderer.invoke('cash:open', input),
    close:        (input)  => ipcRenderer.invoke('cash:close', input),
    addMovement:  (input)  => ipcRenderer.invoke('cash:add-movement', input),
  },
}

contextBridge.exposeInMainWorld('api', api)
