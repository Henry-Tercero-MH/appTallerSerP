/**
 * Errores tipados para la capa services. El renderer los captura para
 * mostrar toasts con mensaje estable o reaccionar por `code`.
 */

/** Error devuelto por el main via envelope { ok:false, error:{code,message} }. */
export class IpcError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'IpcError'
    this.code = code
  }
}

/** Error cuando la respuesta del main no pasa la validacion Zod del renderer. */
export class IpcValidationError extends Error {
  /**
   * @param {string} channel
   * @param {import('zod').ZodError} zodError
   */
  constructor(channel, zodError) {
    super(
      `Respuesta invalida de "${channel}": ${zodError.issues
        .map((i) => `${i.path.join('.')} ${i.message}`)
        .join('; ')}`
    )
    this.name = 'IpcValidationError'
    this.code = 'IPC_INVALID_RESPONSE'
    this.channel = channel
    this.zodError = zodError
  }
}
