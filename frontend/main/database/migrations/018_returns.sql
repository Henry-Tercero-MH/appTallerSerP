-- Devoluciones de ventas
CREATE TABLE IF NOT EXISTS returns (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id         INTEGER NOT NULL REFERENCES sales(id),
  reason          TEXT    NOT NULL,
  notes           TEXT,
  total_refund    REAL    NOT NULL DEFAULT 0,
  created_by      INTEGER,
  created_by_name TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime'))
);

CREATE TABLE IF NOT EXISTS return_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id     INTEGER NOT NULL REFERENCES returns(id),
  sale_item_id  INTEGER NOT NULL,
  product_id    INTEGER NOT NULL,
  product_name  TEXT    NOT NULL,
  qty_returned  REAL    NOT NULL DEFAULT 0,
  unit_price    REAL    NOT NULL DEFAULT 0,
  subtotal      REAL    NOT NULL DEFAULT 0
);
