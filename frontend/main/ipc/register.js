import { ipcMain, dialog, app } from 'electron'
import path from 'path'
import { getDb } from '../database/connection.js'
import { runMigrations } from '../database/migrator.js'

import { createSettingsRepository } from '../modules/settings/settings.repository.js'
import { createSettingsService }    from '../modules/settings/settings.service.js'
import { registerSettingsIpc }      from '../modules/settings/settings.ipc.js'

import { createProductsRepository } from '../modules/products/products.repository.js'
import { createProductsService }    from '../modules/products/products.service.js'
import { registerProductsIpc }      from '../modules/products/products.ipc.js'

import { createCustomersRepository } from '../modules/customers/customers.repository.js'
import { createCustomersService }    from '../modules/customers/customers.service.js'
import { registerCustomersIpc }      from '../modules/customers/customers.ipc.js'

import { createSalesRepository } from '../modules/sales/sales.repository.js'
import { createSalesService }    from '../modules/sales/sales.service.js'
import { registerSalesIpc }      from '../modules/sales/sales.ipc.js'

import { createUsersRepository } from '../modules/users/users.repository.js'
import { createUsersService }    from '../modules/users/users.service.js'
import { registerUsersIpc }      from '../modules/users/users.ipc.js'

import { createAuditRepository } from '../modules/audit/audit.repository.js'
import { createAuditService }    from '../modules/audit/audit.service.js'
import { registerAuditIpc }      from '../modules/audit/audit.ipc.js'

import { createCashRepository } from '../modules/cash/cash.repository.js'
import { createCashService }    from '../modules/cash/cash.service.js'
import { registerCashIpc }      from '../modules/cash/cash.ipc.js'

import { createPurchasesRepository } from '../modules/purchases/purchases.repository.js'
import { createPurchasesService }    from '../modules/purchases/purchases.service.js'
import { registerPurchasesIpc }      from '../modules/purchases/purchases.ipc.js'

import { createReceivablesRepository } from '../modules/receivables/receivables.repository.js'
import { createReceivablesService }    from '../modules/receivables/receivables.service.js'
import { registerReceivablesIpc }      from '../modules/receivables/receivables.ipc.js'

import { createQuotesRepository } from '../modules/quotes/quotes.repository.js'
import { createQuotesService }    from '../modules/quotes/quotes.service.js'
import { registerQuotesIpc }      from '../modules/quotes/quotes.ipc.js'

import { createExpensesRepository } from '../modules/expenses/expenses.repository.js'
import { createExpensesService }    from '../modules/expenses/expenses.service.js'
import { registerExpensesIpc }      from '../modules/expenses/expenses.ipc.js'

import { createReturnsRepository } from '../modules/returns/returns.repository.js'
import { createReturnsService }    from '../modules/returns/returns.service.js'
import { registerReturnsIpc }      from '../modules/returns/returns.ipc.js'

import { createInventoryRepository } from '../modules/inventory/inventory.repository.js'
import { createInventoryService }    from '../modules/inventory/inventory.service.js'
import { registerInventoryIpc }      from '../modules/inventory/inventory.ipc.js'

import { startBackupSchedule, updateBackupSchedule, runBackup, listBackups } from '../database/backup.js'

