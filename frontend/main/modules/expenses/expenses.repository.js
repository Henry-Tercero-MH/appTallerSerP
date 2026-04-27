/** @param {import('better-sqlite3').Database} db */
export function createExpensesRepository(db) {
  const stmts = {
    findAll: db.prepare(`
      SELECT * FROM expenses ORDER BY expense_date DESC, created_at DESC
    `),
    findByRange: db.prepare(`
      SELECT * FROM expenses
      WHERE expense_date >= @from AND expense_date <= @to
      ORDER BY expense_date DESC, created_at DESC
    `),
    findById: db.prepare(`SELECT * FROM expenses WHERE id = ?`),
    insert: db.prepare(`
      INSERT INTO expenses
        (category, description, amount, payment_method, expense_date, notes, created_by, created_by_name)
      VALUES
        (@category, @description, @amount, @payment_method, @expense_date, @notes, @created_by, @created_by_name)
    `),
    update: db.prepare(`
      UPDATE expenses
      SET category=@category, description=@description, amount=@amount,
          payment_method=@payment_method, expense_date=@expense_date, notes=@notes
      WHERE id=@id
    `),
    remove: db.prepare(`DELETE FROM expenses WHERE id = ?`),
    summary: db.prepare(`
      SELECT
        COALESCE(SUM(amount),0)                                             AS total,
        COALESCE(SUM(CASE WHEN expense_date = strftime('%Y-%m-%d','now','localtime') THEN amount ELSE 0 END),0) AS today,
        COUNT(*)                                                            AS count
      FROM expenses
      WHERE expense_date >= @from AND expense_date <= @to
    `),
    byCategory: db.prepare(`
      SELECT category, COALESCE(SUM(amount),0) AS total, COUNT(*) AS count
      FROM expenses
      WHERE expense_date >= @from AND expense_date <= @to
      GROUP BY category ORDER BY total DESC
    `),
  }

  return {
    findAll()              { return stmts.findAll.all() },
    findByRange(from, to)  { return stmts.findByRange.all({ from, to }) },
    findById(id)           { return stmts.findById.get(id) ?? null },
    create(data)           { return Number(stmts.insert.run(data).lastInsertRowid) },
    update(id, data)       { stmts.update.run({ ...data, id }) },
    remove(id)             { stmts.remove.run(id) },
    getSummary(from, to)   { return stmts.summary.get({ from, to }) },
    getByCategory(from, to){ return stmts.byCategory.all({ from, to }) },
  }
}
