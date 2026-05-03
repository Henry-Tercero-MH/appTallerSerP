import _electron from 'electron'
const { ipcMain } = _electron

/** @param {ReturnType<typeof import('./quotes.service.js').createQuotesService>} svc */
export function registerQuotesIpc(svc) {

  function handle(channel, fn) {
    ipcMain.handle(channel, async (_e, ...args) => {
      try {
        const data = await fn(...args)
        return { ok: true, data }
      } catch (err) {
        return { ok: false, error: { code: err.code ?? 'QUOTE_ERROR', message: err.message } }
      }
    })
  }

  handle('quotes:list',           ()         => svc.list())
  handle('quotes:get',            (id)       => svc.getDetail(id))
  handle('quotes:create',         (input)    => svc.create(input))
  handle('quotes:update',         (id, input)=> svc.update(id, input))
  handle('quotes:mark-sent',      (id)       => svc.markSent(id))
  handle('quotes:accept',         (id)       => svc.accept(id))
  handle('quotes:reject',         (id)       => svc.reject(id))
  handle('quotes:convert',            (input) => svc.convertToSale(input))
  handle('quotes:convert-receivable', (input) => svc.convertToReceivable(input))
}
