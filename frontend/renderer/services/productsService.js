import { productListSchema, productSchema } from '@/schemas/product.schema.js'
import { unwrap } from './ipc.js'

/** @returns {Promise<import('@/schemas/product.schema.js').ProductList>} */
export async function getAll() {
  const res = await window.api.products.list()
  return unwrap('products:list', res, productListSchema)
}

/** @returns {Promise<import('@/schemas/product.schema.js').ProductList>} */
export async function getAllActive() {
  const res = await window.api.products.listActive()
  return unwrap('products:list-active', res, productListSchema)
}

/** @param {string} query @returns {Promise<import('@/schemas/product.schema.js').ProductList>} */
export async function search(query) {
  const res = await window.api.products.search(query)
  return unwrap('products:search', res, productListSchema)
}

/** @param {number} id @returns {Promise<import('@/schemas/product.schema.js').Product | null>} */
export async function getById(id) {
  const res = await window.api.products.getById(id)
  return unwrap('products:get-by-id', res, productSchema.nullable())
}

/** @param {import('@/schemas/product.schema.js').ProductInput} input */
export async function create(input) {
  const res = await window.api.products.create(input)
  return unwrap('products:create', res, productSchema)
}

/**
 * @param {number} id
 * @param {Partial<import('@/schemas/product.schema.js').ProductInput>} patch
 */
export async function update(id, patch) {
  const res = await window.api.products.update(id, patch)
  return unwrap('products:update', res, productSchema)
}

/** @param {number} id */
export async function remove(id) {
  const res = await window.api.products.remove(id)
  return unwrap('products:remove', res, productSchema.pick({ id: true }).extend({ id: productSchema.shape.id }))
}

/** @param {number} id */
export async function restore(id) {
  const res = await window.api.products.restore(id)
  return unwrap('products:restore', res, productSchema.pick({ id: true }).extend({ id: productSchema.shape.id }))
}

/**
 * @param {number} id
 * @param {'entry'|'exit'} type
 * @param {number} qty
 */
export async function adjustStock(id, type, qty) {
  const res = await window.api.products.adjustStock(id, type, qty)
  return unwrap('products:adjust-stock', res, productSchema)
}
