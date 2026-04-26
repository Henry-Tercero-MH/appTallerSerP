/**
 * @typedef {Object} UserRow
 * @property {number}      id
 * @property {string}      email
 * @property {string}      full_name
 * @property {string}      role
 * @property {string}      password_hash
 * @property {0|1}         active
 * @property {string|null} avatar
 * @property {string}      created_at
 * @property {string}      updated_at
 */

const COLS = 'id, email, full_name, role, active, avatar, created_at, updated_at'
const COLS_WITH_HASH = 'id, email, full_name, role, password_hash, active, avatar, created_at, updated_at'

/**
 * @param {import('better-sqlite3').Database} db
 */
export function createUsersRepository(db) {
  const stmts = {
    findAll: db.prepare(
      `SELECT ${COLS} FROM users ORDER BY role, full_name`
    ),
    findById: db.prepare(
      `SELECT ${COLS} FROM users WHERE id = ?`
    ),
    findByEmail: db.prepare(
      `SELECT ${COLS_WITH_HASH} FROM users WHERE email = ? COLLATE NOCASE`
    ),
    insert: db.prepare(
      `INSERT INTO users (email, full_name, role, password_hash)
       VALUES (@email, @full_name, @role, @password_hash)`
    ),
    update: db.prepare(
      `UPDATE users
          SET full_name  = @full_name,
              role       = @role,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = @id`
    ),
    updateAvatar: db.prepare(
      `UPDATE users
          SET avatar     = @avatar,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = @id`
    ),
    updatePassword: db.prepare(
      `UPDATE users
          SET password_hash = @password_hash,
              updated_at    = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = @id`
    ),
    setActive: db.prepare(
      `UPDATE users
          SET active     = @active,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = @id`
    ),
  }

  return {
    /** @returns {Omit<UserRow, 'password_hash'>[]} */
    findAll() {
      return stmts.findAll.all()
    },

    /**
     * @param {number} id
     * @returns {Omit<UserRow, 'password_hash'> | undefined}
     */
    findById(id) {
      return stmts.findById.get(id)
    },

    /**
     * Incluye password_hash — solo para login.
     * @param {string} email
     * @returns {UserRow | undefined}
     */
    findByEmailWithHash(email) {
      return stmts.findByEmail.get(email)
    },

    /**
     * @param {{ email: string, full_name: string, role: string, password_hash: string }} data
     * @returns {number}
     */
    create(data) {
      return Number(stmts.insert.run(data).lastInsertRowid)
    },

    /**
     * @param {number} id
     * @param {{ full_name: string, role: string }} data
     */
    update(id, data) {
      stmts.update.run({ ...data, id })
    },

    /**
     * @param {number} id
     * @param {string} password_hash
     */
    updatePassword(id, password_hash) {
      stmts.updatePassword.run({ id, password_hash })
    },

    /**
     * @param {number} id
     * @param {string|null} avatar  — base64 data-URL o null para borrar
     */
    updateAvatar(id, avatar) {
      stmts.updateAvatar.run({ id, avatar: avatar ?? null })
    },

    /**
     * @param {number} id
     * @param {0|1} active
     */
    setActive(id, active) {
      stmts.setActive.run({ id, active })
    },
  }
}
