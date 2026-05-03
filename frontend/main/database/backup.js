/**
 * Servicio de backups automáticos de la base de datos.
 *
 * - Usa la API de Hot Backup de SQLite (db.backup()) — seguro con la DB abierta.
 * - Guarda en: userData/backups/backup_YYYY-MM-DDTHH-MM-SS.sqlite
 * - El intervalo y el máximo de copias son configurables en tiempo de ejecución.
 * - Por defecto: mensual (720 h) · máximo 10 copias.
 */

import fs   from 'node:fs'
import path from 'node:path'
import _electron from 'electron'
const { app } = _electron
import { closeDb } from './connection.js'

/** @type {ReturnType<typeof setInterval> | null} */
let _timer = null

/** @type {import('better-sqlite3').Database | null} */
let _db = null

let _maxCopies = 10

/** Ruta de la carpeta de backups dentro de userData. */
function backupDir() {
  return path.join(app.getPath('userData'), 'backups')
}

/** Crea la carpeta si no existe y la devuelve. */
function ensureDir() {
  const dir = backupDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** ISO timestamp seguro para nombres de archivo. */
function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

/** Elimina los backups más antiguos cuando se supera el límite. */
function prune(dir) {
  const files = fs.readdirSync(dir)
    .filter(f => f.startsWith('backup_') && f.endsWith('.sqlite'))
    .sort() // ISO → orden cronológico correcto
  while (files.length > _maxCopies) {
    try { fs.unlinkSync(path.join(dir, files.shift())) } catch { /* ignorar */ }
  }
}

/**
 * Ejecuta un backup inmediato.
 * @param {import('better-sqlite3').Database} db
 * @returns {Promise<{ filename: string, path: string, size: number }>}
 */
export async function runBackup(db) {
  const dir      = ensureDir()
  const filename = `backup_${stamp()}.sqlite`
  const dest     = path.join(dir, filename)

  await db.backup(dest)
  prune(dir)

  const size = fs.statSync(dest).size
  console.log(`[backup] OK → ${filename} (${(size / 1024).toFixed(1)} KB)`)
  return { filename, path: dest, size }
}

/**
 * Lista todos los backups automáticos, del más reciente al más antiguo.
 * @returns {{ filename: string, path: string, size: number, createdAt: string }[]}
 */
export function listBackups() {
  const dir = backupDir()
  if (!fs.existsSync(dir)) return []

  return fs.readdirSync(dir)
    .filter(f => f.startsWith('backup_') && f.endsWith('.sqlite'))
    .sort()
    .reverse()
    .map(filename => {
      const filepath = path.join(dir, filename)
      const stat     = fs.statSync(filepath)
      return {
        filename,
        path:      filepath,
        size:      stat.size,
        createdAt: stat.mtime.toISOString(),
      }
    })
}

/**
 * Inicia (o reinicia) el scheduler de backups automáticos.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} intervalHours  Horas entre backups (por defecto 720 = mensual)
 * @param {number} maxCopies      Máximo de copias a conservar (por defecto 10)
 */
export function startBackupSchedule(db, intervalHours = 720, maxCopies = 10) {
  _db        = db
  _maxCopies = maxCopies

  // Cancelar timer anterior si se reinicia con nuevo intervalo
  if (_timer) {
    clearInterval(_timer)
    _timer = null
  }

  const intervalMs = intervalHours * 3_600_000

  // Primer backup: 60 s después del arranque (app ya estable)
  setTimeout(() => runBackup(db).catch(err => console.error('[backup] error inicial:', err)), 60_000)

  // Revisamos cada hora si ya pasó el tiempo necesario para el próximo backup
  // para no sufrir de desbordamientos con setInterval mayores a 24.8 días
  let lastBackup = Date.now()
  _timer = setInterval(() => {
    if (Date.now() - lastBackup >= intervalMs) {
      lastBackup = Date.now()
      runBackup(db).catch(err => console.error('[backup] error periódico:', err))
    }
  }, 3_600_000)

  console.log(`[backup] scheduler activo — intervalo: ${intervalHours} h · máx: ${maxCopies} copias`)
}

/**
 * Restaura la base de datos desde un archivo .sqlite externo.
 * 1. Crea un respaldo de seguridad del estado actual antes de sobreescribir.
 * 2. Cierra la conexión para liberar el lock del archivo.
 * 3. Reemplaza el archivo de DB con el seleccionado.
 * Después de llamar esta función se debe relanzar la app.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} srcPath  Ruta absoluta del archivo .sqlite a restaurar
 * @returns {Promise<{ safetyBackup: string }>}
 */
export async function restoreFromFile(db, srcPath) {
  if (!fs.existsSync(srcPath)) throw new Error(`Archivo no encontrado: ${srcPath}`)

  const dir            = ensureDir()
  const safetyFilename = `pre-restore_${stamp()}.sqlite`
  const safetyPath     = path.join(dir, safetyFilename)

  // Respaldo de seguridad del estado actual antes de sobreescribir
  await db.backup(safetyPath)

  const dbPath = path.join(app.getPath('userData'), 'taller_pos.sqlite')

  // Cerrar conexión para liberar el lock (crítico en Windows)
  closeDb()

  fs.copyFileSync(srcPath, dbPath)
  console.log(`[backup] restaurado desde ${srcPath} → seguridad en ${safetyFilename}`)
  return { safetyBackup: safetyFilename }
}

/**
 * Actualiza el intervalo en caliente sin reiniciar la app.
 *
 * @param {number} intervalHours
 * @param {number} [maxCopies]
 */
export function updateBackupSchedule(intervalHours, maxCopies) {
  if (!_db) {
    console.warn('[backup] updateBackupSchedule llamado antes de startBackupSchedule')
    return
  }
  startBackupSchedule(_db, intervalHours, maxCopies ?? _maxCopies)
}
