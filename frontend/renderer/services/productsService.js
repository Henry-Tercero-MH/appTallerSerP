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
 * Placeholder: hoy no existe products:get-by-id en el main. Lo dejamos
 * resolviendo por filtrado de la lista para que `useProduct` no quede
 * sin implementar. Sustituir cuando se agregue el handler IPC.
 *
 * @param {number} id
 * @returns {Promise<import('@/schemas/product.schema.js').Product | null>}
 */
export async function getById(id) {
  const all = await getAll()
  const found = all.find((p) => p.id === id)
  if (!found) return null
  return productSchema.parse(found)
}
