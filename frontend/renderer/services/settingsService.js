import { z } from 'zod'
import { unwrap } from './ipc.js'

/**
 * El main agrupa settings por category: { currency: { currency_code: 'GTQ', ... }, ... }
 * No rigidizamos con un schema exhaustivo: nuevas categorias/keys no deberian
 * romper el renderer. Solo validamos la forma (record-of-records).
 */
const settingsShapeSchema = z.record(z.string(), z.record(z.string(), z.unknown()))

/** @typedef {z.infer<typeof settingsShapeSchema>} SettingsByCategory */

/**
 * @returns {Promise<SettingsByCategory>}
 */
export async function getAll() {
  const res = await window.api.settings.getAll()
  return unwrap('settings:get-all', res, settingsShapeSchema)
}
