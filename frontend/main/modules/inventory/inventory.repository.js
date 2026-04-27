/** @param {import('better-sqlite3').Database} db */
export function createInventoryRepository(db) {
  const stmts = {
    findMovements: db.prepare(`
      SELECT * FROM stock_movements
      WHERE (@product_id IS NULL OR product_id = @product_id)
      ORDER BY created_at DESC
      LIMIT @limit OFFSET @offset
    `),
    countMovements: db.prepare(`
      SELECT COUNT(*) AS total FROM stock_movements
      WHERE (@product_id IS NULL OR product_id = @product_id)
    `),
    insertMovement: db.prepare(`
      INSERT INTO stock_movements
        (product_id, product_name, type, qty, qty_before, qty_after, reference_type, reference_id, notes, created_by, created_by_name)
      VALUES
        (@product_id, @product_name, @type, @qty, @qty_before, @qty_after, @reference_type, @reference_id, @notes, @created_by, @created_by_name)
    `),
    getProductStock: db.prepare(`SELECT id, code, name, stock, min_stock, category, is_active FROM products WHERE is_active = 1 ORDER BY name ASC`),
    getProductById: db.prepare(`SELECT id, code, name, stock FROM products WHERE id = ?`),
    adjustStock: db.prepare(`UPDATE products SET stock = stock + ? WHERE id = ?`),
  }

  const logAdjustment = db.transaction((productId, delta, movement) => {
    const product = stmts.getProductById.get(productId)
    if (!product) throw Object.assign(new Error(`Producto ${productId} no encontrado`), { code: 'INV_NOT_FOUND' })
    const qtyBefore = product.stock
    stmts.adjustStock.run(delta, productId)
    const qtyAfter = qtyBefore + delta
    stmts.insertMovement.run({
      ...movement,
      product_id:   productId,
      product_name: product.name,
      qty:          Math.abs(delta),
      qty_before:   qtyBefore,
      qty_after:    qtyAfter,
    })
    return { qtyBefore, qtyAfter, productName: product.name }
  })

  return {
    getStock()             { return stmts.getProductStock.all() },
    findMovements({ productId = null, limit = 50, offset = 0 } = {}) {
      return stmts.findMovements.all({ product_id: productId, limit, offset })
    },
    countMovements(productId = null) {
      return stmts.countMovements.get({ product_id: productId }).total
    },
    logAdjustment,
  }
}
