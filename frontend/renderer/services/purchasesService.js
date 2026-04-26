import { unwrap } from './ipc.js'
import {
  supplierSchema, supplierListSchema,
  purchaseOrderSchema, purchaseOrderListSchema, purchaseOrderDetailSchema,
} from '@/schemas/purchases.schema.js'

// ── Suppliers ──────────────────────────────────────────────────────────────
export async function listSuppliers() {
  return unwrap('suppliers:list', await window.api.suppliers.list(), supplierListSchema)
}
export async function getSupplier(id) {
  return unwrap('suppliers:get', await window.api.suppliers.get(id), supplierSchema.nullable())
}
export async function createSupplier(input, role) {
  return unwrap('suppliers:create', await window.api.suppliers.create(input, role), supplierSchema)
}
export async function updateSupplier(id, input, role) {
  return unwrap('suppliers:update', await window.api.suppliers.update(id, input, role), supplierSchema)
}
export async function setSupplierActive(id, active, role) {
  return unwrap('suppliers:set-active', await window.api.suppliers.setActive(id, active, role), supplierSchema)
}

// ── Orders ─────────────────────────────────────────────────────────────────
export async function listOrders() {
  return unwrap('purchases:list', await window.api.purchases.list(), purchaseOrderListSchema)
}
export async function getOrder(id) {
  return unwrap('purchases:get', await window.api.purchases.get(id), purchaseOrderDetailSchema)
}
export async function createOrder(input) {
  return unwrap('purchases:create', await window.api.purchases.create(input), purchaseOrderSchema)
}
export async function markSent(id, role) {
  return unwrap('purchases:mark-sent', await window.api.purchases.markSent(id, role), purchaseOrderSchema)
}
export async function receiveOrder(input) {
  return unwrap('purchases:receive', await window.api.purchases.receive(input), purchaseOrderSchema)
}
export async function cancelOrder(id, role) {
  return unwrap('purchases:cancel', await window.api.purchases.cancel(id, role), purchaseOrderSchema)
}
