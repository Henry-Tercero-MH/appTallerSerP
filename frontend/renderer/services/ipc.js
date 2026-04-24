import { IpcError, IpcValidationError } from './apiError.js'

/**
 * Unwrap del envelope acordado con el main (Prompt 1):
 *   exito:  { ok: true,  data }
 *   error:  { ok: false, error: { code, message } }
 *
 * Valida `data` con el schema Zod provisto y lanza error tipado en fallo.
 *
 * @template T
 * @param {string} channel        Nombre del canal IPC (solo para mensajes de error).
 * @param {unknown} envelope      Respuesta cruda de window.api.*.
 * @param {import('zod').ZodType<T>} schema
 * @returns {T}
 */
export function unwrap(channel, envelope, schema) {
  if (!envelope || typeof envelope !== 'object') {
    throw new IpcError('IPC_MALFORMED', `"${channel}" no devolvio un envelope valido`)
  }

  const e = /** @type {{ ok: boolean, data?: unknown, error?: { code: string, message: string } }} */ (envelope)

  if (!e.ok) {
    const code = e.error?.code ?? 'UNKNOWN'
    const message = e.error?.message ?? `Error en ${channel}`
    throw new IpcError(code, message)
  }

  const parsed = schema.safeParse(e.data)
  if (!parsed.success) {
    throw new IpcValidationError(channel, parsed.error)
  }
  return parsed.data
}
