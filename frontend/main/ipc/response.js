/**
 * Formato de respuesta IPC uniforme:
 *   exito:  { ok: true,  data }
 *   error:  { ok: false, error: { code, message } }
 *
 * Motivo: que el renderer reciba errores serializados tipados en vez de
 * excepciones crudas (contextBridge serializa con clone algorithm y pierde
 * prototipos, por lo que `instanceof` no funciona del otro lado). Un `code`
 * estable evita acoplarse al texto del mensaje.
 */

/**
 * @template {(...args: any[]) => any} F
 * @param {F} handler
 * @returns {(...args: Parameters<F>) => { ok: true, data: ReturnType<F> } | { ok: false, error: { code: string, message: string } }}
 */
export function wrap(handler) {
  return (...args) => {
    try {
      const data = handler(...args)
      return { ok: true, data }
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err && typeof err.code === 'string'
        ? err.code
        : 'UNEXPECTED_ERROR'
      const message = err instanceof Error ? err.message : String(err)
      if (!(err && typeof err === 'object' && 'code' in err)) {
        console.error('[ipc] unexpected error:', err)
      }
      return { ok: false, error: { code, message } }
    }
  }
}
