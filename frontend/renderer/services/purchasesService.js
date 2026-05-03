import { unwrap } from './ipc.js'
import {
  supplierSchema, supplierListSchema,
  purchaseOrderSchema, purchaseOrderListSchema, purchaseOrderDetailSchema,
} from '@/schemas/purchases.schema.js'

// ── Suppliers ──────────────────────────────────────────────────────────────
export async function listSuppliers() {
  return unwrap('suppliers:list', await window.api.suppliers.list(), supplierListSchema)
}
/** @param {number} id */
export async function getSupplier(id) {
  return unwrap('suppliers:get', await window.api.suppliers.get(id), supplierSchema.nullable())
}
/** @param {import('@/types/api').SupplierRow} input @param {string} role */
export async function createSupplier(input, role) {
  return unwrap('suppliers:create', await window.api.suppliers.create(input, role), supplierSchema)
}
/** @param {number} id @param {Partial<import('@/types/api').SupplierRow>} input @param {string} role */
export async function updateSupplier(id, input, role) {
  return unwrap('suppliers:update', await window.api.suppliers.update(id, input, role), supplierSchema)
}
/** @param {number} id @param {boolean} active @param {string} role */
export async function setSupplierActive(id, active, role) {
  return unwrap('suppliers:set-active', await window.api.suppliers.setActive(id, active, role), supplierSchema)
}

// ── Orders ─────────────────────────────────────────────────────────────────
export async function listOrders() {
  return unwrap('purchases:list', await window.api.purchases.list(), purchaseOrderListSchema)
}
/** @param {number} id */
export async function getOrder(id) {
  return unwrap('purchases:get', await window.api.purchases.get(id), purchaseOrderDetailSchema)
}
/** @param {import('@/types/api').PurchaseCreateInput} input */
export async function createOrder(input) {
  return unwrap('purchases:create', await window.api.purchases.create(input), purchaseOrderSchema)
}
/** @param {number} id @param {string} role */
export async function markSent(id, role) {
  return unwrap('purchases:mark-sent', await window.api.purchases.markSent(id, role), purchaseOrderSchema)
}
/** @param {{ orderId: number, role: string }} input */
export async function getPriceVariations(input) {
  const res = await window.api.purchases.priceVariations(input)
  if (!res.ok) throw new Error(res.error?.message ?? 'Error al obtener variaciones')
  return /** @type {import('@/types/api').PurchaseItemVariation[]} */ (res.data)
}
/** @param {import('@/types/api').PurchaseReceiveInput} input */
export async function receiveOrder(input) {
  return unwrap('purchases:receive', await window.api.purchases.receive(input), purchaseOrderSchema)
}
/** @param {number} id @param {string} role */
export async function cancelOrder(id, role) {
  return unwrap('purchases:cancel', await window.api.purchases.cancel(id, role), purchaseOrderSchema)
}
