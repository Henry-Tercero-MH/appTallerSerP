import { z } from 'zod'

/**
 * Schema alineado al esquema REAL de la DB (migracion 001_init.sql):
 *   products(id, code, name, price, stock)
 *
 * Campos del prompt original (sku, category_id, active, timestamps) vendran
 * en migraciones futuras. No se validan aqui hasta que existan columnas:
 * validar contra algo que no existe romperia todas las lecturas en runtime.
 */
export const productSchema = z.object({
  id:    z.number().int().positive(),
  code:  z.string().min(1),
  name:  z.string().min(1),
  price: z.number().nonnegative(),
  stock: z.number().int(), // puede ser negativo si allow_negative_stock=true
})

/** @typedef {z.infer<typeof productSchema>} Product */

export const productListSchema = z.array(productSchema)

/** @typedef {z.infer<typeof productListSchema>} ProductList */
