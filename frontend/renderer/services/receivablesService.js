import { unwrap } from './ipc.js'
import {
  receivableSchema, receivableListSchema,
  receivableDetailSchema, receivableSummarySchema, customerBalanceSchema,
} from '@/schemas/receivables.schema.js'

export async function listReceivables() {
  return unwrap('receivables:list', await window.api.receivables.list(), receivableListSchema)
}

export async function getReceivable(id) {
  return unwrap('receivables:get', await window.api.receivables.get(id), receivableDetailSchema)
}

export async function getSummary() {
  return unwrap('receivables:summary', await window.api.receivables.summary(), receivableSummarySchema)
}

export async function getPaymentsToday() {
  const res = await window.api.receivables.paymentsToday()
  if (!res.ok) throw new Error(res.error?.message ?? 'Error al obtener pagos de hoy')
  return /** @type {{ total: number, count: number }} */ (res.data)
}

/**
 * @param {{ from: string, to: string }} range  Formato YYYY-MM-DD
 */
export async function getPaymentsForRange(range) {
  const anyApi = /** @type {any} */ (window.api)
  const res = await anyApi.receivables.paymentsRange(range)
  if (!res.ok) throw new Error(res.error?.message ?? 'Error al obtener pagos del rango')
  return /** @type {{ total: number, count: number }} */ (res.data)
}

export async function createReceivable(input) {
  return unwrap('receivables:create', await window.api.receivables.create(input), receivableSchema)
}

export async function applyPayment(input) {
  return unwrap('receivables:apply-payment', await window.api.receivables.applyPayment(input), receivableSchema)
}

export async function cancelReceivable(id) {
  return unwrap('receivables:cancel', await window.api.receivables.cancel(id), receivableSchema)
}

export async function getCustomerBalance(customerId) {
  return unwrap('receivables:by-customer', await window.api.receivables.byCustomer(customerId), customerBalanceSchema)
}
