import {
  saleCreatedSchema,
  saleInputSchema,
  saleListSchema,
  saleWithItemsSchema,
} from '@/schemas/sale.schema.js'
import { unwrap } from './ipc.js'

/**
 * @param {import('@/schemas/sale.schema.js').SaleInput} saleInput
 * @returns {Promise<import('@/schemas/sale.schema.js').SaleCreated>}
 */
export async function create(saleInput) {
  const safe = saleInputSchema.parse(saleInput)
  const res = await window.api.sales.create(safe)
  return unwrap('sales:create', res, saleCreatedSchema)
}

/**
 * @param {number} id
 * @returns {Promise<import('@/schemas/sale.schema.js').SaleWithItems | null>}
 */
export async function getById(id) {
  const res = await window.api.sales.getById(id)
  return unwrap('sales:get-by-id', res, saleWithItemsSchema.nullable())
}

/**
 * @param {{ page?: number, pageSize?: number }} [opts]
 * @returns {Promise<import('@/schemas/sale.schema.js').SaleList>}
 */
export async function list(opts = {}) {
  const res = await window.api.sales.list(opts)
  return unwrap('sales:list', res, saleListSchema)
}
