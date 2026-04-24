import { productListSchema, productSchema } from '@/schemas/product.schema.js'
import { unwrap } from './ipc.js'

/**
 * Capa plana sobre window.api.products.*. No usa hooks ni estado.
 * Cada funcion: invoca IPC -> unwrap -> schema -> devuelve datos tipados.
 */

/**
 * @returns {Promise<import('@/schemas/product.schema.js').ProductList>}
 */
export async function getAll() {
  const res = await window.api.products.list()
  return unwrap('products:list', res, productListSchema)
}

/**
 * @param {string} query
 * @returns {Promise<import('@/schemas/product.schema.js').ProductList>}
 */
export async function search(query) {
  const res = await window.api.products.search(query)
  return unwrap('products:search', res, productListSchema)
}

/**
 * @param {number} id
 * @returns {Promise<import('@/schemas/product.schema.js').Product | null>}
 */
export async function getById(id) {
  const res = await window.api.products.getById(id)
  return unwrap('products:get-by-id', res, productSchema.nullable())
}
