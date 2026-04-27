-- Movimientos de inventario (kardex)
CREATE TABLE IF NOT EXISTS stock_movements (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id     INTEGER NOT NULL,
  product_name   TEXT    NOT NULL,
  type           TEXT    NOT NULL CHECK(type IN ('in','out','adjustment','sale','purchase','return')),
  qty            REAL    NOT NULL,
  qty_before     REAL    NOT NULL DEFAULT 0,
  qty_after      REAL    NOT NULL DEFAULT 0,
  reference_type TEXT,
  reference_id   INTEGER,
  notes          TEXT,
  created_by     INTEGER,
  created_by_name TEXT,
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, created_at DESC);
