import { unwrap } from './ipc.js'
import {
  receivableSchema, receivableListSchema,
  receivableDetailSchema, receivableSummarySchema,
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

export async function createReceivable(input) {
  return unwrap('receivables:create', await window.api.receivables.create(input), receivableSchema)
}

export async function applyPayment(input) {
  return unwrap('receivables:apply-payment', await window.api.receivables.applyPayment(input), receivableSchema)
}

export async function cancelReceivable(id) {
  return unwrap('receivables:cancel', await window.api.receivables.cancel(id), receivableSchema)
}
