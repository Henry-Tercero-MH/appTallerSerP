import _electron from 'electron'
const { ipcMain } = _electron

/** @param {ReturnType<typeof import('./expenses.service.js').createExpensesService>} svc */
export function registerExpensesIpc(svc) {
  function handle(channel, fn) {
    ipcMain.handle(channel, async (_e, ...args) => {
      try   { return { ok: true,  data:  await fn(...args) } }
      catch (err) { return { ok: false, error: { code: err.code ?? 'EXP_ERROR', message: err.message } } }
    })
  }

  handle('expenses:list',       (opts)        => svc.list(opts))
  handle('expenses:get',        (id)          => svc.getById(id))
  handle('expenses:create',     (input)       => svc.create(input))
  handle('expenses:update',     (id, input)   => svc.update(id, input))
  handle('expenses:remove',     (id)          => svc.remove(id))
  handle('expenses:summary',    (from, to)    => svc.summary(from, to))
  handle('expenses:categories', ()            => svc.categories())
}
