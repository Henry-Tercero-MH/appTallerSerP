/** @param {ReturnType<typeof import('./purchases.repository.js').createPurchasesRepository>} repo */
export function createPurchasesService(repo) {

  function assertAdmin(role) {
    if (role !== 'admin') {
      throw Object.assign(new Error('Solo el administrador puede gestionar compras'), { code: 'PURCHASES_FORBIDDEN' })
    }
  }

  return {
    // ── Suppliers ────────────────────────────────────────────────────────
    listSuppliers() {
      return repo.findAllSuppliers()
    },

    getSupplier(id) {
      return repo.findSupplierById(id) ?? null
    },

    createSupplier(input, role) {
      assertAdmin(role)
      const name = (input.name ?? '').trim()
      if (!name) throw Object.assign(new Error('Nombre del proveedor requerido'), { code: 'SUPPLIER_MISSING_NAME' })
      const id = repo.createSupplier({
        name,
        contact_name: input.contact_name?.trim() || null,
        phone:        input.phone?.trim()        || null,
        email:        input.email?.trim()        || null,
        address:      input.address?.trim()      || null,
        notes:        input.notes?.trim()        || null,
      })
      return repo.findSupplierById(id)
    },

    updateSupplier(id, input, role) {
      assertAdmin(role)
      const row = repo.findSupplierById(id)
      if (!row) throw Object.assign(new Error('Proveedor no encontrado'), { code: 'SUPPLIER_NOT_FOUND' })
      const name = (input.name ?? row.name).trim()
      if (!name) throw Object.assign(new Error('Nombre requerido'), { code: 'SUPPLIER_MISSING_NAME' })
      repo.updateSupplier(id, {
        name,
        contact_name: input.contact_name?.trim() ?? row.contact_name,
        phone:        input.phone?.trim()        ?? row.phone,
        email:        input.email?.trim()        ?? row.email,
        address:      input.address?.trim()      ?? row.address,
        notes:        input.notes?.trim()        ?? row.notes,
      })
      return repo.findSupplierById(id)
    },

    setSupplierActive(id, active, role) {
      assertAdmin(role)
      repo.setSupplierActive(id, active ? 1 : 0)
      return repo.findSupplierById(id)
    },

    // ── Purchase Orders ──────────────────────────────────────────────────
    listOrders() {
      return repo.findAllOrders()
    },

    getOrder(id) {
      const order = repo.findOrderById(id)
      if (!order) throw Object.assign(new Error('Orden no encontrada'), { code: 'ORDER_NOT_FOUND' })
      const items = repo.findItemsByOrder(id)
      return { order, items }
    },

    /**
     * @param {{ supplierId: number, notes?: string, items: { productId?: number, productName: string, productCode?: string, qtyOrdered: number, unitCost: number }[], userId: number, userName: string, role: string }} input
     */
    createOrder(input) {
      assertAdmin(input.role)
      if (!input.supplierId) throw Object.assign(new Error('Proveedor requerido'), { code: 'ORDER_MISSING_SUPPLIER' })
      if (!input.items?.length) throw Object.assign(new Error('Agrega al menos un producto'), { code: 'ORDER_EMPTY' })

      const orderId = repo.createOrder({
        supplier_id:     input.supplierId,
        notes:           input.notes?.trim() || null,
        created_by:      input.userId,
        created_by_name: input.userName,
      })

      for (const item of input.items) {
        if (!item.productName?.trim()) throw Object.assign(new Error('Nombre de producto requerido'), { code: 'ITEM_MISSING_NAME' })
        if (item.qtyOrdered <= 0) throw Object.assign(new Error('Cantidad debe ser mayor a 0'), { code: 'ITEM_INVALID_QTY' })
        repo.insertItem({
          order_id:     orderId,
          product_id:   item.productId   ?? null,
          product_name: item.productName.trim(),
          product_code: item.productCode?.trim() || null,
          qty_ordered:  item.qtyOrdered,
          unit_cost:    item.unitCost ?? 0,
        })
      }

      return repo.findOrderById(orderId)
    },

    markSent(id, role) {
      assertAdmin(role)
      const order = repo.findOrderById(id)
      if (!order) throw Object.assign(new Error('Orden no encontrada'), { code: 'ORDER_NOT_FOUND' })
      if (order.status !== 'draft') throw Object.assign(new Error('Solo se pueden enviar órdenes en borrador'), { code: 'ORDER_INVALID_STATUS' })
      repo.updateOrderStatus(id, 'sent', null, order.total_cost)
      return repo.findOrderById(id)
    },

    /**
     * Devuelve los items de la orden comparados con el costo actual en catálogo.
     * Útil para mostrar al usuario si hay variaciones de precio antes de confirmar.
     * @param {{ orderId: number, role: string }} input
     */
    priceVariations(input) {
      assertAdmin(input.role)
      const order = repo.findOrderById(input.orderId)
      if (!order) throw Object.assign(new Error('Orden no encontrada'), { code: 'ORDER_NOT_FOUND' })
      return repo.priceVariations(input.orderId)
    },

    /**
     * Recibe la orden: actualiza stock. Si updatePrices=true también actualiza el costo.
     * @param {{ orderId: number, role: string, items: { id: number, qty_received: number }[], updatePrices?: boolean }} input
     */
    receiveOrder(input) {
      assertAdmin(input.role)
      const order = repo.findOrderById(input.orderId)
      if (!order) throw Object.assign(new Error('Orden no encontrada'), { code: 'ORDER_NOT_FOUND' })
      if (!['draft', 'sent'].includes(order.status)) {
        throw Object.assign(new Error('Esta orden ya fue recibida o cancelada'), { code: 'ORDER_INVALID_STATUS' })
      }
      if (!input.items?.length) throw Object.assign(new Error('Sin items para recibir'), { code: 'ORDER_EMPTY' })

      repo.receiveOrder(input.orderId, input.items, input.updatePrices ?? false)
      return repo.findOrderById(input.orderId)
    },

    cancelOrder(id, role) {
      assertAdmin(role)
      const order = repo.findOrderById(id)
      if (!order) throw Object.assign(new Error('Orden no encontrada'), { code: 'ORDER_NOT_FOUND' })
      if (!['draft', 'sent'].includes(order.status)) {
        throw Object.assign(new Error('No se puede cancelar esta orden'), { code: 'ORDER_INVALID_STATUS' })
      }
      repo.cancelOrder(id)
      return repo.findOrderById(id)
    },
  }
}
