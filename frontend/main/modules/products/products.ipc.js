import { ipcMain } from 'electron'
import { wrap } from '../../ipc/response.js'

/**
 * @param {ReturnType<typeof import('./products.service.js').createProductsService>} service
 */
export function registerProductsIpc(service) {
  ipcMain.handle('products:list',   wrap(()            => service.list()))
  ipcMain.handle('products:search', wrap((_e, query)   => service.search(query)))
}
