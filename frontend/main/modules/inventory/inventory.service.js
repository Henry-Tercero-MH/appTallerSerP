/**
 * @param {ReturnType<typeof import('./inventory.repository.js').createInventoryRepository>} repo
 */
export function createInventoryService(repo) {
  return {
    getStock() {
      return repo.getStock()
    },

    getMovements({ productId, page = 1, pageSize = 50 } = {}) {
      const limit  = Math.min(pageSize, 200)
      const offset = (page - 1) * limit
      return {
        data:  repo.findMovements({ productId, limit, offset }),
        total: repo.countMovements(productId ?? null),
        page,
        pageSize: limit,
      }
    },

    /**
     * Ajuste manual de stock con registro en kardex.
     * @param {{ productId: number, type: 'in'|'out'|'adjustment', qty: number, notes?: string, createdBy?: number, createdByName?: string }} input
     */
    adjust(input) {
      const { productId, type, qty, notes, createdBy, createdByName } = input
      if (!Number.isInteger(productId) || productId <= 0) {
        throw Object.assign(new Error('Producto inválido'), { code: 'INV_INVALID' })
      }
      if (!['in', 'out', 'adjustment'].includes(type)) {
        throw Object.assign(new Error('Tipo de movimiento inválido'), { code: 'INV_INVALID' })
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        throw Object.assign(new Error('La cantidad debe ser mayor a 0'), { code: 'INV_INVALID' })
      }

      const delta = type === 'out' ? -qty : qty

      return repo.logAdjustment(productId, delta, {
        type,
        reference_type:  'manual',
        reference_id:    null,
        notes:           notes?.trim() || null,
        created_by:      createdBy ?? null,
        created_by_name: createdByName ?? null,
      })
    },
  }
}
