import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'

/** @type {import('better-sqlite3').Database | null} */
let instance = null

/**
 * Abre (o devuelve) la conexion SQLite de la app. Aplica PRAGMAs criticos:
 * WAL para concurrencia lectura/escritura, foreign_keys ON para integridad,
 * synchronous=NORMAL (seguro bajo WAL y notablemente mas rapido que FULL).
 *
 * @returns {import('better-sqlite3').Database}
 */
export function getDb() {
  if (instance) return instance

  const dbPath = path.join(app.getPath('userData'), 'taller_pos.sqlite')
  const db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')

  instance = db
  return db
}

/**
 * Cierra la conexion. Solo se usa en tests o al cerrar la app.
 */
export function closeDb() {
  if (instance) {
    instance.close()
    instance = null
  }
}
