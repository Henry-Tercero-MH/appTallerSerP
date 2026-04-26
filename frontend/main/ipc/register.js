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

  registerSettingsIpc(settings)
  registerProductsIpc(products)
  registerCustomersIpc(customers)
  registerSalesIpc(sales)
  registerUsersIpc(users)
  registerAuditIpc(audit)
  registerCashIpc(cash)
  registerPurchasesIpc(purchases)
}
