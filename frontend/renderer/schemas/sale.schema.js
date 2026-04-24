import { z } from 'zod'
import { saleItemSchema, saleItemInputSchema } from './sale-item.schema.js'

/**
 * Venta persistida. Incluye columnas snapshot de impuesto (migracion 003).
 */
export const saleSchema = z.object({
  id:                z.number().int().positive(),
  subtotal:          z.number().nonnegative(),
  tax_rate_applied:  z.number().nonnegative(),
  tax_amount:        z.number().nonnegative(),
  total:             z.number().nonnegative(),
  currency_code:     z.string().min(1),
  date:              z.string(),
  items:             z.array(saleItemSchema).optional(),
})

/** @typedef {z.infer<typeof saleSchema>} Sale */

/**
 * Payload que el renderer envia a window.api.sales.create.
 *
 * Sin `total`: el main recalcula autoritativamente ignorando lo que el
 * cliente mande. El frontend muestra un preview pero la verdad final la
 * devuelve `saleCreatedSchema`.
 */
export const saleInputSchema = z.object({
  items: z.array(saleItemInputSchema).min(1, 'La venta debe tener al menos un item'),
})

/** @typedef {z.infer<typeof saleInputSchema>} SaleInput */

/**
 * Respuesta de sales:create con los valores efectivamente persistidos.
 * El renderer usa esto para mostrar al operador los montos finales
 * (que pueden diferir del preview por redondeo o cambio de tax_rate
 * entre que abrio el POS y cerro la venta).
 */
export const saleCreatedSchema = z.object({
  saleId:       z.number().int().positive(),
  subtotal:     z.number().nonnegative(),
  taxRate:      z.number().nonnegative(),
  taxAmount:    z.number().nonnegative(),
  total:        z.number().nonnegative(),
  currencyCode: z.string().min(1),
})

/** @typedef {z.infer<typeof saleCreatedSchema>} SaleCreated */
