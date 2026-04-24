/**
 * Acceso puro a la tabla `settings`. Sin logica de negocio, sin cache,
 * sin conversion de tipos: solo SQL preparado.
 *
 * El service es quien serializa/deserializa `value` (TEXT) segun `type`.
 */

/**
 * @typedef {Object} SettingRow
 * @property {string} key
 * @property {string} value       Siempre TEXT; la tipificacion la hace el service.
 * @property {'string'|'number'|'boolean'|'json'} type
 * @property {string} category
 * @property {string} description
 * @property {string} updated_at
 */

/**
 * @param {import('better-sqlite3').Database} db
 */
export function createSettingsRepository(db) {
  const stmts = {
    selectAll: db.prepare('SELECT key, value, type, category, description, updated_at FROM settings'),
    selectByKey: db.prepare(
      'SELECT key, value, type, category, description, updated_at FROM settings WHERE key = ?'
    ),
    selectByCategory: db.prepare(
      'SELECT key, value, type, category, description, updated_at FROM settings WHERE category = ?'
    ),
    updateValue: db.prepare(
      `UPDATE settings
         SET value = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE key = ?`
    ),
  }

  return {
    /** @returns {SettingRow[]} */
    findAll() {
      return stmts.selectAll.all()
    },

    /**
     * @param {string} key
     * @returns {SettingRow | undefined}
     */
    findByKey(key) {
      return stmts.selectByKey.get(key)
    },

    /**
     * @param {string} category
     * @returns {SettingRow[]}
     */
    findByCategory(category) {
      return stmts.selectByCategory.all(category)
    },

    /**
     * Actualiza solo el valor (ya serializado a TEXT).
     * No inserta: la creacion de claves es responsabilidad de migraciones.
     * @param {string} key
     * @param {string} serializedValue
     * @returns {number} filas afectadas (0 si key no existe)
     */
    updateValue(key, serializedValue) {
      const info = stmts.updateValue.run(serializedValue, key)
      return info.changes
    },
  }
}
