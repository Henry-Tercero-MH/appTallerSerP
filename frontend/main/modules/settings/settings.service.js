import { SettingNotFoundError, SettingValidationError } from './errors.js'

/**
 * Capa de negocio de settings:
 *  - Serializa/deserializa `value` segun el `type` declarado.
 *  - Valida tipos en `set` antes de tocar la DB.
 *  - Mantiene un cache en memoria; las lecturas NO golpean SQLite.
 *  - Invalida su propia entrada en cada `set` exitoso.
 *
 * El cache asume que esta app es el unico escritor de la DB (caso Electron
 * single-process para escritura). Si en el futuro hubiera escritores externos
 * habra que exponer un `reload()` y disparar invalidaciones.
 */

/**
 * @typedef {import('./settings.repository.js').SettingRow} SettingRow
 */

/**
 * @typedef {Object} TypedSetting
 * @property {string} key
 * @property {string|number|boolean|object|null} value
 * @property {'string'|'number'|'boolean'|'json'} type
 * @property {string} category
 * @property {string} description
 * @property {string} updated_at
 */

/**
 * @param {SettingRow} row
 * @returns {TypedSetting}
 */
function deserialize(row) {
  return { ...row, value: parseValue(row.value, row.type, row.key) }
}

/**
 * @param {string} raw
 * @param {SettingRow['type']} type
 * @param {string} key
 */
function parseValue(raw, type, key) {
  switch (type) {
    case 'string':
      return raw
    case 'number': {
      const n = Number(raw)
      if (!Number.isFinite(n)) {
        throw new SettingValidationError(key, 'number', raw)
      }
      return n
    }
    case 'boolean':
      return raw === '1' || raw === 'true'
    case 'json':
      try {
        return JSON.parse(raw)
      } catch {
        throw new SettingValidationError(key, 'json', raw)
      }
    default:
      throw new SettingValidationError(key, type, raw)
  }
}

/**
 * @param {unknown} value
 * @param {SettingRow['type']} type
 * @param {string} key
 * @returns {string} valor listo para persistir como TEXT
 */
function serialize(value, type, key) {
  switch (type) {
    case 'string':
      if (typeof value !== 'string') throw new SettingValidationError(key, 'string', value)
      return value
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new SettingValidationError(key, 'number', value)
      }
      return String(value)
    case 'boolean':
      if (typeof value !== 'boolean') throw new SettingValidationError(key, 'boolean', value)
      return value ? '1' : '0'
    case 'json':
      try {
        return JSON.stringify(value)
      } catch {
        throw new SettingValidationError(key, 'json', value)
      }
    default:
      throw new SettingValidationError(key, type, value)
  }
}

/**
 * @param {ReturnType<typeof import('./settings.repository.js').createSettingsRepository>} repo
 */
export function createSettingsService(repo) {
  /** @type {Map<string, TypedSetting>} */
  const cache = new Map()
  let initialized = false

  /** Carga la tabla completa al cache. Sincrono (better-sqlite3). */
  function init() {
    cache.clear()
    for (const row of repo.findAll()) {
      cache.set(row.key, deserialize(row))
    }
    initialized = true
  }

  function ensureInit() {
    if (!initialized) init()
  }

  return {
    init,

    /**
     * @param {string} key
     * @returns {TypedSetting['value']}
     * @throws {SettingNotFoundError}
     */
    get(key) {
      ensureInit()
      const entry = cache.get(key)
      if (!entry) throw new SettingNotFoundError(key)
      return entry.value
    },

    /**
     * Devuelve settings agrupados por `category`:
     *   { tax: { tax_rate: 0.12, ... }, business: { ... }, ... }
     * @returns {Record<string, Record<string, TypedSetting['value']>>}
     */
    getAll() {
      ensureInit()
      /** @type {Record<string, Record<string, TypedSetting['value']>>} */
      const grouped = {}
      for (const entry of cache.values()) {
        if (!grouped[entry.category]) grouped[entry.category] = {}
        grouped[entry.category][entry.key] = entry.value
      }
      return grouped
    },

    /**
     * @param {string} category
     * @returns {Record<string, TypedSetting['value']>}
     */
    getByCategory(category) {
      ensureInit()
      /** @type {Record<string, TypedSetting['value']>} */
      const out = {}
      for (const entry of cache.values()) {
        if (entry.category === category) out[entry.key] = entry.value
      }
      return out
    },

    /**
     * Valida tipo, persiste y actualiza el cache. Si la key no existe en DB
     * lanza SettingNotFoundError (no creamos claves: eso va por migraciones).
     *
     * @param {string} key
     * @param {unknown} value
     * @throws {SettingNotFoundError | SettingValidationError}
     */
    set(key, value) {
      ensureInit()
      const entry = cache.get(key)
      if (!entry) throw new SettingNotFoundError(key)

      const serialized = serialize(value, entry.type, key)
      const changes = repo.updateValue(key, serialized)
      if (changes === 0) {
        cache.delete(key)
        throw new SettingNotFoundError(key)
      }

      const fresh = repo.findByKey(key)
      cache.set(key, deserialize(fresh))
    },
  }
}
