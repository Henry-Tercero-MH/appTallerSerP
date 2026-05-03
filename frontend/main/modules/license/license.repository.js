/** @param {import('better-sqlite3').Database} db */
export function createLicenseRepository(db) {
  const stmts = {
    findToken: db.prepare(
      `SELECT id FROM license_tokens WHERE token_hash = ? AND used = 0`
    ),
    burnToken: db.prepare(
      `UPDATE license_tokens
          SET used = 1, used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ?`
    ),
  }

  return {
    findValidToken(hash)  { return stmts.findToken.get(hash) ?? null },
    burnToken(id)         { stmts.burnToken.run(id) },
  }
}
