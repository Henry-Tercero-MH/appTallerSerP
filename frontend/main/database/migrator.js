import crypto from 'node:crypto'

/**
 * @typedef {Object} Migration
 * @property {string} name   Nombre del archivo (ej. "001_init.sql"). Determina el orden.
 * @property {string} sql    Contenido SQL completo a ejecutar.
 */

const CREATE_CONTROL_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    checksum    TEXT    NOT NULL,
    executed_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`

/**
 * Calcula el checksum SHA-256 del contenido de una migracion.
 * Normaliza saltos de linea para que CRLF/LF no generen checksums distintos.
 *
 * @param {string} sql
 * @returns {string}
 */
function checksumOf(sql) {
  const normalized = sql.replace(/\r\n/g, '\n')
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex')
}

/**
 * Ejecuta migraciones pendientes en orden, en transaccion, registrando checksum.
 * Si un archivo ya aplicado tiene checksum distinto al guardado, lanza error
 * (deteccion de manipulacion de migracion historica).
 *
 * better-sqlite3 es sincrono: esta funcion tambien lo es.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {Migration[]} migrations
 * @returns {{ applied: string[], skipped: string[] }}
 */
export function runMigrations(db, migrations) {
  db.exec(CREATE_CONTROL_TABLE)

  const findByName = db.prepare('SELECT checksum FROM schema_migrations WHERE name = ?')
  const insertRecord = db.prepare(
    'INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)'
  )

  const sorted = [...migrations].sort((a, b) => a.name.localeCompare(b.name))
  const applied = []
  const skipped = []

  for (const migration of sorted) {
    const checksum = checksumOf(migration.sql)
    const existing = findByName.get(migration.name)

    if (existing) {
      if (existing.checksum !== checksum) {
        throw new Error(
          `Migration tampering detected: "${migration.name}" fue aplicada con ` +
            `checksum ${existing.checksum} pero el archivo actual tiene ${checksum}. ` +
            `Nunca modifiques migraciones ya aplicadas; crea una nueva.`
        )
      }
      skipped.push(migration.name)
      continue
    }

    const apply = db.transaction(() => {
      db.exec(migration.sql)
      insertRecord.run(migration.name, checksum)
    })
    apply()
    applied.push(migration.name)
  }

  return { applied, skipped }
}
