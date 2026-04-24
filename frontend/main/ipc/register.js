import { getDb } from '../database/connection.js'
import { runMigrations } from '../database/migrator.js'

import { createSettingsRepository } from '../modules/settings/settings.repository.js'
import { createSettingsService }    from '../modules/settings/settings.service.js'
import { registerSettingsIpc }      from '../modules/settings/settings.ipc.js'

import { createProductsRepository } from '../modules/products/products.repository.js'
import { createProductsService }    from '../modules/products/products.service.js'
import { registerProductsIpc }      from '../modules/products/products.ipc.js'

import { createSalesRepository } from '../modules/sales/sales.repository.js'
import { createSalesService }    from '../modules/sales/sales.service.js'
import { registerSalesIpc }      from '../modules/sales/sales.ipc.js'

/**
 * Vite bundle-time glob: carga todas las migraciones como strings en el main
 * process. Elimina la dependencia de rutas en disco en producciones empaquetadas
 * (asar) y mantiene orden lexicografico por nombre de archivo.
 */
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
 *  1. Abre la DB con sus PRAGMAs.
 *  2. Corre migraciones pendientes.
 *  3. Instancia repos, services y registra handlers IPC por modulo.
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

  const salesRepo = createSalesRepository(db)
  const sales     = createSalesService(salesRepo, settings)

  registerSettingsIpc(settings)
  registerProductsIpc(products)
  registerSalesIpc(sales)
}