const migrationModules = import.meta.glob('../database/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/**
 * @returns {import('../database/migrator.js').Migration[]}
 */
function loadMigrations() {
  return Object.entries(migrationModules).map(([path, sql]) => ({
    name: path.split('/').pop(),
    sql,
  }))
}

/**
 * Punto unico de inicializacion del main:
 *   1. Abre la DB con sus PRAGMAs.
 *   2. Corre migraciones pendientes.
 *   3. Instancia repos, services y registra handlers IPC por modulo.
 *
 * Llamar UNA vez, despues de `app.whenReady()`.
 */
export function bootstrap() {
  const db = getDb()

  const result = runMigrations(db, loadMigrations())
  console.log('[migrator] applied:', result.applied, 'skipped:', result.skipped)

  const settingsRepo = createSettingsRepository(db)
  const settings     = createSettingsService(settingsRepo)
  settings.init() // warmup del cache antes de registrar IPC

  const productsRepo = createProductsRepository(db)
  const products     = createProductsService(productsRepo)

  const customersRepo = createCustomersRepository(db)
  const customers     = createCustomersService(customersRepo)

  const auditRepo = createAuditRepository(db)
  const audit     = createAuditService(auditRepo)

  const salesRepo = createSalesRepository(db)
  const sales     = createSalesService(salesRepo, settings, customers, audit)

  const usersRepo = createUsersRepository(db)
  const users     = createUsersService(usersRepo)

  const cashRepo = createCashRepository(db)
  const cash     = createCashService(cashRepo)

  const purchasesRepo = createPurchasesRepository(db)
  const purchases     = createPurchasesService(purchasesRepo)

  const receivablesRepo = createReceivablesRepository(db)
  const receivables     = createReceivablesService(receivablesRepo)

  const quotesRepo = createQuotesRepository(db)
  const quotes     = createQuotesService(quotesRepo, settings, sales, receivables)

  const expensesRepo = createExpensesRepository(db)
  const expenses     = createExpensesService(expensesRepo)

  const returnsRepo = createReturnsRepository(db)
  const returns_    = createReturnsService(returnsRepo, salesRepo)

  const inventoryRepo = createInventoryRepository(db)
  const inventory     = createInventoryService(inventoryRepo)

  registerSettingsIpc(settings)
  registerProductsIpc(products)
  registerCustomersIpc(customers)
  registerSalesIpc(sales)
  registerUsersIpc(users)
  registerAuditIpc(audit)
  registerCashIpc(cash)
  registerPurchasesIpc(purchases)
  registerReceivablesIpc(receivables)
  registerQuotesIpc(quotes)
  registerExpensesIpc(expenses)
  registerReturnsIpc(returns_)
  registerInventoryIpc(inventory)

  // ── Backup ──────────────────────────────────────────────────
  const dbPath = path.join(app.getPath('userData'), 'taller_pos.sqlite')
  ipcMain.handle('db:get-path', () => ({ ok: true, data: dbPath }))

  // Backup manual con diálogo "Guardar como…"
  ipcMain.handle('db:backup', async () => {
    try {
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Guardar respaldo de base de datos',
        defaultPath: `backup_${new Date().toISOString().slice(0, 10)}.sqlite`,
        filters: [{ name: 'SQLite', extensions: ['sqlite'] }],
      })
      if (canceled || !filePath) return { ok: true, data: null }
      await db.backup(filePath)
      return { ok: true, data: filePath }
    } catch (err) {
      return { ok: false, error: { code: 'BACKUP_ERROR', message: err.message } }
    }
  })

  // Backup automático a userData/backups/ (llamado desde Settings o pruebas)
  ipcMain.handle('db:backup-now', async () => {
    try {
      const result = await runBackup(db)
      return { ok: true, data: result }
    } catch (err) {
      return { ok: false, error: { code: 'BACKUP_ERROR', message: err.message } }
    }
  })

  // Lista de backups automáticos disponibles
  ipcMain.handle('db:list-backups', () => {
    try {
      return { ok: true, data: listBackups() }
    } catch (err) {
      return { ok: false, error: { code: 'BACKUP_LIST_ERROR', message: err.message } }
    }
  })

  // Lee configuración de backup desde settings (defaults: 720 h · 10 copias)
  const intervalHours = Number(settings.get('backup_interval_hours') ?? 720) || 720
  const maxCopies     = Number(settings.get('backup_max_copies')     ?? 10)  || 10

  // Permite cambiar el intervalo en caliente desde la UI de Configuración
  ipcMain.handle('db:set-backup-interval', (_e, hours, copies) => {
    try {
      const h = Math.max(1, Number(hours) || intervalHours)
      const c = Math.max(1, Number(copies) || maxCopies)
      updateBackupSchedule(h, c)
      return { ok: true, data: { intervalHours: h, maxCopies: c } }
    } catch (err) {
      return { ok: false, error: { code: 'BACKUP_INTERVAL_ERROR', message: err.message } }
    }
  })

  // Arranca el scheduler con los valores configurados
  startBackupSchedule(db, intervalHours, maxCopies)
}
