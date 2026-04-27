import { ipcMain } from 'electron'

/** @param {ReturnType<typeof import('./inventory.service.js').createInventoryService>} svc */
export function registerInventoryIpc(svc) {
  function handle(channel, fn) {
    ipcMain.handle(channel, async (_e, ...args) => {
      try   { return { ok: true,  data:  await fn(...args) } }
      catch (err) { return { ok: false, error: { code: err.code ?? 'INV_ERROR', message: err.message } } }
    })
  }

  handle('inventory:stock',     ()      => svc.getStock())
  handle('inventory:movements', (opts)  => svc.getMovements(opts))
  handle('inventory:adjust',    (input) => svc.adjust(input))
}
