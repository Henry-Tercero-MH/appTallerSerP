/** @param {import('better-sqlite3').Database} db */
export function createReturnsRepository(db) {
  const stmts = {
    findAll:   db.prepare(`SELECT * FROM returns ORDER BY created_at DESC`),
    findBySale: db.prepare(`SELECT * FROM returns WHERE sale_id = ? ORDER BY created_at DESC`),
    findById:  db.prepare(`SELECT * FROM returns WHERE id = ?`),
    findItems: db.prepare(`SELECT * FROM return_items WHERE return_id = ?`),

    insertReturn: db.prepare(`
      INSERT INTO returns (sale_id, reason, notes, total_refund, created_by, created_by_name)
      VALUES (@sale_id, @reason, @notes, @total_refund, @created_by, @created_by_name)
    `),
    insertItem: db.prepare(`
      INSERT INTO return_items (return_id, sale_item_id, product_id, product_name, qty_returned, unit_price, subtotal)
      VALUES (@return_id, @sale_item_id, @product_id, @product_name, @qty_returned, @unit_price, @subtotal)
    `),
    restoreStock: db.prepare(`UPDATE products SET stock = stock + ? WHERE id = ?`),
  }

  const createReturn = db.transaction((header, items) => {
    const returnId = Number(stmts.insertReturn.run(header).lastInsertRowid)
    for (const it of items) {
      stmts.insertItem.run({ ...it, return_id: returnId })
      stmts.restoreStock.run(it.qty_returned, it.product_id)
    }
    return returnId
  })

  return {
    findAll()       { return stmts.findAll.all() },
    findBySale(sid) { return stmts.findBySale.all(sid) },
    findById(id)    { return stmts.findById.get(id) ?? null },
    findItems(id)   { return stmts.findItems.all(id) },
    createReturn,
  }
}
