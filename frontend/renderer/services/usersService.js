import { userSchema, userListSchema } from '@/schemas/user.schema.js'
import { unwrap } from './ipc.js'

export async function login(email, password) {
  const res = await window.api.users.login(email, password)
  return unwrap('users:login', res, userSchema)
}

export async function list() {
  const res = await window.api.users.list()
  return unwrap('users:list', res, userListSchema)
}

export async function getById(id) {
  const res = await window.api.users.getById(id)
  return unwrap('users:get-by-id', res, userSchema.nullable())
}

export async function create(input) {
  const res = await window.api.users.create(input)
  return unwrap('users:create', res, userSchema)
}

export async function update(id, patch) {
  const res = await window.api.users.update(id, patch)
  return unwrap('users:update', res, userSchema)
}

export async function changePassword(id, newPassword) {
  const res = await window.api.users.changePassword(id, newPassword)
  return unwrap('users:change-password', res, userSchema)
}

export async function setActive(id, active) {
  const res = await window.api.users.setActive(id, active)
  return unwrap('users:set-active', res, userSchema)
}

export async function updateAvatar(id, avatar) {
  const res = await window.api.users.updateAvatar(id, avatar)
  return unwrap('users:update-avatar', res, userSchema)
}
