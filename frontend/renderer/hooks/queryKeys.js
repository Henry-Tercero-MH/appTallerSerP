/**
 * Fabricas centralizadas de query keys. Centralizar evita que invalidaciones
 * y lecturas diverjan: si cambia la estructura de una key, cambia aqui y todo
 * lo demas lo hereda.
 */

export const productKeys = {
  all:    /** @type {const} */ (['products']),
  lists:  /** @type {const} */ (['products', 'list']),
  search: (/** @type {string} */ query) => /** @type {const} */ (['products', 'search', query]),
  detail: (/** @type {number} */ id) => /** @type {const} */ (['products', 'detail', id]),
}

export const saleKeys = {
  all:    /** @type {const} */ (['sales']),
  detail: (/** @type {number} */ id) => /** @type {const} */ (['sales', 'detail', id]),
}

export const settingsKeys = {
  all: /** @type {const} */ (['settings']),
}
