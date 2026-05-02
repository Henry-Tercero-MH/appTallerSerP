/**
 * @typedef {Object} CategoryRow
 * @property {number} id
 * @property {string} name
 * @property {0|1}    is_active
 */

/** @param {import('better-sqlite3').Database} db */
export function createCategoriesRepository(db) {
  const stmts = {
    findAll:    db.prepare('SELECT id, name, is_active FROM categories ORDER BY name'),
    findActive: db.prepare('SELECT id, name FROM categories WHERE is_active = 1 ORDER BY name'),
    insert:     db.prepare('INSERT INTO categories (name) VALUES (@name)'),
    update:     db.prepare('UPDATE categories SET name = @name WHERE id = @id'),
    setActive:  db.prepare('UPDATE categories SET is_active = @active WHERE id = @id'),
  }

  return {
    /** @returns {CategoryRow[]} */
    findAll() { return stmts.findAll.all() },
    /** @returns {Pick<CategoryRow,'id'|'name'>[]} */
    findActive() { return stmts.findActive.all() },
    /** @param {string} name @returns {number} */
    create(name) { return Number(stmts.insert.run({ name }).lastInsertRowid) },
    /** @param {number} id @param {string} name */
    update(id, name) { stmts.update.run({ id, name }) },
    /** @param {number} id @param {0|1} active */
    setActive(id, active) { stmts.setActive.run({ id, active }) },
  }
}
