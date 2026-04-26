/**
 * @typedef {Object} AuditEntry
 * @property {string} action
 * @property {string} [entity]
 * @property {number} [entityId]
 * @property {string} [description]
 * @property {object} [payload]
 * @property {number} [userId]
 * @property {string} [userName]
 */

/**
 * @typedef {Object} AuditRow
 * @property {number} id
 * @property {string} action
 * @property {string | null} entity
 * @property {number | null} entity_id
 * @property {string | null} description
 * @property {string | null} payload_json
 * @property {number | null} user_id
 * @property {string | null} user_name
 * @property {string} created_at
 */

const MAX_PAGE_SIZE = 200

/**
 * @param {import('better-sqlite3').Database} db
 */
export function createAuditRepository(db) {
  const stmts = {
    insert: db.prepare(`
      INSERT INTO audit_log (action, entity, entity_id, description, payload_json, user_id, user_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    selectPage: db.prepare(`
      SELECT id, action, entity, entity_id, description, payload_json, user_id, user_name, created_at
      FROM audit_log
      WHERE (:action IS NULL OR action = :action)
        AND (:entity IS NULL OR entity = :entity)
        AND (:from   IS NULL OR created_at >= :from)
        AND (:to     IS NULL OR created_at <= :to)
      ORDER BY id DESC
      LIMIT :limit OFFSET :offset
    `),
    countFiltered: db.prepare(`
      SELECT COUNT(*) AS total FROM audit_log
      WHERE (:action IS NULL OR action = :action)
        AND (:entity IS NULL OR entity = :entity)
        AND (:from   IS NULL OR created_at >= :from)
        AND (:to     IS NULL OR created_at <= :to)
    `),
  }

  return {
    /**
     * @param {AuditEntry} entry
     */
    log(entry) {
      stmts.insert.run(
        entry.action,
        entry.entity   ?? null,
        entry.entityId ?? null,
        entry.description ?? null,
        entry.payload  ? JSON.stringify(entry.payload) : null,
        entry.userId   ?? null,
        entry.userName ?? null,
      )
    },

    /**
     * @param {{ page?: number, pageSize?: number, action?: string, entity?: string, from?: string, to?: string }} opts
     * @returns {{ data: AuditRow[], total: number, page: number, pageSize: number }}
     */
    findPage(opts = {}) {
      const page     = (opts.page     ?? 1)
      const pageSize = Math.min(opts.pageSize ?? 50, MAX_PAGE_SIZE)
      const offset   = (page - 1) * pageSize
      const params   = {
        action: opts.action ?? null,
        entity: opts.entity ?? null,
        from:   opts.from   ?? null,
        to:     opts.to     ?? null,
        limit:  pageSize,
        offset,
      }
      const data  = /** @type {AuditRow[]} */ (stmts.selectPage.all(params))
      const total = /** @type {{ total: number }} */ (stmts.countFiltered.get(params)).total
      return { data, total, page, pageSize }
    },
  }
}
