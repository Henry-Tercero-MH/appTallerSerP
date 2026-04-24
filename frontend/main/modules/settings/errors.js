/**
 * Error base del dominio settings. Permite que la capa IPC lo serialice
 * con un `code` estable y los renderers reaccionen programaticamente.
 */
export class SettingError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'SettingError'
    this.code = code
  }
}

/** Clave inexistente al hacer get/set. */
export class SettingNotFoundError extends SettingError {
  /** @param {string} key */
  constructor(key) {
    super('SETTING_NOT_FOUND', `Setting no encontrado: "${key}"`)
    this.name = 'SettingNotFoundError'
    this.key = key
  }
}

/** Valor incompatible con el `type` declarado en la tabla. */
export class SettingValidationError extends SettingError {
  /**
   * @param {string} key
   * @param {string} expectedType
   * @param {unknown} receivedValue
   */
  constructor(key, expectedType, receivedValue) {
    super(
      'SETTING_INVALID_VALUE',
      `Setting "${key}" requiere tipo "${expectedType}" pero recibio ${typeof receivedValue} (${String(
        receivedValue
      )})`
    )
    this.name = 'SettingValidationError'
    this.key = key
    this.expectedType = expectedType
  }
}
