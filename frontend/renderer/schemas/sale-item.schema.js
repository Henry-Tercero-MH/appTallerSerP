import { z } from 'zod'

/**
 * Linea de venta tal como la persiste la DB (tabla sale_items).
 * Columnas actuales: id, sale_id, product_id, qty, price.
 * `subtotal` se calcula en renderer para mostrar; no esta en DB.
 */
export const saleItemSchema = z.object({
  id:         z.number().int().positive(),
  sale_id:    z.number().int().positive(),
  product_id: z.number().int().positive(),
  qty:        z.number().int().positive(),
  price:      z.number().nonnegative(),
})

/** @typedef {z.infer<typeof saleItemSchema>} SaleItem */

/**
 * Item tal como lo envia el renderer al crear una venta (sin id, sin sale_id).
 * El main genera esos campos al insertar.
 */
export const saleItemInputSchema = z.object({
  id:    z.number().int().positive(),     // product_id en main; renombrar cuando se rediseñe createSale
  qty:   z.number().int().positive(),
  price: z.number().nonnegative(),
})

/** @typedef {z.infer<typeof saleItemInputSchema>} SaleItemInput */
