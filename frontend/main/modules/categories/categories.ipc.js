import _electron from 'electron'
const { ipcMain } = _electron
import { wrap } from '../../ipc/response.js'

/**
 * @param {ReturnType<typeof import('./categories.service.js').createCategoriesService>} service
 */
export function registerCategoriesIpc(service) {
  ipcMain.handle('categories:list',        wrap(()                  => service.list()))
  ipcMain.handle('categories:list-active', wrap(()                  => service.listActive()))
  ipcMain.handle('categories:create',      wrap((_e, name)          => service.create(name)))
  ipcMain.handle('categories:update',      wrap((_e, id, name)      => service.update(id, name)))
  ipcMain.handle('categories:set-active',  wrap((_e, id, active)    => service.setActive(id, active)))
}
