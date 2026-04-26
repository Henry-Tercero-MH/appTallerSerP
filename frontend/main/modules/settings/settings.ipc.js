import { ipcMain } from 'electron'
import { wrap } from '../../ipc/response.js'

/**
 * Registra los handlers IPC del dominio settings.
 * Los canales siguen la convencion `settings:<accion>`.
 *
 * @param {ReturnType<typeof import('./settings.service.js').createSettingsService>} service
 */
export function registerSettingsIpc(service) {
  ipcMain.handle('settings:get-all',         wrap(()                  => service.getAll()))
  ipcMain.handle('settings:get',             wrap((_e, key)           => service.get(key)))
  ipcMain.handle('settings:get-by-category', wrap((_e, category)      => service.getByCategory(category)))
  ipcMain.handle('settings:set',             wrap((_e, key, value)    => { service.set(key, value);    return true }))
  ipcMain.handle('settings:upsert',          wrap((_e, key, value)    => { service.upsert(key, value); return true }))
}
