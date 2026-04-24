import { saleCreatedSchema, saleInputSchema } from '@/schemas/sale.schema.js'
import { unwrap } from './ipc.js'

/**
 * @param {import('@/schemas/sale.schema.js').SaleInput} saleInput
 * @returns {Promise<import('@/schemas/sale.schema.js').SaleCreated>}
 */
export async function create(saleInput) {
  // Validacion de salida: que el main no reciba payloads mal formados.
  const safe = saleInputSchema.parse(saleInput)
  const res = await window.api.sales.create(safe)
  return unwrap('sales:create', res, saleCreatedSchema)
}

/**
 * Placeholder hasta que el main exponga sales:get-by-id. Lanzar explicito
 * evita que el llamador crea que el feature existe.
 *
 * @param {number} _id
 * @returns {Promise<never>}
 */
export async function getById(_id) {
  throw new Error('sales.getById no implementado: falta handler IPC en el main (Prompt 1 pendiente)')
}
