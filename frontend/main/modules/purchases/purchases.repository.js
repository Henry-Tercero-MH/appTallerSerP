/**
 * @typedef {Object} SupplierRow
 * @property {number} id
 * @property {string} name
 * @property {string|null} contact_name
 * @property {string|null} phone
 * @property {string|null} email
 * @property {string|null} address
 * @property {string|null} notes
 * @property {0|1} active
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} PurchaseOrderRow
 * @property {number} id
 * @property {number} supplier_id
 * @property {string} supplier_name
 * @property {'draft'|'sent'|'received'|'cancelled'} status
 * @property {string|null} notes
 * @property {number|null} created_by
 * @property {string|null} created_by_name
 * @property {string} created_at
 * @property {string|null} received_at
 * @property {number} total_cost
 */

/**
 * @typedef {Object} PurchaseItemRow
 * @property {number} id
 * @property {number} order_id
 * @property {number|null} product_id
 * @property {string} product_name
 * @property {string|null} product_code
 * @property {number} qty_ordered
 * @property {number} qty_received
 * @property {number} unit_cost
 */

/** @param {import('better-sqlite3').Database} db */
export function createPurchasesRepository(db) {
  const stmts = {
    // suppliers
    findAllSuppliers: db.prepare(
      `SELECT * FROM suppliers ORDER BY name`
    ),
    findSupplierById: db.prepare(
      `SELECT * FROM suppliers WHERE id = ?`
    ),
    insertSupplier: db.prepare(
      `INSERT INTO suppliers (name, contact_name, phone, email, address, notes)
       VALUES (@name, @contact_name, @phone, @email, @address, @notes)`
    ),
    updateSupplier: db.prepare(
      `UPDATE suppliers SET name=@name, contact_name=@contact_name, phone=@phone,
       email=@email, address=@address, notes=@notes,
       updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
       WHERE id=@id`
    ),
    setSupplierActive: db.prepare(
      `UPDATE suppliers SET active=@active,
       updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
       WHERE id=@id`
    ),

    // purchase orders
    findAllOrders: db.prepare(
      `SELECT po.*, s.name AS supplier_name
         FROM purchase_orders po
         JOIN suppliers s ON s.id = po.supplier_id
        ORDER BY po.created_at DESC LIMIT 200`
    ),
    findOrderById: db.prepare(
      `SELECT po.*, s.name AS supplier_name
         FROM purchase_orders po
         JOIN suppliers s ON s.id = po.supplier_id
        WHERE po.id = ?`
    ),
    findOrdersBySupplier: db.prepare(
      `SELECT po.*, s.name AS supplier_name
         FROM purchase_orders po
         JOIN suppliers s ON s.id = po.supplier_id
        WHERE po.supplier_id = ?
        ORDER BY po.created_at DESC`
    ),
    insertOrder: db.prepare(
      `INSERT INTO purchase_orders (supplier_id, notes, created_by, created_by_name)
       VALUES (@supplier_id, @notes, @created_by, @created_by_name)`
    ),
    updateOrderStatus: db.prepare(
      `UPDATE purchase_orders SET status=@status, received_at=@received_at,
       total_cost=@total_cost WHERE id=@id`
    ),
    cancelOrder: db.prepare(
      `UPDATE purchase_orders SET status='cancelled' WHERE id=? AND status IN ('draft','sent')`
    ),

    // purchase items
    findItemsByOrder: db.prepare(
      `SELECT * FROM purchase_items WHERE order_id = ?`
    ),
    insertItem: db.prepare(
      `INSERT INTO purchase_items (order_id, product_id, product_name, product_code, qty_ordered, unit_cost)
       VALUES (@order_id, @product_id, @product_name, @product_code, @qty_ordered, @unit_cost)`
    ),
    updateItemReceived: db.prepare(
      `UPDATE purchase_items SET qty_received=@qty_received WHERE id=@id`
    ),

    // stock update on receive
    addStock: db.prepare(
      `UPDATE products SET stock = stock + @qty WHERE id = @id`
    ),
    updateProductCost: db.prepare(
      `UPDATE products SET cost = @cost WHERE id = @id`
    ),
    getProductForMove: db.prepare(
      `SELECT id, name, stock, cost FROM products WHERE id = ?`
    ),
    insertMovement: db.prepare(`
      INSERT INTO stock_movements
        (product_id, product_name, type, qty, qty_before, qty_after, reference_type, reference_id, notes, created_by, created_by_name)
      VALUES
        (@product_id, @product_name, @type, @qty, @qty_before, @qty_after, @reference_type, @reference_id, @notes, @created_by, @created_by_name)
    `),
  }

  return {
    // ── Suppliers ──────────────────────────────────────────────────────────
    findAllSuppliers() { return stmts.findAllSuppliers.all() },
    findSupplierById(id) { return stmts.findSupplierById.get(id) },
    createSupplier(data) {
      return Number(stmts.insertSupplier.run(data).lastInsertRowid)
    },
    updateSupplier(id, data) { stmts.updateSupplier.run({ ...data, id }) },
    setSupplierActive(id, active) { stmts.setSupplierActive.run({ id, active }) },

    // ── Orders ─────────────────────────────────────────────────────────────
    findAllOrders() { return stmts.findAllOrders.all() },
    findOrderById(id) { return stmts.findOrderById.get(id) },
    findOrdersBySupplier(supplierId) { return stmts.findOrdersBySupplier.all(supplierId) },
    createOrder(data) {
      return Number(stmts.insertOrder.run(data).lastInsertRowid)
    },
    updateOrderStatus(id, status, receivedAt, totalCost) {
      stmts.updateOrderStatus.run({ id, status, received_at: receivedAt ?? null, total_cost: totalCost })
    },
    cancelOrder(id) { stmts.cancelOrder.run(id) },

    // ── Items ──────────────────────────────────────────────────────────────
    findItemsByOrder(orderId) { return stmts.findItemsByOrder.all(orderId) },
    insertItem(data) {
      return Number(stmts.insertItem.run(data).lastInsertRowid)
    },

    // ── Receive (transaction) ──────────────────────────────────────────────
    /**
     * Marca orden como recibida, actualiza qty_received en items y suma al stock.
     * @param {number} orderId
     * @param {{ id: number, qty_received: number }[]} receivedItems
     * @param {boolean} updatePrices  Si true actualiza el costo del producto al costo de la orden
     */
    receiveOrder: db.transaction((orderId, receivedItems, updatePrices) => {
      let total = 0
      for (const item of receivedItems) {
        stmts.updateItemReceived.run(item)
        /** @type {PurchaseItemRow} */
        const row = stmts.findItemsByOrder.all(orderId).find(i => i.id === item.id)
        if (row?.product_id && item.qty_received > 0) {
          const prod      = stmts.getProductForMove.get(row.product_id)
          const qtyBefore = prod?.stock ?? 0
          stmts.addStock.run({ id: row.product_id, qty: item.qty_received })
          if (updatePrices && row.unit_cost > 0) {
            stmts.updateProductCost.run({ id: row.product_id, cost: row.unit_cost })
          }
          stmts.insertMovement.run({
            product_id:      row.product_id,
            product_name:    prod?.name ?? row.product_name,
            type:            'purchase',
            qty:             item.qty_received,
            qty_before:      qtyBefore,
            qty_after:       qtyBefore + item.qty_received,
            reference_type:  'purchase',
            reference_id:    orderId,
            notes:           null,
            created_by:      null,
            created_by_name: null,
          })
        }
        total += (row?.unit_cost ?? 0) * item.qty_received
      }
      const receivedAt = new Date().toISOString().slice(0, 19).replace('T', ' ')
      stmts.updateOrderStatus.run({ id: orderId, status: 'received', received_at: receivedAt, total_cost: total })
    }),

    /**
     * Devuelve los items de una orden con el costo actual del producto en catálogo,
     * para detectar variaciones antes de confirmar recepción.
     * @param {number} orderId
     */
    priceVariations(orderId) {
      /** @type {PurchaseItemRow[]} */
      const items = stmts.findItemsByOrder.all(orderId)
      return items.map(it => {
        if (!it.product_id) return { ...it, current_cost: null, has_variation: false }
        const prod = /** @type {{ cost: number }|undefined} */ (stmts.getProductForMove.get(it.product_id))
        const currentCost = prod?.cost ?? 0
        return {
          ...it,
          current_cost:  currentCost,
          has_variation: it.unit_cost > 0 && Math.abs(it.unit_cost - currentCost) > 0.001,
        }
      })
    },
  }
}
