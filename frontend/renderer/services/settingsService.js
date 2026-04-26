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

/**
 * @param {string} key
 * @param {unknown} value
 * @returns {Promise<true>}
 */
export async function set(key, value) {
  const res = await window.api.settings.set(key, value)
  return unwrap('settings:set', res, z.literal(true))
}

/**
 * Como set() pero crea la clave si no existe (tipo string).
 * @param {string} key
 * @param {string} value
 * @returns {Promise<true>}
 */
export async function upsert(key, value) {
  const res = await window.api.settings.upsert(key, value)
  return unwrap('settings:upsert', res, z.literal(true))
}
