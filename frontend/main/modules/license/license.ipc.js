import { wrap } from '../../ipc/response.js'

/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {ReturnType<typeof import('./license.service.js').createLicenseService>} svc
 */
export function registerLicenseIpc(ipcMain, svc) {
  ipcMain.handle('license:status',   wrap(() => ({ activated: svc.isActivated() })))
  ipcMain.handle('license:activate', wrap((_, token) => svc.activate(token)))
}
