import _electron from 'electron'
const { ipcMain } = _electron

/** @param {ReturnType<typeof import('./returns.service.js').createReturnsService>} svc */
export function registerReturnsIpc(svc) {
  function handle(channel, fn) {
    ipcMain.handle(channel, async (_e, ...args) => {
      try   { return { ok: true,  data:  await fn(...args) } }
      catch (err) { return { ok: false, error: { code: err.code ?? 'RET_ERROR', message: err.message } } }
    })
  }

  handle('returns:list',        ()           => svc.list())
  handle('returns:list-by-sale',(saleId)     => svc.listBySale(saleId))
  handle('returns:get',         (id)         => svc.getById(id))
  handle('returns:create',      (input)      => svc.create(input))
}
