/**
 * @param {ReturnType<typeof import('./returns.repository.js').createReturnsRepository>} repo
 * @param {ReturnType<typeof import('../sales/sales.repository.js').createSalesRepository>} salesRepo
 */
export function createReturnsService(repo, salesRepo) {
  return {
    list()        { return repo.findAll() },
    listBySale(saleId) {
      const rows = repo.findBySale(saleId)
      return rows.map(r => ({ ...r, items: repo.findItems(r.id) }))
    },
    getById(id) {
      const row = repo.findById(id)
      if (!row) throw Object.assign(new Error(`Devolución ${id} no encontrada`), { code: 'RET_NOT_FOUND' })
      return { ...row, items: repo.findItems(id) }
    },

    /**
     * @param {{
     *   saleId: number,
     *   reason: string,
     *   notes?: string,
     *   items: Array<{ saleItemId: number, productId: number, productName: string, qtyReturned: number, unitPrice: number }>,
     *   createdBy?: number,
     *   createdByName?: string,
     * }} input
     */
    create(input) {
      if (!input.reason?.trim() || input.reason.trim().length < 3) {
        throw Object.assign(new Error('El motivo debe tener al menos 3 caracteres'), { code: 'RET_INVALID' })
      }
      if (!Array.isArray(input.items) || input.items.length === 0) {
        throw Object.assign(new Error('Selecciona al menos un producto a devolver'), { code: 'RET_INVALID' })
      }
      for (const it of input.items) {
        if (!it.qtyReturned || it.qtyReturned <= 0) {
          throw Object.assign(new Error(`Cantidad inválida para ${it.productName}`), { code: 'RET_INVALID' })
        }
      }

      const sale = salesRepo.findSaleById(input.saleId)
      if (!sale) throw Object.assign(new Error(`Venta ${input.saleId} no encontrada`), { code: 'RET_INVALID' })
      if (sale.status === 'voided') throw Object.assign(new Error('No se puede devolver una venta anulada'), { code: 'RET_INVALID' })

      const mappedItems = input.items.map(it => ({
        sale_item_id: it.saleItemId,
        product_id:   it.productId,
        product_name: it.productName,
        qty_returned: it.qtyReturned,
        unit_price:   it.unitPrice,
        subtotal:     Math.round(it.qtyReturned * it.unitPrice * 100) / 100,
      }))

      const totalRefund = mappedItems.reduce((s, it) => s + it.subtotal, 0)

      const returnId = repo.createReturn({
        sale_id:         input.saleId,
        reason:          input.reason.trim(),
        notes:           input.notes?.trim() || null,
        total_refund:    Math.round(totalRefund * 100) / 100,
        created_by:      input.createdBy ?? null,
        created_by_name: input.createdByName ?? null,
      }, mappedItems)

      return repo.findById(returnId)
    },
  }
}
