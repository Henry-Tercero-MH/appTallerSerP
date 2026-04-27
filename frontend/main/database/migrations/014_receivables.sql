-- Cuentas por cobrar
CREATE TABLE IF NOT EXISTS receivables (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id   INTEGER,
  customer_name TEXT    NOT NULL,
  customer_nit  TEXT,
  description   TEXT    NOT NULL,
  amount        REAL    NOT NULL DEFAULT 0,
  amount_paid   REAL    NOT NULL DEFAULT 0,
  due_date      TEXT,
  status        TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','partial','paid','cancelled')),
  notes         TEXT,
  created_by    INTEGER,
  created_by_name TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime'))
);

-- Pagos aplicados a cada cuenta
CREATE TABLE IF NOT EXISTS receivable_payments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  receivable_id   INTEGER NOT NULL REFERENCES receivables(id),
  amount          REAL    NOT NULL,
  payment_method  TEXT    NOT NULL DEFAULT 'cash',
  notes           TEXT,
  created_by      INTEGER,
  created_by_name TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime'))
);
