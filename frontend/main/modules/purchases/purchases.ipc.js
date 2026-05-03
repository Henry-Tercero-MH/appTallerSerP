import { ipcMain } from 'electron'
import { wrap } from '../../ipc/response.js'

/** @param {ReturnType<typeof import('./purchases.service.js').createPurchasesService>} service */
export function registerPurchasesIpc(service) {
  // suppliers
  ipcMain.handle('suppliers:list',        wrap(() => service.listSuppliers()))
  ipcMain.handle('suppliers:get',         wrap((_e, id) => service.getSupplier(id)))
  ipcMain.handle('suppliers:create',      wrap((_e, input, role) => service.createSupplier(input, role)))
  ipcMain.handle('suppliers:update',      wrap((_e, id, input, role) => service.updateSupplier(id, input, role)))
  ipcMain.handle('suppliers:set-active',  wrap((_e, id, active, role) => service.setSupplierActive(id, active, role)))

  // orders
  ipcMain.handle('purchases:list',        wrap(() => service.listOrders()))
  ipcMain.handle('purchases:get',         wrap((_e, id) => service.getOrder(id)))
  ipcMain.handle('purchases:create',      wrap((_e, input) => service.createOrder(input)))
  ipcMain.handle('purchases:mark-sent',   wrap((_e, id, role) => service.markSent(id, role)))
  ipcMain.handle('purchases:price-variations', wrap((_e, input) => service.priceVariations(input)))
  ipcMain.handle('purchases:receive',          wrap((_e, input) => service.receiveOrder(input)))
  ipcMain.handle('purchases:cancel',      wrap((_e, id, role) => service.cancelOrder(id, role)))
}
