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
  lists:  /** @type {const} */ (['sales', 'list']),
  list:   (/** @type {{ page?: number, pageSize?: number }} */ opts) =>
    /** @type {const} */ (['sales', 'list', opts]),
  detail: (/** @type {number} */ id) => /** @type {const} */ (['sales', 'detail', id]),
}

export const customerKeys = {
  all:    /** @type {const} */ (['customers']),
  lists:  /** @type {const} */ (['customers', 'list']),
  search: (/** @type {string} */ query) => /** @type {const} */ (['customers', 'search', query]),
  detail: (/** @type {number} */ id) => /** @type {const} */ (['customers', 'detail', id]),
}

export const settingsKeys = {
  all: /** @type {const} */ (['settings']),
}
