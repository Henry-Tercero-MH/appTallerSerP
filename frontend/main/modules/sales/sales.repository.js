/**
 * @typedef {Object} SaleItemInput
 * @property {number} id     product_id
 * @property {number} qty
 * @property {number} price  precio unitario al que se vende
 */

/**
 * @typedef {Object} SaleRecord
 * @property {SaleItemInput[]} items
 * @property {number} subtotal
 * @property {number} taxRate           tasa snapshotada (ej. 0.12)
 * @property {number} taxAmount         monto snapshotado de impuesto
 * @property {number} total             subtotal + taxAmount (redondeado)
 * @property {string} currencyCode      ISO 4217 snapshotado (ej. "GTQ")
 */

/**
 * @param {import('better-sqlite3').Database} db
 */
export function createSalesRepository(db) {
  const stmts = {
    insertSale: db.prepare(
      `INSERT INTO sales (total, subtotal, tax_rate_applied, tax_amount, currency_code)
       VALUES (?, ?, ?, ?, ?)`
    ),
    insertItem: db.prepare(
      'INSERT INTO sale_items (sale_id, product_id, qty, price) VALUES (?, ?, ?, ?)'
    ),
    updateStock: db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?'),
  }

  /**
   * Inserta venta + items + descuenta stock en una unica transaccion.
   * @param {SaleRecord} record
   * @returns {number|bigint} id de la venta
   */
  const insertSale = db.transaction((record) => {
    const info = stmts.insertSale.run(
      record.total,
      record.subtotal,
      record.taxRate,
      record.taxAmount,
      record.currencyCode
    )
    const saleId = info.lastInsertRowid
    for (const item of record.items) {
      stmts.insertItem.run(saleId, item.id, item.qty, item.price)
      stmts.updateStock.run(item.qty, item.id)
    }
    return saleId
  })

  return { insertSale }
}
