import { ipcMain } from 'electron'

/** @param {ReturnType<typeof import('./receivables.service.js').createReceivablesService>} svc */
export function registerReceivablesIpc(svc) {

  function handle(channel, fn) {
    ipcMain.handle(channel, async (_e, ...args) => {
      try {
        const data = await fn(...args)
        return { ok: true, data }
      } catch (err) {
        return { ok: false, error: { code: err.code ?? 'RECV_ERROR', message: err.message } }
      }
    })
  }

  handle('receivables:list',           ()        => svc.list())
  handle('receivables:get',            (id)      => svc.getDetail(id))
  handle('receivables:summary',        ()        => svc.getSummary())
  handle('receivables:payments-today', ()        => svc.getPaymentsToday())
  handle('receivables:payments-range', (range)   => svc.getPaymentsForRange(range))
  handle('receivables:create',         (input)   => svc.create(input))
  handle('receivables:apply-payment',  (input)   => svc.applyPayment(input))
  handle('receivables:cancel',         (id)      => svc.cancel(id))
  handle('receivables:by-customer',    (id)      => svc.byCustomer(id))
}
