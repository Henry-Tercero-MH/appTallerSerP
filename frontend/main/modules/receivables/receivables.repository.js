/** @param {import('better-sqlite3').Database} db */
export function createReceivablesRepository(db) {
  const stmts = {
    findAll: db.prepare(`
      SELECT * FROM receivables ORDER BY
        CASE status WHEN 'pending' THEN 0 WHEN 'partial' THEN 1 ELSE 2 END,
        due_date ASC NULLS LAST, created_at DESC
    `),
    findById: db.prepare(`SELECT * FROM receivables WHERE id = ?`),
    findByCustomer: db.prepare(`SELECT * FROM receivables WHERE customer_id = ? ORDER BY created_at DESC`),

    insert: db.prepare(`
      INSERT INTO receivables
        (customer_id, customer_name, customer_nit, description, amount, due_date, notes, created_by, created_by_name)
      VALUES
        (@customer_id, @customer_name, @customer_nit, @description, @amount, @due_date, @notes, @created_by, @created_by_name)
    `),
    updateStatus: db.prepare(`
      UPDATE receivables
      SET status=@status, amount_paid=@amount_paid,
          updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
      WHERE id=@id
    `),
    cancel: db.prepare(`
      UPDATE receivables
      SET status='cancelled', updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
      WHERE id=?
    `),

    // payments
    findPayments: db.prepare(`SELECT * FROM receivable_payments WHERE receivable_id = ? ORDER BY created_at`),
    insertPayment: db.prepare(`
      INSERT INTO receivable_payments
        (receivable_id, amount, payment_method, notes, created_by, created_by_name)
      VALUES
        (@receivable_id, @amount, @payment_method, @notes, @created_by, @created_by_name)
    `),

    // pagos de hoy
    paymentsToday: db.prepare(`
      SELECT
        COALESCE(SUM(amount), 0)  AS total,
        COUNT(*)                  AS count
      FROM receivable_payments
      WHERE DATE(created_at) = DATE('now', 'localtime')
    `),

    // pagos en un rango de fechas
    paymentsForRange: db.prepare(`
      SELECT
        COALESCE(SUM(amount), 0)  AS total,
        COUNT(*)                  AS count
      FROM receivable_payments
      WHERE DATE(created_at) >= @from
        AND DATE(created_at) <= @to
    `),

    // summary
    summary: db.prepare(`
      SELECT
        COUNT(*)                                         AS total_count,
        COALESCE(SUM(amount),0)                          AS total_amount,
        COALESCE(SUM(amount_paid),0)                     AS total_paid,
        COALESCE(SUM(amount - amount_paid),0)            AS total_balance,
        COALESCE(SUM(CASE WHEN status='pending'  THEN amount - amount_paid ELSE 0 END),0) AS pending_balance,
        COALESCE(SUM(CASE WHEN status='partial'  THEN amount - amount_paid ELSE 0 END),0) AS partial_balance,
        COALESCE(SUM(CASE WHEN due_date < strftime('%Y-%m-%d','now') AND status IN ('pending','partial') THEN amount - amount_paid ELSE 0 END),0) AS overdue_balance
      FROM receivables WHERE status NOT IN ('cancelled','paid')
    `),
  }

  const applyPayment = db.transaction((receivableId, payment) => {
    stmts.insertPayment.run(payment)
    const row = stmts.findById.get(receivableId)
    const newPaid = (row.amount_paid ?? 0) + payment.amount
    const newStatus = newPaid >= row.amount ? 'paid' : 'partial'
    stmts.updateStatus.run({ id: receivableId, amount_paid: newPaid, status: newStatus })
    return stmts.findById.get(receivableId)
  })

  return {
    findAll()             { return stmts.findAll.all() },
    findById(id)          { return stmts.findById.get(id) ?? null },
    findByCustomer(id)    { return stmts.findByCustomer.all(id) },
    create(data)          { return Number(stmts.insert.run(data).lastInsertRowid) },
    cancel(id)            { stmts.cancel.run(id) },
    findPayments(id)      { return stmts.findPayments.all(id) },
    applyPayment,
    getSummary()          { return stmts.summary.get() },
    getPaymentsToday()    { return stmts.paymentsToday.get() },
    /** @param {{ from: string, to: string }} range */
    getPaymentsForRange({ from, to }) {
      return stmts.paymentsForRange.get({ from, to })
    },
  }
}
