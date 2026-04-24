/**
 * @typedef {Object} SaleItemInput
 * @property {number} id     product_id
 * @property {number} qty
 * @property {number} price
 */

/**
 * @typedef {Object} SaleRecord
 * @property {SaleItemInput[]} items
 * @property {number} subtotal
 * @property {number} taxRate
 * @property {number} taxAmount
 * @property {number} total
 * @property {string} currencyCode
 * @property {number} customerId
 * @property {string} customerNameSnapshot
 * @property {string} customerNitSnapshot
 */

/**
 * @typedef {Object} SaleRow
 * @property {number} id
 * @property {number} subtotal
 * @property {number} tax_rate_applied
 * @property {number} tax_amount
 * @property {number} total
 * @property {string} currency_code
 * @property {string} date
 * @property {number | null} customer_id
 * @property {string | null} customer_name_snapshot
 * @property {string | null} customer_nit_snapshot
 */

/**
 * @typedef {Object} SaleItemRow
 * @property {number} id
 * @property {number} sale_id
 * @property {number} product_id
 * @property {number} qty
 * @property {number} price
 * @property {string | null} product_code
 * @property {string | null} product_name
 */

/**
 * @typedef {Object} PageOptions
 * @property {number} limit
 * @property {number} offset
 */

const SALE_COLUMNS = `
  id, subtotal, tax_rate_applied, tax_amount, total, currency_code, date,
  customer_id, customer_name_snapshot, customer_nit_snapshot
`

/**
 * @param {import('better-sqlite3').Database} db
 */
export function createSalesRepository(db) {
  const stmts = {
    insertSale: db.prepare(
      `INSERT INTO sales (
         total, subtotal, tax_rate_applied, tax_amount, currency_code,
         customer_id, customer_name_snapshot, customer_nit_snapshot
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ),
    insertItem: db.prepare(
      'INSERT INTO sale_items (sale_id, product_id, qty, price) VALUES (?, ?, ?, ?)'
    ),
    updateStock: db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?'),

    selectById: db.prepare(`SELECT ${SALE_COLUMNS} FROM sales WHERE id = ?`),

    /**
     * LEFT JOIN a products para mostrar nombre/codigo actuales. NO es
     * snapshot; para el snapshot real a nivel linea, agregar columnas
     * product_code_snapshot/product_name_snapshot a sale_items en migracion
     * futura. Hoy vive como deuda conocida.
     */
    selectItems: db.prepare(
      `SELECT si.id, si.sale_id, si.product_id, si.qty, si.price,
              p.code AS product_code, p.name AS product_name
         FROM sale_items si
    LEFT JOIN products p ON p.id = si.product_id
        WHERE si.sale_id = ?
     ORDER BY si.id ASC`
    ),
    selectPage: db.prepare(
      `SELECT ${SALE_COLUMNS}
         FROM sales
     ORDER BY id DESC
        LIMIT ? OFFSET ?`
    ),
    countAll: db.prepare('SELECT COUNT(*) AS total FROM sales'),
  }

  /**
   * @param {SaleRecord} record
   * @returns {number|bigint}
   */
  const insertSale = db.transaction((record) => {
    const info = stmts.insertSale.run(
      record.total,
      record.subtotal,
      record.taxRate,
      record.taxAmount,
      record.currencyCode,
      record.customerId,
      record.customerNameSnapshot,
      record.customerNitSnapshot
    )
    const saleId = info.lastInsertRowid
    for (const item of record.items) {
      stmts.insertItem.run(saleId, item.id, item.qty, item.price)
      stmts.updateStock.run(item.qty, item.id)
    }
    return saleId
  })

  return {
    insertSale,

    /**
     * @param {number} id
     * @returns {SaleRow | undefined}
     */
    findSaleById(id) {
      return stmts.selectById.get(id)
    },

    /**
     * @param {number} saleId
     * @returns {SaleItemRow[]}
     */
    findSaleItems(saleId) {
      return stmts.selectItems.all(saleId)
    },

    /**
     * @param {PageOptions} opts
     * @returns {SaleRow[]}
     */
    findPage({ limit, offset }) {
      return stmts.selectPage.all(limit, offset)
    },

    /** @returns {number} */
    countAll() {
      const row = /** @type {{ total: number }} */ (stmts.countAll.get())
      return row.total
    },
  }
}
