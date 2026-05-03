import _electron from 'electron'
const { ipcMain } = _electron
import { wrap } from '../../ipc/response.js'

/**
 * @param {ReturnType<typeof import('./products.service.js').createProductsService>} service
 */
export function registerProductsIpc(service) {
  // Lectura
  ipcMain.handle('products:list',        wrap(()           => service.list()))
  ipcMain.handle('products:list-active', wrap(()           => service.listActive()))
  ipcMain.handle('products:search',      wrap((_e, query)  => service.search(query)))
  ipcMain.handle('products:get-by-id',   wrap((_e, id)     => service.getById(id)))

  // Escritura
  ipcMain.handle('products:create',       wrap((_e, input)          => service.create(input)))
  ipcMain.handle('products:update',       wrap((_e, id, patch)      => service.update(id, patch)))
  ipcMain.handle('products:remove',       wrap((_e, id)             => service.remove(id)))
  ipcMain.handle('products:restore',      wrap((_e, id)             => service.restore(id)))
  ipcMain.handle('products:adjust-stock', wrap((_e, id, type, qty)  => service.adjustStock(id, type, qty)))
}
