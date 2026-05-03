import _electron from 'electron'
const { ipcMain } = _electron
import { wrap } from '../../ipc/response.js'

/**
 * @param {ReturnType<typeof import('./audit.service.js').createAuditService>} service
 */
export function registerAuditIpc(service) {
  ipcMain.handle('audit:list', wrap((_e, opts) => service.list(opts)))
}
