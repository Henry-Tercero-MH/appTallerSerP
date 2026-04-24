import { ipcMain } from 'electron'
import { wrap } from '../../ipc/response.js'

/**
 * @param {ReturnType<typeof import('./sales.service.js').createSalesService>} service
 */
export function registerSalesIpc(service) {
  ipcMain.handle('sales:create', wrap((_e, saleData) => service.create(saleData)))
}
