/**
 * @typedef {Object} ProductRow
 * @property {number} id
 * @property {string} code
 * @property {string} name
 * @property {number} price
 * @property {number} stock
 */

/**
 * @param {import('better-sqlite3').Database} db
 */
export function createProductsRepository(db) {
  const stmts = {
    selectAll:    db.prepare('SELECT id, code, name, price, stock FROM products'),
    selectById:   db.prepare('SELECT id, code, name, price, stock FROM products WHERE id = ?'),
    searchByName: db.prepare(
      'SELECT id, code, name, price, stock FROM products WHERE name LIKE ? OR code LIKE ?'
    ),
  }

  return {
    /** @returns {ProductRow[]} */
    findAll() {
      return stmts.selectAll.all()
    },

    /**
     * @param {number} id
     * @returns {ProductRow | undefined}
     */
    findById(id) {
      return stmts.selectById.get(id)
    },

    /**
     * Busca por substring en name o code.
     * @param {string} query
     * @returns {ProductRow[]}
     */
    search(query) {
      const like = `%${query}%`
      return stmts.searchByName.all(like, like)
    },
  }
}
