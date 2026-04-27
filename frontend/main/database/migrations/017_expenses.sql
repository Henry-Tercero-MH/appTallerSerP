-- Gastos / egresos operativos
CREATE TABLE IF NOT EXISTS expenses (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  category        TEXT    NOT NULL DEFAULT 'otros',
  description     TEXT    NOT NULL,
  amount          REAL    NOT NULL DEFAULT 0,
  payment_method  TEXT    NOT NULL DEFAULT 'cash',
  expense_date    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d','now','localtime')),
  notes           TEXT,
  created_by      INTEGER,
  created_by_name TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime'))
);
