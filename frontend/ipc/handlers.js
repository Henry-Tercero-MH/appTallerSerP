import { ipcMain } from 'electron'
import db from '../database/index.js'

export function setupIpcHandlers() {
  ipcMain.handle('get-products', () => {
    return db.prepare('SELECT * FROM products').all()
  })

  ipcMain.handle('search-products', (event, query) => {
    const search = `%${query}%`
    return db.prepare('SELECT * FROM products WHERE name LIKE ? OR code LIKE ?').all(search, search)
  })

  ipcMain.handle('create-sale', (event, saleData) => {
    const insertSale = db.prepare('INSERT INTO sales (total) VALUES (?)')
    const insertItem = db.prepare('INSERT INTO sale_items (sale_id, product_id, qty, price) VALUES (?, ?, ?, ?)')
    const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?')

    const transaction = db.transaction((sale) => {
      const info = insertSale.run(sale.total)
      const saleId = info.lastInsertRowid

      for (const item of sale.items) {
        insertItem.run(saleId, item.id, item.qty, item.price)
        updateStock.run(item.qty, item.id)
      }
      return saleId
    })

    return transaction(saleData)
  })
}
