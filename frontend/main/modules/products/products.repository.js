/**
 * @typedef {Object} ProductRow
 * @property {number}  id
 * @property {string}  code
 * @property {string}  name
 * @property {number}  price
 * @property {number}  stock
 * @property {string}  category
 * @property {string}  brand
 * @property {string}  location
 * @property {string}  condition
 * @property {number}  min_stock
 * @property {0|1}     is_active
 */

const COLS = 'id, code, name, price, stock, category, brand, location, condition, min_stock, is_active'

/**
 * @param {import('better-sqlite3').Database} db
 */
export function createProductsRepository(db) {
  const stmts = {
    selectAll: db.prepare(
      `SELECT ${COLS} FROM products ORDER BY name`
    ),
    selectActive: db.prepare(
      `SELECT ${COLS} FROM products WHERE is_active = 1 ORDER BY name`
    ),
    selectById: db.prepare(
      `SELECT ${COLS} FROM products WHERE id = ?`
    ),
    search: db.prepare(
      `SELECT ${COLS} FROM products
        WHERE (name LIKE ? OR code LIKE ? OR category LIKE ?)
        ORDER BY name`
    ),
    insert: db.prepare(
      `INSERT INTO products (code, name, price, stock, category, brand, location, condition, min_stock, is_active)
       VALUES (@code, @name, @price, @stock, @category, @brand, @location, @condition, @min_stock, 1)`
    ),
    update: db.prepare(
      `UPDATE products
          SET name      = @name,
              price     = @price,
              category  = @category,
              brand     = @brand,
              location  = @location,
              condition = @condition,
              min_stock = @min_stock
        WHERE id = @id`
    ),
    setActive: db.prepare(
      `UPDATE products SET is_active = @active WHERE id = @id`
    ),
    adjustStock: db.prepare(
      `UPDATE products SET stock = MAX(0, stock + @delta) WHERE id = @id`
    ),
  }

  return {
    /** @returns {ProductRow[]} */
    findAll() {
      return stmts.selectAll.all()
    },

    /** @returns {ProductRow[]} */
    findActive() {
      return stmts.selectActive.all()
    },

    /**
     * @param {number} id
     * @returns {ProductRow | undefined}
     */
    findById(id) {
      return stmts.selectById.get(id)
    },

    /**
     * @param {string} query
     * @returns {ProductRow[]}
     */
    search(query) {
      const like = `%${query}%`
      return stmts.search.all(like, like, like)
    },

    /**
     * @param {{ code: string, name: string, price: number, stock: number,
     *           category: string, brand: string, location: string,
     *           condition: string, min_stock: number }} data
     * @returns {number} new id
     */
    create(data) {
      const info = stmts.insert.run(data)
      return Number(info.lastInsertRowid)
    },

    /**
     * @param {number} id
     * @param {{ name: string, price: number, category: string, brand: string,
     *           location: string, condition: string, min_stock: number }} data
     */
    update(id, data) {
      stmts.update.run({ ...data, id })
    },

    /**
     * @param {number} id
     * @param {0|1} active
     */
    setActive(id, active) {
      stmts.setActive.run({ id, active })
    },

    /**
     * @param {number} id
     * @param {number} delta  positive = entrada, negative = salida
     */
    adjustStock(id, delta) {
      stmts.adjustStock.run({ id, delta })
    },
  }
}
