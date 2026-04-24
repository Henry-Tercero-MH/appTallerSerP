/**
 * Errores del dominio customers. Siguen el mismo patron que settings/errors.js:
 * subclase de Error con `code` estable para que el renderer reaccione
 * programaticamente tras structuredClone (que pierde prototipos).
 */

export class CustomerError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'CustomerError'
    this.code = code
  }
}

export class CustomerNotFoundError extends CustomerError {
  /** @param {number} id */
  constructor(id) {
    super('CUSTOMER_NOT_FOUND', `Cliente no encontrado: #${id}`)
    this.id = id
  }
}

export class CustomerValidationError extends CustomerError {
  /**
   * @param {string} field
   * @param {string} message
   */
  constructor(field, message) {
    super('CUSTOMER_INVALID', `${field}: ${message}`)
    this.field = field
  }
}
