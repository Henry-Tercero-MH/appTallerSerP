import _electron from 'electron'
const { ipcMain } = _electron
import { wrap } from '../../ipc/response.js'

/**
 * @param {ReturnType<typeof import('./users.service.js').createUsersService>} service
 */
export function registerUsersIpc(service) {
  ipcMain.handle('users:login',           wrap((_e, email, password)       => service.login(email, password)))
  ipcMain.handle('users:list',            wrap(()                          => service.list()))
  ipcMain.handle('users:get-by-id',       wrap((_e, id)                   => service.getById(id)))
  ipcMain.handle('users:create',          wrap((_e, input)                 => service.create(input)))
  ipcMain.handle('users:update',          wrap((_e, id, patch)             => service.update(id, patch)))
  ipcMain.handle('users:change-password', wrap((_e, id, newPassword)       => service.changePassword(id, newPassword)))
  ipcMain.handle('users:set-active',      wrap((_e, id, active)            => service.setActive(id, active)))
  ipcMain.handle('users:update-avatar',   wrap((_e, id, avatar)            => service.updateAvatar(id, avatar)))
}
