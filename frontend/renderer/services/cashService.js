import { unwrap } from './ipc.js'
import {
  cashSessionSchema,
  cashSessionListSchema,
  cashSessionDetailSchema,
  cashMovementSchema,
} from '@/schemas/cash.schema.js'

export async function getOpenSession() {
  const res = await window.api.cash.getOpen()
  return unwrap('cash:get-open', res, cashSessionSchema.nullable())
}

export async function listSessions() {
  const res = await window.api.cash.list()
  return unwrap('cash:list', res, cashSessionListSchema)
}

export async function getSession(id) {
  const res = await window.api.cash.getSession(id)
  return unwrap('cash:get-session', res, cashSessionDetailSchema)
}

export async function openSession(input) {
  const res = await window.api.cash.open(input)
  return unwrap('cash:open', res, cashSessionSchema)
}

export async function closeSession(input) {
  const res = await window.api.cash.close(input)
  return unwrap('cash:close', res, cashSessionSchema)
}

export async function addMovement(input) {
  const res = await window.api.cash.addMovement(input)
  return unwrap('cash:add-movement', res, cashMovementSchema)
}
